# 🎯 COMPLETE MANUAL TRADING COMMANDS GUIDE

## 📖 Overview

Your Telegram trading bot supports comprehensive manual trading commands for direct control over your trading accounts. All commands work across your 4 live trading accounts simultaneously.

---

## 🚀 OPENING TRADES

### **Basic Buy/Sell Commands**
```
BUY 0.1 XAUUSD
SELL 0.05 SILVER
BUY 0.1 GOLD @ 2650
SELL 0.1 EURUSD @ 1.0850
```

### **Advanced Trade Commands**
```
BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670
SELL 0.05 SILVER @ 30.50 SL:30.00 TP:31.00
BUY 0.1 EURUSD SL:1.0800 TP:1.0900
```

### **Formal Order Commands**
```
Open Order #12345 Buy 0.1 #EURUSD @1.18079
Open Order #67890 Sell 0.05 #XAUUSD @2650
```

### **Symbol-First Format**
```
XAUUSD BUY 0.1 @ 2650
EURUSD SELL 0.1 @ 1.0850
SILVER BUY 0.05 @ 30.50
```

---

## 🔴 CLOSING TRADES

### **Close All Positions**
```
CLOSE ALL
```
*Closes every open position across all accounts*

### **Close Specific Ticket**
```
CLOSE #12345678
CLOSE #87654321
```
*Closes the trade with that specific ticket number*

### **Close by Symbol**
```
CLOSE XAUUSD
CLOSE SILVER
CLOSE EURUSD
```
*Closes all positions for that symbol (both buy and sell)*

### **Close by Direction + Symbol**
```
CLOSE BUY XAUUSD
CLOSE SELL SILVER
CLOSE BUY EURUSD
```
*Closes only buy or sell positions for that specific symbol*

### **Close by Direction (All Symbols)**
```
CLOSE BUY
CLOSE SELL
```
*Closes all buy positions or all sell positions across all symbols*

---

## 📊 STATUS & INFORMATION COMMANDS

### **Account Status**
```
STATUS
ACCOUNT
INFO
```
*Shows comprehensive account information across all 4 live accounts*

### **Open Positions**
```
POSITIONS
TRADES
OPEN
```
*Lists all currently open positions with details*

### **Balance Information**
```
BALANCE
EQUITY
MONEY
```
*Shows current balance and equity across all accounts*

---

## 🔧 COMMAND SYNTAX REFERENCE

### **Required Parameters:**
- **Action**: `BUY`, `SELL`, `CLOSE`
- **Volume**: Lot size (0.01 to 100)
- **Symbol**: Trading instrument

### **Optional Parameters:**
- **@price**: Entry price (omit for market orders)
- **SL:price**: Stop loss level
- **TP:price**: Take profit level
- **#ticketNumber**: Specific trade ticket

### **Symbol Auto-Conversion:**
| You Type | Bot Uses |
|----------|----------|
| GOLD | XAUUSD |
| SILVER | XAGUSD |
| SILVERUSD | XAGUSD |
| GOLDUSD | XAUUSD |

---

## 📱 PRACTICAL EXAMPLES

### **Scenario 1: Quick Market Orders**
```
User: "BUY 0.1 GOLD"
Bot: ✅ Executes market buy order for 0.1 lots XAUUSD

User: "SELL 0.05 SILVER"
Bot: ✅ Executes market sell order for 0.05 lots XAGUSD
```

### **Scenario 2: Limit Orders with Risk Management**
```
User: "BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670"
Bot: ✅ Places buy limit at 2650 with stop at 2640 and target at 2670

User: "SELL 0.1 EURUSD @ 1.0850 SL:1.0900 TP:1.0800"
Bot: ✅ Places sell limit at 1.0850 with stop at 1.0900 and target at 1.0800
```

### **Scenario 3: Position Management**
```
User: "POSITIONS"
Bot: 📈 Lists all open trades with ticket numbers

User: "CLOSE #12345678"
Bot: ✅ Closes specific trade ticket

User: "CLOSE BUY XAUUSD"
Bot: ✅ Closes all Gold buy positions, keeps sell positions open
```

### **Scenario 4: Emergency Management**
```
User: "CLOSE ALL"
Bot: ⚠️ Closes every open position immediately

User: "STATUS"
Bot: 📊 Shows account status to verify all positions closed
```

---

## 🛡️ SAFETY FEATURES

### **Risk Management Integration**
- All manual commands go through enhanced risk management
- Position sizes are validated against account balance
- Daily trading limits are enforced
- Emergency stop mechanisms apply to manual trades

### **Multi-Account Safety**
- Commands execute across all 4 live accounts
- Risk is distributed appropriately
- Account-specific limits are respected
- Real-time connection status verification

### **Validation Checks**
- Symbol format validation
- Volume limits (0.01 - 100 lots)
- Price validation (positive values only)
- Stop loss/take profit logic validation
- Account connection verification before execution

---

## ⚠️ IMPORTANT NOTES

### **Live Trading Warnings**
- **ALL COMMANDS EXECUTE ON LIVE ACCOUNTS WITH REAL MONEY**
- Double-check all parameters before sending
- Use `STATUS` to verify connections before trading
- Monitor positions actively after opening

### **Command Processing**
- Commands are case-insensitive
- Spaces and formatting are flexible
- Symbol hashtags (#) are optional
- Multiple formats supported for same action

### **Error Handling**
- Invalid commands return helpful error messages
- Connection issues are reported immediately
- Failed executions provide detailed error information
- All commands are logged for audit trail

---

## 🎮 COMMAND CHEAT SHEET

| Action | Command Examples |
|--------|------------------|
| **Buy Market** | `BUY 0.1 XAUUSD` |
| **Sell Limit** | `SELL 0.1 GOLD @ 2650` |
| **With Stops** | `BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670` |
| **Close All** | `CLOSE ALL` |
| **Close Symbol** | `CLOSE XAUUSD` |
| **Close Ticket** | `CLOSE #12345678` |
| **Check Status** | `STATUS` |
| **View Positions** | `POSITIONS` |
| **Check Balance** | `BALANCE` |

---

## 🔗 Integration with Bot Features

### **Works Alongside:**
- ✅ Automatic image processing
- ✅ OCR signal extraction
- ✅ Enhanced risk management
- ✅ Multi-account execution
- ✅ Dashboard monitoring
- ✅ Real-time logging

### **Priority System:**
1. Manual commands have highest priority
2. Risk management applies to all trades
3. Emergency stops override all commands
4. Connection verification before execution

---

**🚀 Your bot is now equipped with comprehensive manual trading capabilities for complete control over your live trading operations!**
