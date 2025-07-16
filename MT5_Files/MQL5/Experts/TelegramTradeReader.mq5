//+------------------------------------------------------------------+
//|                                            TelegramTradeReader.mq5 |
//|                     Reads trade signals from JSON files and executes |
//|                                                                  |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, Telegram Trading Bot"
#property link      ""
#property version   "1.00"
#property strict

// Input parameters
input string   TradeSignalsPath = "trade_signals\\";  // Path to trade signals folder
input int      CheckInterval = 5;     // Check for new signals every X seconds
input double   MaxSpreadPips = 3.0;   // Maximum spread allowed for execution
input bool     EnableTrading = true;  // Enable actual trading (false for testing)

// Global variables
string g_signalsFolder = "";
datetime g_lastCheck = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   // Set up the signals folder path
   g_signalsFolder = TerminalInfoString(TERMINAL_DATA_PATH) + "\\MQL5\\Files\\" + TradeSignalsPath;
   
   Print("=== Telegram Trade Reader EA Initialized ===");
   Print("Signals folder: ", g_signalsFolder);
   Print("Check interval: ", CheckInterval, " seconds");
   Print("Trading enabled: ", EnableTrading ? "YES" : "NO (Testing mode)");
   
   // Set timer for checking signals
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
   
   Print("EA ready to process trade signals...");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("=== Telegram Trade Reader EA Stopped ===");
  }

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   CheckForNewSignals();
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
      Print("Error: Could not open file ", fileName, ". Error: ", GetLastError());
      return;
     }
   
   string jsonContent = "";
   while(!FileIsEnding(fileHandle))
     {
      jsonContent += FileReadString(fileHandle) + "\n";
     }
   FileClose(fileHandle);
   
   Print("Processing signal file: ", fileName);
   Print("File content: ", jsonContent);
   
   // Parse the JSON content (basic parsing for now)
   TradeSignalData signalData;
   if(ParseTradeSignal(jsonContent, signalData))
     {
      // Execute the trade
      bool executed = ExecuteTradeFromSignal(signalData);
      
      if(executed)
        {
         // Move file to executed folder
         MoveToExecutedFolder(fileName);
        }
     }
   else
     {
      Print("Error: Could not parse signal file ", fileName);
     }
  }

//+------------------------------------------------------------------+
//| Trade Signal Data Structure                                      |
//+------------------------------------------------------------------+
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
//| Parse JSON trade signal (basic implementation)                   |
//+------------------------------------------------------------------+
bool ParseTradeSignal(string jsonContent, TradeSignalData &signal)
  {
   // Basic JSON parsing - looking for key patterns
   // In a production version, you'd use a proper JSON parser
   
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
      signal.entryMin = StringToDouble(temp);
     }
   
   // Extract entry zone max
   pos = StringFind(jsonContent, "\"max\":");
   if(pos >= 0)
     {
      string temp = StringSubstr(jsonContent, pos + 6);
      signal.entryMax = StringToDouble(temp);
     }
   
   // Extract stop loss
   pos = StringFind(jsonContent, "\"stopLoss\":");
   if(pos >= 0)
     {
      string temp = StringSubstr(jsonContent, pos + 11);
      signal.stopLoss = StringToDouble(temp);
     }
   
   // Extract volume
   pos = StringFind(jsonContent, "\"volume\":");
   if(pos >= 0)
     {
      string temp = StringSubstr(jsonContent, pos + 9);
      signal.volume = StringToDouble(temp);
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
      Print("Error: Missing required fields in signal");
      return false;
     }
   
   Print("Parsed signal - Symbol: ", signal.symbol, ", Action: ", signal.action, 
         ", Entry: ", signal.entryMin, "-", signal.entryMax, 
         ", SL: ", signal.stopLoss, ", Volume: ", signal.volume);
   
   return true;
  }

//+------------------------------------------------------------------+
//| Execute trade from signal                                        |
//+------------------------------------------------------------------+
bool ExecuteTradeFromSignal(TradeSignalData &signal)
  {
   if(!EnableTrading)
     {
      Print("SIMULATION MODE: Would execute trade for ", signal.symbol, " ", signal.action);
      return true; // Simulate successful execution
     }
   
   // Check if symbol exists and is available
   if(!SymbolSelect(signal.symbol, true))
     {
      Print("Error: Symbol ", signal.symbol, " not available");
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
      Print("Warning: Spread too high (", spreadPips, " pips). Skipping trade.");
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
         Print("Info: Price not in buy entry zone. Current: ", ask, 
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
         Print("Info: Price not in sell entry zone. Current: ", bid, 
               ", Entry zone: ", signal.entryMin, "-", signal.entryMax);
         return false; // Don't execute yet
        }
     }
   else
     {
      Print("Error: Invalid action ", signal.action);
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
   request.tp = 0; // Will set targets separately if needed
   request.comment = "TelegramBot-" + signal.signalId;
   request.magic = 12345; // You can customize this
   
   // Send the order
   bool success = OrderSend(request, result);
   
   if(success && result.retcode == TRADE_RETCODE_DONE)
     {
      Print("✅ Trade executed successfully!");
      Print("Order ticket: ", result.order);
      Print("Execution price: ", result.price);
      Print("Volume: ", result.volume);
      return true;
     }
   else
     {
      Print("❌ Trade execution failed!");
      Print("Return code: ", result.retcode);
      Print("Comment: ", result.comment);
      return false;
     }
  }

//+------------------------------------------------------------------+
//| Move processed file to executed folder                           |
//+------------------------------------------------------------------+
void MoveToExecutedFolder(string fileName)
  {
   string sourceFile = TradeSignalsPath + fileName;
   string targetFolder = TradeSignalsPath + "executed\\";
   string targetFile = targetFolder + fileName;
   
   // Create executed folder if it doesn't exist
   if(!FolderCreate(TradeSignalsPath + "executed", 0))
     {
      int error = GetLastError();
      if(error != 5019) // Folder already exists
        {
         Print("Warning: Could not create executed folder. Error: ", error);
        }
     }
   
   // Move the file
   if(FileMove(sourceFile, targetFile, 0))
     {
      Print("File moved to executed folder: ", fileName);
     }
   else
     {
      Print("Warning: Could not move file to executed folder. Error: ", GetLastError());
      // Delete the original file as fallback
      FileDelete(sourceFile);
      Print("Original file deleted: ", fileName);
     }
  }

//+------------------------------------------------------------------+
