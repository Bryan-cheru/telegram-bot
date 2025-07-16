# 🚀 MT5 Expert Advisor Setup Guide

## 📁 Files Setup

### 1. **Copy Expert Advisor to MT5**
```
Source: C:\Users\HP\Desktop\DESKTOP\Upwork\telegram\TelegramTradeReader.mq5
Target: [Your MT5 Data Folder]\MQL5\Experts\TelegramTradeReader.mq5
```

### 2. **Find Your MT5 Data Folder**
In MT5, go to: **File → Open Data Folder**
This will open your MT5 data directory.

### 3. **Create Trade Signals Folder Structure**
In your MT5 Data Folder, create:
```
[MT5 Data Folder]\MQL5\Files\trade_signals\
[MT5 Data Folder]\MQL5\Files\trade_signals\executed\
```

## 🔧 Compilation & Setup

### 4. **Compile the Expert Advisor**
1. Open **MetaEditor** (F4 in MT5)
2. Open `TelegramTradeReader.mq5`
3. Compile (F7 or Ctrl+F7)
4. Should show: **"0 errors, 0 warnings"**

### 5. **Attach EA to Chart**
1. In MT5, open any chart (EURUSD, XAUUSD, etc.)
2. In Navigator, go to **Expert Advisors**
3. Drag `TelegramTradeReader` onto the chart
4. **IMPORTANT**: Configure settings:

#### ⚙️ **EA Settings:**
```
TradeSignalsPath = "trade_signals\"
CheckInterval = 5
MaxSpreadPips = 3.0
EnableTrading = false    ← START WITH FALSE FOR TESTING!
```

#### ✅ **Trading Permissions:**
- ✅ Allow live trading
- ✅ Allow DLL imports (if using)
- ✅ Allow imports of external experts

## 🧪 Testing Process

### Phase 1: File Detection Test
1. Set `EnableTrading = false`
2. Copy trade signal files to `[MT5]\MQL5\Files\trade_signals\`
3. Check MT5 **Experts** tab for logs:
   ```
   === Telegram Trade Reader EA Initialized ===
   Signals folder: [path]
   EA ready to process trade signals...
   Processing signal file: trade_xxxxxxx.json
   Parsed signal - Symbol: XAUUSD, Action: SELL...
   SIMULATION MODE: Would execute trade for XAUUSD SELL
   ```

### Phase 2: Real Trading Test
1. Only after Phase 1 works perfectly
2. Set `EnableTrading = true`
3. Ensure you have sufficient margin
4. Monitor the **Trade** tab for actual executions

## 📋 **Current Test Files Ready:**
```
trade_1752263375217_3mqimbzlc.json - XAUUSD SELL (3345-3351, SL: 3367)
trade_1752266765049_h2o3ux6ln.json - XAUUSD SELL (3345-3351, SL: 3367)
```

## 🔄 **Integration with Telegram Bot**

### Option A: Manual Copy (Testing)
Copy files from: `C:\Users\HP\Desktop\DESKTOP\Upwork\telegram\trade_signals\`
To: `[MT5]\MQL5\Files\trade_signals\`

### Option B: Automatic Sync (Production)
Modify bot to write directly to MT5 folder:
```typescript
// In fileTradeExecutor.ts, change:
this.signalsDir = path.join('[MT5_DATA_FOLDER]', 'MQL5', 'Files', 'trade_signals');
```

## 🚨 **Safety Checklist**
- [ ] Start with `EnableTrading = false`
- [ ] Test with small volumes (0.01 lots)
- [ ] Verify symbol availability (XAUUSD)
- [ ] Check spread conditions
- [ ] Monitor logs in Experts tab
- [ ] Ensure sufficient account balance
- [ ] Test stop loss placement

## 📊 **Expected MT5 Logs**
```
=== Telegram Trade Reader EA Initialized ===
Signals folder: C:\Users\[User]\AppData\Roaming\MetaQuotes\Terminal\[ID]\MQL5\Files\trade_signals\
Check interval: 5 seconds
Trading enabled: NO (Testing mode)
EA ready to process trade signals...
Processing signal file: trade_1752266765049_h2o3ux6ln.json
Parsed signal - Symbol: XAUUSD, Action: SELL, Entry: 3345-3351, SL: 3367, Volume: 0.1
SIMULATION MODE: Would execute trade for XAUUSD SELL
File moved to executed folder: trade_1752266765049_h2o3ux6ln.json
```

## 🆘 **Troubleshooting**
- **No files found**: Check folder path in EA logs
- **Permission denied**: Run MT5 as administrator
- **Symbol not found**: Add XAUUSD to Market Watch
- **Trade failed**: Check margin requirements and spread

---
**🎯 Ready to test! Start with Phase 1 (EnableTrading = false) first!**
