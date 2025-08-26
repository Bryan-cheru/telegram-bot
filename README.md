# Telegram Trading Bot

A sophisticated Telegram bot that automatically processes trading screenshots, extracts trade signals using OCR, and executes trades on MetaTrader 5 (MT5).

## Features

- 📷 **Image OCR Processing**: Automatically extracts text from trading screenshots
- 📊 **Trade Signal Parsing**: Intelligently parses trade information including symbols, entry zones, stop losses, and targets
- 🔄 **Automatic MT5 Execution**: Executes trades directly on MetaTrader 5
- 🎯 **Multi-Target Support**: Handles multiple take-profit levels
- 🛑 **Risk Management**: Built-in position sizing and risk controls
- 📝 **Comprehensive Logging**: Detailed logging for monitoring and debugging
- 🔗 **Combined Text + Image Processing**: Handles photos with captions for enhanced analysis (NEW!)
- 📊 **Chart Setup Analysis**: Creates trade setups from pure chart screenshots (NEW!)
- 🧠 **Multi-Format Intelligence**: Adapts to any signal format automatically (NEW!)

## Prerequisites

1. **Node.js** (v16 or higher)
2. **MetaTrader 5** with ZeroMQ Expert Advisor
3. **Telegram Bot Token** from @BotFather
4. **Channel/Group ID** where screenshots will be posted

## Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment file and configure:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` file with your configuration:
   ```env
   BOT_TOKEN=your_telegram_bot_token_here
   MT5_HOST=localhost
   MT5_PORT=18812
   ALLOWED_CHANNEL_ID=your_channel_id_here
   MAX_TRADE_SIZE=0.1
   RISK_PERCENTAGE=2
   ```

## MT5 Setup

1. Install a ZeroMQ Expert Advisor in MT5 that can receive trade requests
2. Configure the EA to listen on port 18812 (or your configured port)
3. Ensure MT5 is running and the EA is active

## Usage

1. **Start the bot:**
   ```bash
   npm run dev
   ```

2. **For production:**
   ```bash
   npm run build
   npm start
   ```

3. **Add the bot to your trading channel**

4. **Send trading screenshots** - The bot will automatically:
   - Extract text from images using OCR
   - Parse trade signals
   - Execute trades on MT5
   - Send confirmation messages

## Supported Trade Signal Formats

The bot intelligently parses multiple signal formats with advanced OCR and text processing:

### Format 1: Compact Emoji Format
```
#XAUUSD Update ⏺ Sell: 3344 – 3349 🏹 Target 1: 3329 | 🏹 Final: 3313
```

### Format 2: Detailed Analysis Format
```
#XAUUSD (Update) Selling Setup 📊

Gold has tested the upper resistance zone (3379–3384) where selling pressure is expected. 
From this zone, a possible downside move towards the 3357–3344 levels can be seen.

⚠️ This setup is a bit risky due to recent volatility, so make sure to trade with proper money management.

❌ SL: 3393
🏹 TP: 3357 / 3344
```

### Format 3: Traditional Format
```
#XAUUSD (Updates) Sell Setup

Selling Zone: 3345 - 3351
Stop Loss: 3367
Targets:

Target 1: 3312.430
Target 2: 3295.385
Final Target: 3255.439

Reason:
Rising Wedge Pattern (Bearish)
Strong Resistance Zone
Expecting sharp drop after retest.
```

### Format 4: Chart Setup Analysis (NEW! 📊)
```
EURUSD 4h OANDA
1.17572
1.16011  
1.15989
```
*Automatically detects key levels and creates trade setups from pure chart screenshots*

**Chart Setup Features:**
- 🔍 **Smart Level Detection**: Identifies support/resistance from price levels
- 🎯 **Bias Analysis**: Determines BUY/SELL bias from current price position
- 📊 **Range Calculation**: Calculates risk/reward from key levels
- 🤖 **Auto Entry Zones**: Creates neutral entry zones for manual decision
- 🎨 **Context Awareness**: Detects bearish/bullish clues from chart annotations

### Format 5: Combined Text + Image (ENHANCED! 🔗)
**Photo with Caption:**
```
Caption: "📊 EURUSD Analysis - Looking for SELL on resistance test"
Image: [Chart with levels 1.17572, 1.16011, 1.15989]
```
*Bot combines caption context with chart levels for enhanced analysis*

**Combined Processing Features:**
- 🔗 **Intelligent Fusion**: Merges text analysis with visual chart data
- 🧠 **Context Enhancement**: Uses caption to understand trader's bias
- 📊 **Visual Confirmation**: Chart levels validate or enhance text signals  
- 💡 **Best of Both**: Gets precision from charts + context from text
- 🎯 **Real-World Usage**: Handles how traders actually share analysis

Plan: Wait for entry in the selling zone
and sell with proper SL.
```

## Bot Commands

- `/start` - Welcome message and bot status
- `/help` - Help and usage information
- `/status` - Check bot and MT5 connection status

## Project Structure

```
src/
├── bot/
│   ├── handlers/
│   │   ├── messageHandler.ts    # Text message handling
│   │   └── photoHandler.ts      # Image processing
│   └── bot.ts                   # Main bot setup
├── ocr/
│   ├── textExtractor.ts         # OCR functionality
│   └── tradeParser.ts           # Trade signal parsing
├── mt5/
│   ├── connection.ts            # MT5 connection management
│   └── tradeExecutor.ts         # Trade execution logic
├── types/
│   └── index.ts                 # TypeScript type definitions
├── utils/
│   ├── config.ts                # Configuration management
│   └── logger.ts                # Logging utilities
└── app.ts                       # Application entry point
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | Required |
| `MT5_HOST` | MT5 server host | localhost |
| `MT5_PORT` | MT5 server port | 18812 |
| `ALLOWED_CHANNEL_ID` | Channel ID where bot operates | Required |
| `MAX_TRADE_SIZE` | Maximum position size | 0.1 |
| `RISK_PERCENTAGE` | Risk percentage per trade | 2 |
| `LOG_LEVEL` | Logging level | info |

## Security Considerations

- Bot only responds to messages from the configured channel
- Implement proper risk management
- Monitor trade execution logs
- Use environment variables for sensitive data
- Never commit `.env` file to version control

## Error Handling

The bot includes comprehensive error handling for:
- OCR failures
- Trade signal parsing errors
- MT5 connection issues
- Network connectivity problems
- Invalid trade parameters

## Logging

Logs are written to:
- `logs/error.log` - Error messages only
- `logs/combined.log` - All log messages
- Console output with colored formatting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This software is for educational purposes only. Use at your own risk. Always test thoroughly before using with real trading accounts.
