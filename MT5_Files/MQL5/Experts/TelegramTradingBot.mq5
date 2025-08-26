//+------------------------------------------------------------------+
//|                                            TelegramTradingBot.mq5 |
//|                   Complete Telegram Trading Bot - All-in-One EA |
//|                     Copyright 2025, Telegram Trading Bot        |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, Telegram Trading Bot"
#property link      ""
#property version   "2.00"
#property strict

//--- Input parameters for Signal Processing
input string   TradeSignalsPath = "trade_signals\\";  // Path to trade signals folder
input int      CheckInterval = 5;     // Check for new signals every X seconds
input double   MaxSpreadPips = 3.0;   // Maximum spread allowed for execution
input bool     EnableTrading = true;  // Enable actual trading (false for testing)

//--- Input parameters for Position Management
input int      MagicNumber = 123456;           // Magic number for bot trades
input double   TrailingStopDistance = 50;     // Trailing stop distance in points
input double   BreakEvenDistance = 30;        // Break-even distance in points
input bool     EnableTrailingStop = true;     // Enable trailing stop
input bool     EnableBreakEven = true;        // Enable break-even
input bool     EnablePartialClose = true;     // Enable partial closes at targets
input double   PartialClosePercent = 33.0;    // Percentage to close at each target
input string   LogFileName = "TelegramBot_Complete.log";  // Log file name

//--- Global variables
string g_signalsFolder = "";
datetime g_lastCheck = 0;
datetime g_lastPositionCheck = 0;

//--- Trade Signal Data Structure
struct TradeSignalData
{
   string   symbol;
   string   action;        // "BUY" or "SELL"
   double   entryMin;
   double   entryMax;
   double   stopLoss;
   double   takeProfit;
   double   volume;
   string   signalId;
   string   timestamp;
};

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Set up the signals folder path
   g_signalsFolder = TerminalInfoString(TERMINAL_DATA_PATH) + "\\MQL5\\Files\\" + TradeSignalsPath;
   
   Print("=== Telegram Trading Bot (Complete) EA Initialized ===");
   Print("🔄 Signals folder: ", g_signalsFolder);
   Print("⏱️ Check interval: ", CheckInterval, " seconds");
   Print("💰 Trading enabled: ", EnableTrading ? "YES" : "NO (Testing mode)");
   Print("🎯 Magic Number: ", MagicNumber);
   Print("📈 Trailing Stop: ", EnableTrailingStop ? "Enabled" : "Disabled");
   Print("⚖️ Break Even: ", EnableBreakEven ? "Enabled" : "Disabled");
   Print("📊 Partial Close: ", EnablePartialClose ? "Enabled" : "Disabled");
   
   // Set timer for checking signals and managing positions
   if(!EventSetTimer(CheckInterval))
   {
      Print("Failed to set timer!");
      return INIT_FAILED;
   }
   
   // Check if folder exists (create it if needed)
   if(!FolderCreate(TradeSignalsPath, 0))
   {
      int error = GetLastError();
      if(error != 5019) // Folder already exists
      {
         Print("Warning: Could not create signals folder. Error: ", error);
      }
   }
   
   // Create executed folder
   if(!FolderCreate(TradeSignalsPath + "executed", 0))
   {
      int error = GetLastError();
      if(error != 5019) // Folder already exists
      {
         Print("Warning: Could not create executed folder. Error: ", error);
      }
   }
   
   // Initialize log file
   LogToFile("=== Telegram Trading Bot (Complete) Started ===");
   
   Print("✅ EA ready for signal processing and position management!");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   LogToFile("=== EA Stopped. Reason: " + IntegerToString(reason) + " ===");
   Print("🛑 Telegram Trading Bot (Complete) EA Stopped ===");
}

//+------------------------------------------------------------------+
//| Timer function - handles both signals and position management    |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Check for new signals
   CheckForNewSignals();
   
   // Manage existing positions
   if(TimeCurrent() - g_lastPositionCheck >= CheckInterval)
   {
      ManageExistingPositions();
      g_lastPositionCheck = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| Check for new trade signal files                                 |
//+------------------------------------------------------------------+
void CheckForNewSignals()
{
   string file_name;
   long search_handle = FileFindFirst(TradeSignalsPath + "*.json", file_name);
   
   if(search_handle == INVALID_HANDLE)
   {
      // No files found, this is normal
      return;
   }
   
   // Process all JSON files
   do
   {
      if(StringFind(file_name, ".json") > 0)
      {
         ProcessSignalFile(file_name);
      }
   }
   while(FileFindNext(search_handle, file_name));
   
   FileFindClose(search_handle);
}

//+------------------------------------------------------------------+
//| Process a single signal file                                     |
//+------------------------------------------------------------------+
void ProcessSignalFile(string fileName)
{
   string filePath = TradeSignalsPath + fileName;
   
   // Read the JSON file
   int fileHandle = FileOpen(filePath, FILE_READ | FILE_TXT);
   if(fileHandle == INVALID_HANDLE)
   {
      Print("❌ Error: Could not open file ", fileName, ". Error: ", GetLastError());
      return;
   }
   
   string jsonContent = "";
   while(!FileIsEnding(fileHandle))
   {
      jsonContent += FileReadString(fileHandle) + "\n";
   }
   FileClose(fileHandle);
   
   Print("📄 Processing signal file: ", fileName);
   LogToFile("Processing signal file: " + fileName);
   
   // Parse the JSON content
   TradeSignalData signalData;
   if(ParseTradeSignal(jsonContent, signalData))
   {
      // Execute the trade
      bool executed = ExecuteTradeFromSignal(signalData);
      
      if(executed)
      {
         // Move file to executed folder (simple approach)
         MoveToExecutedFolder(fileName);
      }
   }
   else
   {
      Print("❌ Error: Could not parse signal file ", fileName);
      LogToFile("ERROR: Could not parse signal file " + fileName);
   }
}

//+------------------------------------------------------------------+
//| Parse JSON trade signal                                          |
//+------------------------------------------------------------------+
bool ParseTradeSignal(string jsonContent, TradeSignalData &signal)
{
   // Extract symbol
   int pos = StringFind(jsonContent, "\"symbol\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 9);
      pos = StringFind(temp, "\"");
      if(pos >= 0)
      {
         temp = StringSubstr(temp, pos + 1);
         int endPos = StringFind(temp, "\"");
         if(endPos >= 0)
         {
            signal.symbol = StringSubstr(temp, 0, endPos);
         }
      }
   }
   
   // Extract action
   pos = StringFind(jsonContent, "\"action\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 9);
      pos = StringFind(temp, "\"");
      if(pos >= 0)
      {
         temp = StringSubstr(temp, pos + 1);
         int endPos = StringFind(temp, "\"");
         if(endPos >= 0)
         {
            signal.action = StringSubstr(temp, 0, endPos);
         }
      }
   }
   
   // Extract entry zone min
   pos = StringFind(jsonContent, "\"min\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 6);
      // Find the end of the number (comma, closing brace, or whitespace)
      int endPos = StringFind(temp, ",");
      if(endPos < 0) endPos = StringFind(temp, "}");
      if(endPos < 0) endPos = StringFind(temp, "\n");
      if(endPos > 0) temp = StringSubstr(temp, 0, endPos);
      signal.entryMin = StringToDouble(temp);
   }
   
   // Extract entry zone max
   pos = StringFind(jsonContent, "\"max\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 6);
      // Find the end of the number
      int endPos = StringFind(temp, ",");
      if(endPos < 0) endPos = StringFind(temp, "}");
      if(endPos < 0) endPos = StringFind(temp, "\n");
      if(endPos > 0) temp = StringSubstr(temp, 0, endPos);
      signal.entryMax = StringToDouble(temp);
   }
   
   // Extract stop loss
   pos = StringFind(jsonContent, "\"stopLoss\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 11);
      int endPos = StringFind(temp, ",");
      if(endPos < 0) endPos = StringFind(temp, "}");
      if(endPos < 0) endPos = StringFind(temp, "\n");
      if(endPos > 0) temp = StringSubstr(temp, 0, endPos);
      signal.stopLoss = StringToDouble(temp);
   }
   
   // Extract volume
   pos = StringFind(jsonContent, "\"volume\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 9);
      int endPos = StringFind(temp, ",");
      if(endPos < 0) endPos = StringFind(temp, "}");
      if(endPos < 0) endPos = StringFind(temp, "\n");
      if(endPos > 0) temp = StringSubstr(temp, 0, endPos);
      signal.volume = StringToDouble(temp);
   }
   
   // Set default volume if not specified
   if(signal.volume == 0)
   {
      signal.volume = 0.1; // Default volume
   }
   pos = StringFind(jsonContent, "\"targets\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 10);
      // Find the closing bracket of the targets array
      int startBracket = StringFind(temp, "[");
      int endBracket = StringFind(temp, "]");
      if(startBracket >= 0 && endBracket > startBracket)
      {
         string targetsStr = StringSubstr(temp, startBra cket + 1, endBracket - startBracket - 1);
         // Parse the first valid target (ignore 1, 2, etc.)
         string targetParts[];
         int count = StringSplit(targetsStr, ',', targetParts);
         
         for(int i = 0; i < count; i++)
         {
            double targetVal = StringToDouble(targetParts[i]);
            if(targetVal > 100) // Only take meaningful price targets, ignore 1, 2, etc.
            {
               signal.takeProfit = targetVal;
               break;
            }
         }
      }
   }
   
   // If no meaningful take profit found, calculate one based on risk-reward
   if(signal.takeProfit == 0 && signal.stopLoss > 0)
   {
      double riskDistance = MathAbs(signal.stopLoss - ((signal.entryMin + signal.entryMax) / 2));
      double entryMid = (signal.entryMin + signal.entryMax) / 2;
      
      if(signal.action == "SELL")
      {
         signal.takeProfit = entryMid - (riskDistance * 2); // 1:2 risk reward
      }
      else if(signal.action == "BUY")
      {
         signal.takeProfit = entryMid + (riskDistance * 2); // 1:2 risk reward
      }
   }
   
   // Extract signal ID
   pos = StringFind(jsonContent, "\"id\":");
   if(pos >= 0)
   {
      string temp = StringSubstr(jsonContent, pos + 5);
      pos = StringFind(temp, "\"");
      if(pos >= 0)
      {
         temp = StringSubstr(temp, pos + 1);
         int endPos = StringFind(temp, "\"");
         if(endPos >= 0)
         {
            signal.signalId = StringSubstr(temp, 0, endPos);
         }
      }
   }
   
   // Basic validation
   if(signal.symbol == "" || signal.action == "")
   {
      Print("❌ Error: Missing required fields in signal");
      return false;
   }
   
   // Validate stop loss logic
   double entryMid = (signal.entryMin + signal.entryMax) / 2;
   if(signal.action == "SELL")
   {
      if(signal.stopLoss <= entryMid)
      {
         Print("❌ Error: Invalid SELL stop loss. SL (", signal.stopLoss, ") must be ABOVE entry zone (", entryMid, ")");
         return false;
      }
   }
   else if(signal.action == "BUY")
   {
      if(signal.stopLoss >= entryMid)
      {
         Print("❌ Error: Invalid BUY stop loss. SL (", signal.stopLoss, ") must be BELOW entry zone (", entryMid, ")");
         return false;
      }
   }
   
   // Check if prices are realistic for the current market
   double currentPrice = (signal.action == "BUY") ? 
                        SymbolInfoDouble(signal.symbol, SYMBOL_ASK) : 
                        SymbolInfoDouble(signal.symbol, SYMBOL_BID);
   
   double priceDifference = MathAbs(currentPrice - entryMid);
   double priceRatio = priceDifference / currentPrice;
   
   if(priceRatio > 0.5) // If signal price is more than 50% different from current price
   {
      Print("⚠️ Warning: Signal price (", entryMid, ") very different from current price (", currentPrice, ")");
      Print("⚠️ This might be an old signal or wrong price format. Skipping execution.");
      return false;
   }
   
   Print("✅ Parsed signal - Symbol: ", signal.symbol, ", Action: ", signal.action, 
         ", Entry: ", signal.entryMin, "-", signal.entryMax, 
         ", SL: ", signal.stopLoss, ", Volume: ", signal.volume);
   
   LogToFile("Parsed signal: " + signal.symbol + " " + signal.action + " Entry: " + 
            DoubleToString(signal.entryMin) + "-" + DoubleToString(signal.entryMax) + 
            " SL: " + DoubleToString(signal.stopLoss));
   
   return true;
}

//+------------------------------------------------------------------+
//| Execute trade from signal                                        |
//+------------------------------------------------------------------+
bool ExecuteTradeFromSignal(TradeSignalData &signal)
{
   if(!EnableTrading)
   {
      Print("🔍 SIMULATION MODE: Would execute trade for ", signal.symbol, " ", signal.action);
      LogToFile("SIMULATION: " + signal.symbol + " " + signal.action);
      return true; // Simulate successful execution
   }
   
   // Check if symbol exists and is available
   if(!SymbolSelect(signal.symbol, true))
   {
      Print("❌ Error: Symbol ", signal.symbol, " not available");
      LogToFile("ERROR: Symbol " + signal.symbol + " not available");
      return false;
   }
   
   // Get current market prices
   double bid = SymbolInfoDouble(signal.symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(signal.symbol, SYMBOL_ASK);
   double spread = ask - bid;
   
   // Check spread
   double spreadPips = spread / SymbolInfoDouble(signal.symbol, SYMBOL_POINT);
   if(spreadPips > MaxSpreadPips)
   {
      Print("⚠️ Warning: Spread too high (", spreadPips, " pips). Skipping trade.");
      LogToFile("WARNING: High spread " + DoubleToString(spreadPips) + " pips for " + signal.symbol);
      return false;
   }
   
   // Determine entry price
   double entryPrice;
   ENUM_ORDER_TYPE orderType;
   
   if(signal.action == "BUY")
   {
      entryPrice = ask;
      orderType = ORDER_TYPE_BUY;
      
      // Check if current price is within entry zone
      if(ask < signal.entryMin || ask > signal.entryMax)
      {
         Print("ℹ️ Info: Price not in buy entry zone. Current: ", ask, 
               ", Entry zone: ", signal.entryMin, "-", signal.entryMax);
         return false; // Don't execute yet
      }
   }
   else if(signal.action == "SELL")
   {
      entryPrice = bid;
      orderType = ORDER_TYPE_SELL;
      
      // Check if current price is within entry zone
      if(bid < signal.entryMin || bid > signal.entryMax)
      {
         Print("ℹ️ Info: Price not in sell entry zone. Current: ", bid, 
               ", Entry zone: ", signal.entryMin, "-", signal.entryMax);
         return false; // Don't execute yet
      }
   }
   else
   {
      Print("❌ Error: Invalid action ", signal.action);
      return false;
   }
   
   // Prepare trade request
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = signal.symbol;
   request.volume = signal.volume;
   request.type = orderType;
   request.price = entryPrice;
   request.sl = signal.stopLoss;
   request.tp = signal.takeProfit; // Now properly set from targets array
   request.comment = "TelegramBot-" + signal.signalId;
   request.magic = MagicNumber;
   
   // Final validation of SL and TP distances
   double minStopLevel = SymbolInfoInteger(signal.symbol, SYMBOL_TRADE_STOPS_LEVEL) * SymbolInfoDouble(signal.symbol, SYMBOL_POINT);
   
   if(signal.action == "SELL")
   {
      if((request.sl - entryPrice) < minStopLevel)
      {
         Print("❌ Error: Stop loss too close to entry price. Minimum distance: ", minStopLevel);
         return false;
      }
   }
   else if(signal.action == "BUY")
   {
      if((entryPrice - request.sl) < minStopLevel)
      {
         Print("❌ Error: Stop loss too close to entry price. Minimum distance: ", minStopLevel);
         return false;
      }
   }
   
   // Send the order
   bool success = OrderSend(request, result);
   
   if(success && result.retcode == TRADE_RETCODE_DONE)
   {
      Print("🎉 Trade executed successfully!");
      Print("📊 Order ticket: ", result.order);
      Print("💰 Execution price: ", result.price);
      Print("📈 Volume: ", result.volume);
      
      LogToFile("TRADE EXECUTED: " + signal.symbol + " " + signal.action + 
               " Volume: " + DoubleToString(result.volume) + 
               " Price: " + DoubleToString(result.price) + 
               " Ticket: " + IntegerToString(result.order));
      
      return true;
   }
   else
   {
      Print("❌ Trade execution failed!");
      Print("🔴 Return code: ", result.retcode);
      Print("💬 Comment: ", result.comment);
      
      LogToFile("TRADE FAILED: " + signal.symbol + " " + signal.action + 
               " Error: " + IntegerToString(result.retcode) + " " + result.comment);
      
      return false;
   }
}

//+------------------------------------------------------------------+
//| Move processed file to executed folder (simplified)             |
//+------------------------------------------------------------------+
void MoveToExecutedFolder(string fileName)
{
   string sourceFile = TradeSignalsPath + fileName;
   string targetFolder = TradeSignalsPath + "executed\\";
   string targetFile = targetFolder + fileName;
   
   // Simple approach: copy content then delete original
   int sourceHandle = FileOpen(sourceFile, FILE_READ | FILE_TXT);
   if(sourceHandle != INVALID_HANDLE)
   {
      string content = "";
      while(!FileIsEnding(sourceHandle))
      {
         content += FileReadString(sourceHandle) + "\n";
      }
      FileClose(sourceHandle);
      
      // Write to target
      int targetHandle = FileOpen(targetFile, FILE_WRITE | FILE_TXT);
      if(targetHandle != INVALID_HANDLE)
      {
         FileWriteString(targetHandle, content);
         FileClose(targetHandle);
         
         // Delete original
         if(FileDelete(sourceFile))
         {
            Print("📁 File moved to executed folder: ", fileName);
            LogToFile("File moved to executed: " + fileName);
         }
         else
         {
            Print("⚠️ Warning: File copied but original not deleted: ", fileName);
         }
      }
      else
      {
         Print("⚠️ Warning: Could not create target file: ", fileName);
         // Delete original as fallback
         FileDelete(sourceFile);
      }
   }
   else
   {
      Print("⚠️ Warning: Could not read source file: ", fileName);
      // Try to delete the problematic file
      FileDelete(sourceFile);
   }
}

//+------------------------------------------------------------------+
//| Manage existing positions - Position Management Module          |
//+------------------------------------------------------------------+
void ManageExistingPositions()
{
   int totalPositions = PositionsTotal();
   
   for(int i = totalPositions - 1; i >= 0; i--)
   {
      if(PositionGetSymbol(i) == "")
         continue;
         
      ulong positionTicket = PositionGetTicket(i);
      
      if(PositionSelectByTicket(positionTicket))
      {
         // Check if this is our bot position
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
            
            // Apply position management strategies
            if(EnableBreakEven)
               ApplyBreakEven(positionTicket, symbol, posType, openPrice, currentPrice, sl);
               
            if(EnableTrailingStop)
               ApplyTrailingStop(positionTicket, symbol, posType, currentPrice, sl);
               
            if(EnablePartialClose)
               CheckPartialClose(positionTicket, symbol, posType, openPrice, currentPrice, tp, volume);
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
         Print("⚖️ Break-even applied to position ", ticket, " at ", newSL);
         LogToFile("BREAK-EVEN: Position " + IntegerToString(ticket) + " moved to " + DoubleToString(newSL, digits));
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
      request.tp = PositionGetDouble(POSITION_TP);
      
      if(OrderSend(request, result))
      {
         Print("🔄 Trailing stop updated for position ", ticket, " to ", newSL);
         LogToFile("TRAILING: Position " + IntegerToString(ticket) + " updated to " + DoubleToString(newSL, digits));
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
         LogToFile("PARTIAL-CLOSE: Position " + IntegerToString(ticket) + " closed " + DoubleToString(closeVolume, 2) + " lots");
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

//+------------------------------------------------------------------+
