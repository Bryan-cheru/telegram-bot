# 🤖 Telegram Trading Bot

An advanced Telegram bot that automatically processes trading signals from images and text, then executes trades on MetaTrader 5 via MetaAPI.

## 🚀 Deployed on Render.com

This bot is configured and optimized for deployment on [Render.com](https://render.com).

### ✅ Features
- **OCR Processing**: Extracts trading signals from screenshots using Tesseract.js
- **Smart Signal Parsing**: Multiple parsing strategies for different signal formats  
- **Risk Management**: 1:1 Risk-Reward ratio enforcement with configurable position sizing
- **MT5 Integration**: Seamless trade execution via MetaAPI
- **Web Dashboard**: Real-time monitoring and logging interface
- **Multi-Symbol Support**: Forex, Gold, Silver, and Index trading

### 🔧 Environment Variables
Set these in your Render dashboard:

**Required:**
```
BOT_TOKEN=your_telegram_bot_token
ALLOWED_CHANNEL_ID=your_channel_id  
METAAPI_TOKEN=your_metaapi_token
METAAPI_ACCOUNT_ID=your_metaapi_account_id
```

**Optional Trading Settings:**
```
MAX_TRADE_SIZE=0.1
RISK_PERCENTAGE=2
ENFORCE_1_1_RR=true
DEFAULT_ORDER_TYPE=MARKET
```

### 📊 Monitoring
- **Health Check**: `/health` endpoint for uptime monitoring
- **Dashboard**: Web interface available at your Render URL
- **Logs**: Comprehensive logging with Winston

### 🛠️ Build Configuration
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Node Version**: 18+ recommended

---
*Deployed via Render.com | Last updated: September 2025*