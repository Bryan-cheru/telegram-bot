# 🚀 MT5 Expert Advisor Setup Guide

## Overview
The **TelegramBotOrderManager.mq5** Expert Advisor provides advanced order management for trades executed by your Telegram bot. It includes:

- ✅ **Trailing Stop Loss** - Automatically follows profitable trades
- ✅ **Break-Even Protection** - Moves stop loss to break-even when profitable  
- ✅ **Partial Close Management** - Takes partial profits at key levels
- ✅ **Real-time Monitoring** - Logs all trade activities
- ✅ **Two-way Communication** - Exchanges data with Telegram bot

## 📋 Installation Steps

### 1. Copy EA to MT5
1. Copy `TelegramBotOrderManager.mq5` to your MT5 installation directory:
   ```
   C:\Program Files\MetaTrader 5\MQL5\Experts\
   ```

2. Or copy to your MT5 data folder:
   ```
   C:\Users\[YourUsername]\AppData\Roaming\MetaQuotes\Terminal\[TerminalID]\MQL5\Experts\
   ```

### 2. Compile the EA
1. Open **MetaEditor** in MT5 (F4 or Tools → MetaQuotes Language Editor)
2. Open the `TelegramBotOrderManager.mq5` file
3. Click **Compile** (F7) or press the Compile button
4. Ensure compilation is successful with no errors

### 3. Attach EA to Chart
1. Open any chart in MT5 (recommended: XAUUSD since that's your main pair)
2. Drag the **TelegramBotOrderManager** EA from Navigator → Expert Advisors
3. Configure the parameters in the EA settings dialog

## ⚙️ EA Parameters Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| **MagicNumber** | 123456 | Must match your bot's magic number |
| **TrailingStopDistance** | 50 | Trailing stop distance in points |
| **BreakEvenDistance** | 30 | Distance to trigger break-even in points |
| **EnableTrailingStop** | true | Enable/disable trailing stop |
| **EnableBreakEven** | true | Enable/disable break-even |
| **EnablePartialClose** | true | Enable/disable partial closes |
| **PartialClosePercent** | 33.0 | Percentage to close at each target |
| **CheckIntervalSeconds** | 5 | How often to check positions |
| **LogFileName** | TelegramBot_Orders.log | Log file name |

## 🔧 Advanced Configuration

### For XAUUSD (Gold) Trading:
```
TrailingStopDistance = 100 (10 pips)
BreakEvenDistance = 50 (5 pips)  
PartialClosePercent = 25.0 (25% at each target)
```

### For Forex Pairs (EURUSD, GBPUSD):
```
TrailingStopDistance = 50 (5 pips)
BreakEvenDistance = 30 (3 pips)
PartialClosePercent = 33.0 (33% at each target)
```

## 📊 How It Works

### 1. **Trade Detection**
- EA monitors all positions with magic number `123456`
- Only manages trades created by your Telegram bot
- Ignores manual trades or other EAs

### 2. **Break-Even Logic**
- When trade moves in profit by `BreakEvenDistance`
- Moves stop loss to entry price + small profit (5 points)
- Protects against reversal back to breakeven

### 3. **Trailing Stop Logic**
- Continuously adjusts stop loss as price moves favorably
- Maintains `TrailingStopDistance` from current price
- Never moves stop loss against you

### 4. **Partial Close Logic**
- Closes partial volume when 50% of the way to take profit
- Reduces risk while locking in profits
- Customizable percentage via `PartialClosePercent`

## 📈 Communication with Telegram Bot

The EA creates communication files in:
```
MT5_Files/MQL5/Files/telegram_bot/
```

### Files Created:
- `config.txt` - EA configuration
- `status.txt` - Current EA status  
- `active_orders.json` - List of managed orders
- `order_manager_log.txt` - Detailed activity log
- `trade_instruction_[ID].json` - Instructions from bot

## 🔍 Monitoring & Logging

### Real-time Monitoring:
1. Check MT5 **Experts** tab for EA messages
2. Watch **Journal** tab for detailed logs
3. Monitor log file: `Files/TelegramBot_Orders.log`

### Log Messages:
- ✅ `Break-even applied` - Stop loss moved to break-even
- 🔄 `Trailing stop updated` - Trailing stop adjusted
- 📊 `Partial close executed` - Partial profit taken
- 📝 `Transaction logged` - Trade activity recorded

## 🚨 Troubleshooting

### EA Not Starting:
- Ensure **Allow Automated Trading** is enabled
- Check EA permissions in Tools → Options → Expert Advisors
- Verify compilation was successful

### No Trade Management:
- Confirm magic number matches (123456)
- Check that positions exist with correct magic number
- Verify EA is attached to active chart

### Communication Issues:
- Ensure MT5 has file access permissions
- Check `Files/telegram_bot/` folder exists
- Verify Telegram bot is creating instruction files

## 🎯 Benefits

### Risk Management:
- **Automatic Break-Even**: Protects profitable trades
- **Trailing Stops**: Maximizes profit potential
- **Partial Closes**: Reduces risk while securing profits

### Performance:
- **24/7 Monitoring**: Works when you're away
- **Consistent Execution**: No emotional decisions
- **Detailed Logging**: Full audit trail

### Integration:
- **Seamless Operation**: Works with your Telegram bot
- **Two-way Communication**: Bot and EA exchange data
- **Synchronized Management**: Coordinated trade handling

## 📞 Support

If you encounter issues:
1. Check MT5 Experts tab for error messages
2. Review log file for detailed information
3. Ensure all settings match your trading parameters
4. Verify communication files are being created

**Your MT5 EA is now ready to provide professional-grade order management! 🎉**
