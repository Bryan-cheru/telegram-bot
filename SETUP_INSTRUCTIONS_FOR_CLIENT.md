# 🚀 Client Setup Instructions

## ⚠️ IMPORTANT: You need to create your own `.env` file

The bot requires 4 essential configuration values. Follow these steps:

## 1. Create `.env` file
In the bot directory, create a new file called `.env` (copy from `.env.example`):

```bash
# Telegram Bot Configuration
BOT_TOKEN=your_actual_bot_token_from_botfather
ALLOWED_CHANNEL_ID=your_actual_channel_id

# MetaAPI Configuration (Cloud-based MT5)
METAAPI_TOKEN=your_actual_metaapi_token
METAAPI_ACCOUNT_ID=your_actual_metaapi_account_id

# Trading Settings (Optional - can keep defaults)
MAX_TRADE_SIZE=0.1
RISK_PERCENTAGE=2

# Application Settings (Optional - can keep defaults)
NODE_ENV=production
LOG_LEVEL=info
```

## 2. Get Your Values

### BOT_TOKEN
1. Message @BotFather on Telegram
2. Create a new bot: `/newbot`
3. Copy the token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### ALLOWED_CHANNEL_ID  
1. Add your bot to your trading signals channel
2. Send a test message to the channel
3. Check bot logs or use @userinfobot to get the channel ID
4. Should look like: `-1001234567890`

### METAAPI_TOKEN & METAAPI_ACCOUNT_ID
1. Sign up at https://metaapi.cloud/
2. Get your API token from the dashboard  
3. Add your MetaTrader account and get the account ID

## 3. Run the Bot
After creating `.env` with your values:

```bash
npm install
npm run dev
```

## 4. Expected Success Output
```
info: Starting Telegram Trading Bot...
info: 🌐 Using MetaAPI for trade execution  
info: ✅ Telegram bot started successfully
info: 🌐 Connecting to MetaAPI...
info: ✅ MetaAPI connected successfully!
```

## ❌ If You Still Get "Invalid configuration"
Check that your `.env` file has:
- No spaces around the `=` sign
- No quotes around values (unless the value itself contains quotes)
- All 4 required fields filled in
- File is named exactly `.env` (not `.env.txt`)
