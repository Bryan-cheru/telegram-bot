//+------------------------------------------------------------------+
//|                                           TelegramBotOrderManager.mq5 |
//|                                  Copyright 2025, Your Company |
//|                                             https://www.mql5.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, Your Company"
#property link      "https://www.mql5.com"
#property version   "1.00"

//--- Input parameters
input int    MagicNumber = 123456;           // Magic number for bot trades
input double TrailingStopDistance = 50;     // Trailing stop distance in points
input double BreakEvenDistance = 30;        // Break-even distance in points
input bool   EnableTrailingStop = true;     // Enable trailing stop
input bool   EnableBreakEven = true;        // Enable break-even
input bool   EnablePartialClose = true;     // Enable partial closes at targets
input double PartialClosePercent = 33.0;    // Percentage to close at each target
input int    CheckIntervalSeconds = 5;      // Check interval in seconds
input string LogFileName = "TelegramBot_Orders.log";  // Log file name

//--- Global variables
datetime lastCheck;
int fileHandle;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("🚀 Telegram Bot Order Manager EA started");
   Print("📊 Magic Number: ", MagicNumber);
   Print("🎯 Trailing Stop: ", EnableTrailingStop ? "Enabled" : "Disabled");
   Print("⚖️ Break Even: ", EnableBreakEven ? "Enabled" : "Disabled");
   Print("📈 Partial Close: ", EnablePartialClose ? "Enabled" : "Disabled");
   
   lastCheck = TimeCurrent();
   
   // Open log file
   fileHandle = FileOpen(LogFileName, FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(fileHandle != INVALID_HANDLE)
   {
      FileWrite(fileHandle, "=== Telegram Bot Order Manager Started ===");
      FileWrite(fileHandle, "Time: " + TimeToString(TimeCurrent()));
      FileClose(fileHandle);
   }
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("🛑 Telegram Bot Order Manager EA stopped. Reason: ", reason);
   LogToFile("=== EA Stopped. Reason: " + IntegerToString(reason) + " ===");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Check orders every X seconds instead of every tick
   if(TimeCurrent() - lastCheck >= CheckIntervalSeconds)
   {
      ManageTelegramBotOrders();
      lastCheck = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| Main order management function                                   |
//+------------------------------------------------------------------+
void ManageTelegramBotOrders()
{
   int totalPositions = PositionsTotal();
   
   for(int i = totalPositions - 1; i >= 0; i--)
   {
      if(PositionGetSymbol(i) == "")
         continue;
         
      ulong positionTicket = PositionGetTicket(i);
      
      if(PositionSelectByTicket(positionTicket))
      {
         // Check if this is a telegram bot position
         if(PositionGetInteger(POSITION_MAGIC) == MagicNumber)
         {
            string symbol = PositionGetString(POSITION_SYMBOL);
            ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
            double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
            double currentPrice = (posType == POSITION_TYPE_BUY) ? 
                                 SymbolInfoDouble(symbol, SYMBOL_BID) : 
                                 SymbolInfoDouble(symbol, SYMBOL_ASK);
            double volume = PositionGetDouble(POSITION_VOLUME);
            double profit = PositionGetDouble(POSITION_PROFIT);
            double sl = PositionGetDouble(POSITION_SL);
            double tp = PositionGetDouble(POSITION_TP);
            
            // Apply order management strategies
            if(EnableBreakEven)
               ApplyBreakEven(positionTicket, symbol, posType, openPrice, currentPrice, sl);
               
            if(EnableTrailingStop)
               ApplyTrailingStop(positionTicket, symbol, posType, currentPrice, sl);
               
            if(EnablePartialClose)
               CheckPartialClose(positionTicket, symbol, posType, openPrice, currentPrice, tp, volume);
               
            // Log position status
            LogPositionStatus(positionTicket, symbol, posType, volume, profit, currentPrice);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Apply break-even logic                                           |
//+------------------------------------------------------------------+
void ApplyBreakEven(ulong ticket, string symbol, ENUM_POSITION_TYPE posType, 
                   double openPrice, double currentPrice, double currentSL)
{
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double breakEvenTrigger = BreakEvenDistance * point;
   
   bool shouldBreakEven = false;
   double newSL = 0;
   
   if(posType == POSITION_TYPE_BUY)
   {
      if(currentPrice >= openPrice + breakEvenTrigger && 
         (currentSL == 0 || currentSL < openPrice))
      {
         shouldBreakEven = true;
         newSL = NormalizeDouble(openPrice + (5 * point), digits); // Small profit
      }
   }
   else if(posType == POSITION_TYPE_SELL)
   {
      if(currentPrice <= openPrice - breakEvenTrigger && 
         (currentSL == 0 || currentSL > openPrice))
      {
         shouldBreakEven = true;
         newSL = NormalizeDouble(openPrice - (5 * point), digits); // Small profit
      }
   }
   
   if(shouldBreakEven)
   {
      MqlTradeRequest request = {};
      MqlTradeResult result = {};
      
      request.action = TRADE_ACTION_SLTP;
      request.symbol = symbol;
      request.position = ticket;
      request.sl = newSL;
      request.tp = PositionGetDouble(POSITION_TP); // Keep existing TP
      
      if(OrderSend(request, result))
      {
         Print("✅ Break-even applied to position ", ticket, " at ", newSL);
         LogToFile("BREAK-EVEN: Position " + IntegerToString(ticket) + " moved to break-even at " + DoubleToString(newSL, digits));
      }
      else
      {
         Print("❌ Failed to apply break-even to position ", ticket, ". Error: ", GetLastError());
         LogToFile("ERROR: Break-even failed for position " + IntegerToString(ticket) + ". Error: " + IntegerToString(GetLastError()));
      }
   }
}

//+------------------------------------------------------------------+
//| Apply trailing stop logic                                        |
//+------------------------------------------------------------------+
void ApplyTrailingStop(ulong ticket, string symbol, ENUM_POSITION_TYPE posType, 
                      double currentPrice, double currentSL)
{
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double trailingDistance = TrailingStopDistance * point;
   
   bool shouldUpdateSL = false;
   double newSL = 0;
   
   if(posType == POSITION_TYPE_BUY)
   {
      newSL = NormalizeDouble(currentPrice - trailingDistance, digits);
      if(currentSL == 0 || newSL > currentSL)
         shouldUpdateSL = true;
   }
   else if(posType == POSITION_TYPE_SELL)
   {
      newSL = NormalizeDouble(currentPrice + trailingDistance, digits);
      if(currentSL == 0 || newSL < currentSL)
         shouldUpdateSL = true;
   }
   
   if(shouldUpdateSL)
   {
      MqlTradeRequest request = {};
      MqlTradeResult result = {};
      
      request.action = TRADE_ACTION_SLTP;
      request.symbol = symbol;
      request.position = ticket;
      request.sl = newSL;
      request.tp = PositionGetDouble(POSITION_TP); // Keep existing TP
      
      if(OrderSend(request, result))
      {
         Print("🔄 Trailing stop updated for position ", ticket, " to ", newSL);
         LogToFile("TRAILING: Position " + IntegerToString(ticket) + " trailing stop updated to " + DoubleToString(newSL, digits));
      }
   }
}

//+------------------------------------------------------------------+
//| Check for partial close opportunities                            |
//+------------------------------------------------------------------+
void CheckPartialClose(ulong ticket, string symbol, ENUM_POSITION_TYPE posType, 
                      double openPrice, double currentPrice, double tp, double volume)
{
   if(tp == 0 || volume <= 0.01) // Don't partial close if no TP or volume too small
      return;
      
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double profitPoints = 0;
   double tpPoints = 0;
   
   if(posType == POSITION_TYPE_BUY)
   {
      profitPoints = (currentPrice - openPrice) / point;
      tpPoints = (tp - openPrice) / point;
   }
   else
   {
      profitPoints = (openPrice - currentPrice) / point;
      tpPoints = (openPrice - tp) / point;
   }
   
   // Close partial volume when 50% of the way to TP
   if(profitPoints >= (tpPoints * 0.5) && volume > 0.02)
   {
      double closeVolume = NormalizeDouble(volume * (PartialClosePercent / 100.0), 2);
      
      if(PartialClosePosition(ticket, symbol, closeVolume))
      {
         Print("📊 Partial close executed for position ", ticket, ". Closed volume: ", closeVolume);
         LogToFile("PARTIAL-CLOSE: Position " + IntegerToString(ticket) + " partial close of " + DoubleToString(closeVolume, 2) + " lots");
      }
   }
}

//+------------------------------------------------------------------+
//| Execute partial position close                                   |
//+------------------------------------------------------------------+
bool PartialClosePosition(ulong ticket, string symbol, double volume)
{
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = symbol;
   request.position = ticket;
   request.volume = volume;
   request.type_filling = ORDER_FILLING_FOK;
   
   // Determine close type based on position type
   if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
      request.type = ORDER_TYPE_SELL;
   else
      request.type = ORDER_TYPE_BUY;
      
   request.price = (request.type == ORDER_TYPE_SELL) ? 
                   SymbolInfoDouble(symbol, SYMBOL_BID) : 
                   SymbolInfoDouble(symbol, SYMBOL_ASK);
   
   return OrderSend(request, result);
}

//+------------------------------------------------------------------+
//| Log position status                                              |
//+------------------------------------------------------------------+
void LogPositionStatus(ulong ticket, string symbol, ENUM_POSITION_TYPE posType, 
                      double volume, double profit, double currentPrice)
{
   static datetime lastLog = 0;
   
   // Log every 5 minutes to avoid spam
   if(TimeCurrent() - lastLog >= 300)
   {
      string posTypeStr = (posType == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      string logEntry = StringFormat("STATUS: #%d %s %s %.2f lots, Price: %.5f, Profit: $%.2f", 
                                    ticket, symbol, posTypeStr, volume, currentPrice, profit);
      LogToFile(logEntry);
      lastLog = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| Write to log file                                                |
//+------------------------------------------------------------------+
void LogToFile(string message)
{
   int handle = FileOpen(LogFileName, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_READ);
   if(handle != INVALID_HANDLE)
   {
      FileSeek(handle, 0, SEEK_END);
      FileWrite(handle, TimeToString(TimeCurrent()) + ": " + message);
      FileClose(handle);
   }
}

//+------------------------------------------------------------------+
//| Trade transaction function                                       |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                       const MqlTradeRequest& request,
                       const MqlTradeResult& result)
{
   // Log trade transactions for telegram bot orders
   if(request.magic == MagicNumber)
   {
      string transType = "";
      switch(trans.type)
      {
         case TRADE_TRANSACTION_DEAL_ADD:
            transType = "DEAL_ADD";
            break;
         case TRADE_TRANSACTION_DEAL_UPDATE:
            transType = "DEAL_UPDATE";
            break;
         case TRADE_TRANSACTION_DEAL_DELETE:
            transType = "DEAL_DELETE";
            break;
         case TRADE_TRANSACTION_ORDER_ADD:
            transType = "ORDER_ADD";
            break;
         case TRADE_TRANSACTION_ORDER_UPDATE:
            transType = "ORDER_UPDATE";
            break;
         case TRADE_TRANSACTION_ORDER_DELETE:
            transType = "ORDER_DELETE";
            break;
      }
      
      if(transType != "")
      {
         string logEntry = StringFormat("TRANSACTION: %s - Order: %d, Deal: %d, Symbol: %s, Volume: %.2f", 
                                       transType, trans.order, trans.deal, trans.symbol, trans.volume);
         LogToFile(logEntry);
         Print("📝 ", logEntry);
      }
   }
}
