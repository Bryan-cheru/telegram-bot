# Telegram Trading Bot

A sophisticated Telegram bot that automatically processes trading screenshots, extracts trade signals using OCR, and executes trades on MetaTrader 5 (MT5) via cloud-based MetaAPI or local connections.

## Features

- 📷 **Image OCR Processing**: Automatically extracts text from trading screenshots using Tesseract.js
- 📊 **Trade Signal Parsing**: Intelligently parses trade information including symbols, entry zones, stop losses, and targets
- 🌐 **MetaAPI Integration**: Cloud-based MT5 execution via MetaAPI
- 🔄 **Multiple Execution Modes**: MetaAPI, File-based, and Test mode support
- 🎯 **Multi-Target Support**: Handles multiple take-profit levels with proper position sizing
- 🛑 **Advanced Risk Management**: Built-in position sizing, risk controls, and validation
- 📝 **Comprehensive Logging**: Detailed logging with Winston for monitoring and debugging
- ☁️ **Cloud Deployment Ready**: Optimized for Railway, Heroku, and other cloud platforms
- 🏥 **Health Monitoring**: Built-in health checks and status endpoints

## Prerequisites

### Required
1. **Node.js** (v16 or higher)
2. **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
3. **Telegram Channel ID** where screenshots will be posted
4. **MetaAPI Account** (for cloud MT5 execution) - [Sign up here](https://metaapi.cloud/)

### Optional (for local MT5 setup)
- **MetaTrader 5** with ZeroMQ Expert Advisor
- **Local MT5 server** running with EA support

## Quick Start

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd telegram-bot
npm install
```

### 2. Environment Configuration
Copy the environment template and configure:
```bash
cp production.env.template .env
```

Edit `.env` with your configuration:
```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHANNEL_ID=your_channel_id_here

# MetaAPI Configuration (Recommended)
METAAPI_TOKEN=your_metaapi_token_here
METAAPI_ACCOUNT_ID=your_metaapi_account_id_here

# Trading Settings
TEST_MODE=false
DEMO_MODE=false
MAX_TRADE_SIZE=0.1
RISK_PERCENTAGE=2

# Application Settings
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Advanced Features (Optional)
ENABLE_MT5_ORDER_MANAGER=true
CHECK_INTERVAL_SECONDS=10
```

### 3. Run the Bot
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## Deployment Options

### 🚂 Railway Deployment (Recommended)

1. **Create Railway Project**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   ```

2. **Configure Environment Variables**
   Set all required variables in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
   - `METAAPI_TOKEN`
   - `METAAPI_ACCOUNT_ID`
   - Other trading settings

3. **Deploy**
   ```bash
   railway up
   ```

4. **Monitor Health**
   - Health endpoint: `https://your-app.railway.app/health`
   - Logs: `railway logs`

### ☁️ Oracle Cloud Deployment

1. **Create Compute Instance**
   - Ubuntu 20.04 or higher
   - Minimum 1GB RAM, 1 CPU
   - Open ports 22 (SSH) and 3000 (app)

2. **Setup Environment**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2 for process management
   sudo npm install -g pm2

   # Clone and setup project
   git clone <your-repo>
   cd telegram-bot
   npm install
   npm run build
   ```

3. **Configure and Start**
   ```bash
   # Copy and configure environment
   cp production.env.template .env
   nano .env

   # Start with PM2
   pm2 start dist/app.js --name telegram-bot
   pm2 startup
   pm2 save
   ```

## MetaAPI Setup Guide

### 1. Create MetaAPI Account
1. Sign up at [MetaAPI.cloud](https://metaapi.cloud/)
2. Verify your email
3. Generate API token from dashboard

### 2. Connect MT5 Account
1. Go to "Accounts" in MetaAPI dashboard
2. Click "Add Account"
3. Select your broker and enter MT5 credentials
4. Wait for account verification (usually 1-5 minutes)
5. Copy the Account ID

### 3. Configure Bot
Add to your `.env` file:
```env
METAAPI_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9...
METAAPI_ACCOUNT_ID=your-account-id-here
```

### 4. Test Connection
```bash
node test-metaapi.js
```

## MT5 Expert Advisor Setup (Optional)

For advanced order management and local MT5 integration:

### 1. Install Expert Advisors
1. Copy `MT5_Files/MQL5/Experts/TelegramBotOrderManager.mq5` to your MT5's `MQL5/Experts/` folder
2. Copy `MT5_Files/MQL5/Experts/TelegramTradeReader.mq5` to the same location
3. Compile both EAs in MetaEditor

### 2. Configure EAs
1. Attach `TelegramBotOrderManager.mq5` to any chart
2. Set parameters:
   - `MagicNumber`: 123456 (or your preferred number)
   - `RiskPercentage`: 2.0
   - `EnableTrailingStop`: true
   - `EnableBreakEven`: true

### 3. Enable Communication
In your `.env` file:
```env
ENABLE_MT5_ORDER_MANAGER=true
CHECK_INTERVAL_SECONDS=10
```

## Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| **Telegram** | | | |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | - | ✅ |
| `TELEGRAM_CHANNEL_ID` | Channel ID (with -100 prefix) | - | ✅ |
| **MetaAPI** | | | |
| `METAAPI_TOKEN` | MetaAPI authentication token | - | ✅ |
| `METAAPI_ACCOUNT_ID` | MetaAPI account identifier | - | ✅ |
| **Trading** | | | |
| `TEST_MODE` | Enable simulation mode | false | ❌ |
| `DEMO_MODE` | Force demo account usage | false | ❌ |
| `MAX_TRADE_SIZE` | Maximum lot size per trade | 0.1 | ❌ |
| `RISK_PERCENTAGE` | Risk per trade (% of balance) | 2 | ❌ |
| **Application** | | | |
| `NODE_ENV` | Environment mode | development | ❌ |
| `LOG_LEVEL` | Logging verbosity | info | ❌ |
| `PORT` | HTTP server port | 3000 | ❌ |
| **Advanced** | | | |
| `ENABLE_MT5_ORDER_MANAGER` | Enable EA communication | false | ❌ |
| `CHECK_INTERVAL_SECONDS` | EA check frequency | 10 | ❌ |

### Trading Execution Modes

The bot automatically selects the best execution mode:

1. **MetaAPI Mode** (Production)
   - Cloud-based MT5 execution
   - Real-time trade execution
   - Automatic account management
   - **Used when**: `METAAPI_TOKEN` and `METAAPI_ACCOUNT_ID` are configured

2. **Test Mode** (Development)
   - Simulated trade execution
   - No real money involved
   - Perfect for testing and development
   - **Used when**: `TEST_MODE=true`

3. **File Mode** (Fallback)
   - Saves trade signals to JSON files
   - Manual execution required
   - **Used when**: MetaAPI is not configured

## Supported Trade Signal Formats

The bot intelligently parses screenshots with various formats:

### Standard Format
```
#XAUUSD (Updates) Sell Setup

Selling Zone: 3345 - 3351
Stop Loss: 3367

Target 1: 3312.430
Target 2: 3295.385
Final Target: 3255.439

Reason: Rising Wedge Pattern (Bearish)
Strong Resistance Zone
Expecting sharp drop after retest.

Plan: Wait for entry in the selling zone
and sell with proper SL.
```

### Alternative Formats Supported
```
GBPUSD Buy Setup
Entry Zone: 1.2500 - 1.2520
SL: 1.2450
TP1: 1.2580
TP2: 1.2620
```

### Parsing Capabilities
- **Symbols**: `#XAUUSD`, `GBPUSD`, `EURUSD`, etc.
- **Actions**: `Buy Setup`, `Sell Setup`, `Buy`, `Sell`
- **Entry Zones**: `Selling Zone:`, `Buying Zone:`, `Entry:`, `Zone:`
- **Stop Losses**: `Stop Loss:`, `SL:`
- **Targets**: `Target 1:`, `Target 2:`, `Final Target:`, `TP1:`, `TP2:`

## Bot Commands

- `/start` - Welcome message and bot status
- `/help` - Help and usage information  
- `/status` - Check bot configuration and connection status

## Project Architecture

```
src/
├── app.ts                       # Application entry point with health checks
├── bot/
│   ├── bot.ts                   # Main bot setup and executor selection
│   └── handlers/
│       ├── messageHandler.ts   # Command handling (/start, /help, /status)
│       └── photoHandler.ts     # Image processing and OCR
├── mt5/                         # Trading execution systems
│   ├── metaApiTradeExecutor.ts  # MetaAPI cloud execution
│   ├── testTradeExecutor.ts     # Simulation mode
│   ├── fileTradeExecutor.ts     # File-based fallback
│   ├── enhancedMetaApiTradeExecutor.ts  # Advanced EA integration
│   └── connection.ts            # Legacy MT5 connection (ZeroMQ)
├── ocr/
│   ├── textExtractor.ts         # Tesseract.js OCR functionality
│   └── tradeParser.ts           # Intelligent signal parsing
├── types/
│   ├── index.ts                 # Core type definitions
│   └── ITradeExecutor.ts        # Executor interface
├── utils/
│   ├── config.ts                # Environment configuration
│   └── logger.ts                # Winston logging setup
└── MT5_Files/                   # Expert Advisors for advanced features
    └── MQL5/Experts/
        ├── TelegramBotOrderManager.mq5
        └── TelegramTradeReader.mq5
```

## Risk Management Features

### Automatic Position Sizing
- **Account Balance Based**: Calculates position size based on account equity
- **Risk Percentage**: Uses configured risk percentage (default 2%)
- **Maximum Limits**: Respects maximum trade size settings
- **Minimum Volumes**: Ensures minimum lot sizes are met

### Validation Systems
- **Stop Loss Distance**: Validates minimum distance between entry and stop loss
- **Symbol Validation**: Checks if trading symbol exists and is tradeable  
- **Market Hours**: Respects trading session times
- **Entry Zone Logic**: Uses midpoint of entry zone for execution

### Error Handling
- **OCR Failures**: Graceful handling of unreadable images
- **Parsing Errors**: Detailed feedback on invalid signal formats
- **Connection Issues**: Automatic retry mechanisms with exponential backoff
- **Execution Failures**: Comprehensive error reporting and recovery

## Monitoring and Logging

### Log Files
```
logs/
├── combined.log     # All log messages
├── error.log        # Error messages only
└── (console)        # Real-time colored output
```

### Log Levels
- `error`: Critical errors only
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information

### Health Monitoring
- **Health Endpoint**: `GET /health` - Returns bot status and uptime
- **Status Monitoring**: Track connection status, trade statistics
- **Error Tracking**: Comprehensive error logging with stack traces

## Troubleshooting

### Common Issues

#### 1. MetaAPI Connection Failures
```bash
# Check account status
node test-metaapi.js

# Verify environment variables
echo $METAAPI_TOKEN
echo $METAAPI_ACCOUNT_ID
```

#### 2. OCR Not Working
- Ensure image quality is good (clear text, good contrast)
- Check if Tesseract is properly installed
- Verify image format is supported (JPEG, PNG)

#### 3. Trades Not Executing
- Check MetaAPI account status (deployed and connected)
- Verify account has sufficient balance
- Ensure trading symbols are available on your broker

#### 4. Bot Not Responding to Images
- Verify channel ID is correct (include -100 prefix for supergroups)
- Check bot permissions in the channel
- Ensure bot token is valid and active

### Debug Mode
Enable detailed logging:
```env
LOG_LEVEL=debug
TEST_MODE=true  # For safe testing
```

### Testing Commands
```bash
# Test MetaAPI connection
npm run test:metaapi

# Test OCR functionality  
npm run test:parser

# Health check
curl http://localhost:3000/health
```

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Run with debug logging
LOG_LEVEL=debug npm run dev

# Test mode (no real trades)
TEST_MODE=true npm run dev
```

### Production Deployment Checklist

#### Pre-deployment
- [ ] All environment variables configured
- [ ] MetaAPI account verified and connected
- [ ] Bot tested in test mode
- [ ] Logs directory permissions set
- [ ] Health check endpoint responding

#### Post-deployment  
- [ ] Health endpoint accessible
- [ ] Bot responds to `/status` command
- [ ] Test image processing with sample screenshot
- [ ] Monitor logs for errors
- [ ] Verify trade execution (small test trade)

## API Reference

### Health Check Endpoint
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-21T20:14:22.590Z",
  "uptime": 120.5,
  "version": "1.0.0",
  "bot": "running",
  "config": "validated"
}
```

### Trade Signal Format (JSON)
```json
{
  "symbol": "XAUUSD",
  "action": "SELL",
  "entryZone": {
    "min": 3345,
    "max": 3351
  },
  "stopLoss": 3367,
  "targets": [3312.430, 3295.385, 3255.439],
  "reason": "Rising Wedge Pattern (Bearish)",
  "plan": "Wait for entry in the selling zone"
}
```

## Security Best Practices

### Environment Security
- Never commit `.env` files to version control
- Use strong, unique API tokens
- Rotate API keys regularly
- Limit bot permissions to required channels only

### Trading Security  
- Start with small position sizes
- Use demo accounts for testing
- Monitor all trade executions
- Set appropriate risk limits
- Enable stop losses on all trades

### Infrastructure Security
- Use HTTPS for all API calls
- Enable firewall rules for production servers
- Regular security updates for dependencies
- Monitor application logs for suspicious activity

## Performance Optimization

### Resource Usage
- **Memory**: ~50-100MB typical usage
- **CPU**: Low usage, spikes during OCR processing
- **Network**: Minimal, mainly MetaAPI calls
- **Storage**: Log files and trade history

### Scaling Considerations
- Horizontal scaling: Multiple bot instances per channel
- Load balancing: Distribute OCR processing
- Database: Consider adding trade history storage
- Caching: Cache frequently accessed data

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Install dependencies: `npm install`
4. Make changes and test thoroughly
5. Submit pull request with detailed description

### Code Standards
- TypeScript strict mode enabled
- ESLint configuration included
- Comprehensive error handling required
- Unit tests for new features
- Documentation updates for API changes

## License

MIT License - see LICENSE file for details.

## Disclaimer

⚠️ **Important**: This software is for educational and informational purposes only. 

- **No Guarantees**: Past performance does not guarantee future results
- **Risk Warning**: Trading involves substantial risk of loss
- **Testing Required**: Always test thoroughly with demo accounts first
- **Personal Responsibility**: Users are responsible for their own trading decisions
- **No Financial Advice**: This tool does not provide financial or investment advice

Use at your own risk and never trade with money you cannot afford to lose.

## Support

For issues, questions, or contributions:
- 🐛 **Bugs**: Open an issue with detailed reproduction steps
- 💡 **Feature Requests**: Describe the use case and expected behavior  
- 📚 **Documentation**: Help improve the documentation
- 🤝 **Contributing**: See contributing guidelines above

---

**Made with ❤️ for automated trading enthusiasts**
