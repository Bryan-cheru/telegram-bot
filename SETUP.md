# Setup Guide for Telegram Trading Bot

## 1. Prerequisites Setup

### Install Node.js
1. Download Node.js from https://nodejs.org/ (v16 or higher)
2. Install Node.js with default settings

### Install Python (for MT5 server)
1. Download Python 3.8+ from https://python.org/
2. During installation, check "Add Python to PATH"

### Install MetaTrader 5
1. Download MT5 from https://www.metatrader5.com/
2. Install and create a demo or live account
3. Make sure MT5 is running and logged in

## 2. Telegram Bot Setup

### Create Telegram Bot
1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. **Bot Name:** Enter `Sabah Trader Bot` (display name)
4. **Bot Username:** Enter `sabahtraderbot` (must end with "bot" and be unique)
5. **Save the bot token** (format: 7734271472:AAG1Tkz_Gv2zPUpDAnI9bPrpWc1Y8rmUSh8)

✅ **Your bot is already created at:** https://t.me/sabahtraderbot

### Create/Setup Trading Channel
1. Create a new Telegram channel (or use existing)
2. Name it "Trading Signals" or similar
3. Add your bot as administrator:
   - Channel Settings → Administrators → Add Admin
   - Search for your bot username
   - Give it permission to read messages

### Get Channel ID
1. Send any message to your channel
2. Open browser and visit:
   ```
   https://api.telegram.org/bot7734271472:AAG1Tkz_Gv2zPUpDAnI9bPrpWc1Y8rmUSh8/getUpdates
   ```
3. Find the channel ID in the response (negative number like `-1001234567890`)
4. **Save this channel ID**

✅ **Your channel ID is:** `-1002505232650`

### Quick Setup (Recommended)
Run the setup wizard to configure everything:
```bash
npm run setup
```
This will prompt you for your bot token and channel ID, then create the `.env` file automatically.

**OR** you can manually edit the `.env` file with your values:
- Bot Token: `7734271472:AAG1Tkz_Gv2zPUpDAnI9bPrpWc1Y8rmUSh8` ✅
- Channel ID: `-1002505232650` ✅

✅ **Configuration Complete!** Your bot is ready to use.

## 3. Project Setup

### Install Dependencies
```bash
cd telegram-trading-bot
npm install
```

### Install Python Dependencies
```bash
pip install -r requirements.txt
```

### Configure Environment
1. Copy `.env.example` to `.env`
2. Fill in your bot token and channel ID:
   ```
   BOT_TOKEN=your_bot_token_here
   ALLOWED_CHANNEL_ID=your_channel_id_here
   ```

## 4. MT5 Server Setup

⚠️ **Important:** You must have MetaTrader 5 installed and running BEFORE starting the MT5 server.

### Prerequisites for MT5 Server
1. **Download and Install MT5:**
   - Go to https://www.metatrader5.com/
   - Download and install MetaTrader 5
   - Create a demo account or use existing account
   - **Make sure MT5 is running and logged in**

2. **Verify MT5 is Working:**
   - Open MetaTrader 5
   - Log into your account (demo or live)
   - You should see price charts and market data

### Start MT5 Server
```bash
python mt5_server.py
```

**Expected Output When Working:**
```
2025-07-11 02:18:22,028 - INFO - Connected to MT5 account: 12345678
2025-07-11 02:18:22,029 - INFO - MT5 Server started on port 18812
```

**If You See This Error:**
```
2025-07-11 02:18:22,028 - ERROR - MT5 initialization failed
2025-07-11 02:18:22,039 - ERROR - Failed to initialize MT5
```

**This means:** MetaTrader 5 is not running or not logged in.

### Troubleshooting MT5 Connection
1. **Make sure MT5 is running:** Open MetaTrader 5 application
2. **Log into your account:** Enter credentials and connect
3. **Check if you see live prices:** Charts should show current market data
4. **Try running the server again:** `python mt5_server.py`

## 5. Start the Bot

### Test Bot First (Without MT5)
Your Telegram bot can work for testing even without MT5 connected:

```bash
npm run dev
```

**Expected Output:**
```
info: Starting Telegram Trading Bot...
info: Bot handlers configured
info: Connected to MT5 at localhost:18812
info: Telegram bot started successfully
```

### Test Your Bot Commands
1. Go to https://t.me/sabahtraderbot
2. Send these commands:
   - `/start` - Check if bot is working
   - `/status` - Check configuration and connections  
   - `/help` - View available commands

### Full Setup (With MT5)
1. **Start MT5 and make sure it's logged in**
2. **Start MT5 server in one terminal:**
   ```bash
   python mt5_server.py
   ```
3. **Start bot in another terminal:**
   ```bash
   npm run dev
   ```

### Production Mode
```bash
npm run build
npm start
```

## 6. Testing

### Test Bot Commands
Send these commands to your bot:
- `/start` - Check if bot is working
- `/status` - Check configuration and connections
- `/help` - View available commands

### Test Image Processing
1. Send a trading screenshot to your configured channel
2. Bot should:
   - Extract text from image
   - Parse trade signal
   - Execute trade on MT5
   - Send confirmation message

## 7. Troubleshooting

### Common Issues

**Bot not responding:**
- Check bot token is correct
- Ensure bot is added to the channel
- Verify channel ID is correct

**OCR not working:**
- Ensure images have clear, readable text
- Check image quality and resolution
- Verify Tesseract.js installation

**MT5 connection failed:**
- Ensure MT5 is running and logged in
- Check MT5 server is running (python mt5_server.py)
- Verify port 18812 is not blocked

**Trade execution failed:**
- Check MT5 account has sufficient funds
- Verify symbol exists and is tradeable
- Check market hours for the symbol

### Logs
Check these log files for errors:
- `logs/error.log` - Bot errors
- `logs/combined.log` - All bot logs  
- `mt5_server.log` - MT5 server logs

## 8. Security Recommendations

1. **Never share your bot token**
2. **Use environment variables for sensitive data**
3. **Test with demo account first**
4. **Monitor all trades carefully**
5. **Set appropriate position sizes**
6. **Use proper risk management**

## 9. Production Deployment

### Using PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start dist/app.js --name telegram-bot
pm2 startup
pm2 save
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 10. Monitoring

### Bot Health Checks
- Use `/status` command regularly
- Monitor log files
- Check trade execution success rate

### Performance Metrics
- OCR processing time
- Trade execution latency
- Success/failure rates
- Position management accuracy

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review log files for errors
3. Test individual components separately
4. Ensure all prerequisites are met
