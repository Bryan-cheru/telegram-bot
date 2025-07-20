# 🆓 Oracle Cloud Setup Guide for Telegram Trading Bot

## Step 1: Create Oracle Cloud Account
1. Go to: https://cloud.oracle.com/
2. Click "Start for Free"
3. Sign up with email (requires credit card for verification, but won't be charged)
4. Complete identity verification

## Step 2: Create Free VM Instance
1. Login to Oracle Cloud Console
2. Go to "Compute" → "Instances"
3. Click "Create Instance"

### Instance Configuration:
```
Name: telegram-trading-bot
Image: Ubuntu 20.04 LTS (Free)
Shape: VM.Standard.E2.1.Micro (1GB RAM, Always Free)
Network: Default VCN (Free)
Storage: 50GB Boot Volume (Free)
```

## Step 3: SSH Access Setup
1. Generate SSH key pair during creation
2. Download private key (.pem file)
3. Note the public IP address

## Step 4: Connect to Your Server
```bash
# Windows (using PowerShell or Git Bash)
ssh -i path/to/your-key.pem ubuntu@YOUR_PUBLIC_IP

# Example:
ssh -i downloads/oracle-key.pem ubuntu@132.145.200.100
```

## Step 5: Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git
sudo apt install -y git

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install build tools
sudo apt install -y build-essential

# Verify installations
node --version
npm --version
git --version
```

## Step 6: Deploy Your Bot
```bash
# Clone your repository
git clone https://github.com/Bryan-cheru/telegram-bot.git
cd telegram-bot

# Install dependencies
npm install

# Create production environment file
cp .env .env.production
nano .env.production
```

## Step 7: Configure Environment
Edit `.env.production` with your production settings:
```env
# Telegram Bot
BOT_TOKEN=your_bot_token_here
ALLOWED_CHANNEL_ID=your_channel_id

# MetaAPI (your existing credentials)
METAAPI_TOKEN=your_token_here
METAAPI_ACCOUNT_ID=your_account_id

# Production Settings
NODE_ENV=production
LOG_LEVEL=info
MAX_TRADE_SIZE=0.01
RISK_PERCENTAGE=1
TEST_MODE=false
DEMO_MODE=false
```

## Step 8: Build and Start
```bash
# Build the project
npm run build

# Start with PM2 (keeps running even if you disconnect)
pm2 start dist/app.js --name "telegram-trading-bot"

# Save PM2 configuration
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs telegram-trading-bot
```

## Step 9: Setup Auto-Restart on Boot
```bash
# This ensures your bot starts automatically if server reboots
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

## Step 10: Monitor Your Bot
```bash
# Check bot status
pm2 status

# View logs (live)
pm2 logs telegram-trading-bot --lines 100

# Restart bot if needed
pm2 restart telegram-trading-bot

# Update bot (when you make changes)
git pull
npm run build
pm2 restart telegram-trading-bot
```

## Free Tier Limits:
- ✅ 2 VM instances (1GB RAM each)
- ✅ 200GB storage total
- ✅ 10TB bandwidth/month
- ✅ Always free (no time limit!)
- ✅ Perfect for testing and small-scale trading

## Advantages:
1. **Completely Free** - Forever!
2. **Real VPS** - Not just a container
3. **Full Control** - Root access
4. **High Uptime** - Enterprise infrastructure
5. **Scalable** - Easy upgrade path

## Security Setup:
```bash
# Setup firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 22

# Create non-root user (optional but recommended)
sudo adduser botuser
sudo usermod -aG sudo botuser
```

**Your bot will be running 24/7 on Oracle Cloud for FREE! 🎉**
