# Railway Deployment Guide for Telegram Trading Bot

## 🚂 Quick Railway Setup

### 1. Prepare for Railway
```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init
```

### 2. Set Environment Variables in Railway Dashboard

Go to your Railway project dashboard and add these environment variables:

```
BOT_TOKEN=7734271472:AAG1i6... (your full bot token)
ALLOWED_CHANNEL_ID=-1002505232650
METAAPI_TOKEN=eyJhbGci... (your full MetaAPI token)
METAAPI_ACCOUNT_ID=060723c1-a97d-4bc0-b2fe-a74110959569
MAX_TRADE_SIZE=0.1
RISK_PERCENTAGE=2
LOG_LEVEL=info
NODE_ENV=production
PORT=3000
```

### 3. Deploy to Railway

```bash
# From your project directory
cd "C:\Users\Brian Cheruiyot\Desktop\telegram\telegram-bot"

# Deploy to Railway
railway up
```

### 4. Monitor Your Bot

- Check Railway dashboard for logs
- Bot will have 24/7 uptime
- Better error handling and monitoring

## 🔧 Local Development vs Railway Production

**Local Development (npm run dev):**
- ✅ Good for testing
- ❌ Requires your computer to be on
- ❌ Limited by local resources

**Railway Hosting:**
- ✅ 24/7 uptime
- ✅ Better performance
- ✅ Professional logging
- ✅ Automatic restarts on failures
- ✅ Better for production use

## 🚀 Ready to Deploy?

1. **Copy your .env file values** to Railway environment variables
2. **Run `railway up`** from the project directory
3. **Monitor logs** in Railway dashboard
4. **Bot will be live 24/7**

Would you like me to help you deploy to Railway instead of using the desktop app?
