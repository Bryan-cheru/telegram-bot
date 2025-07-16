#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🤖 Telegram Trading Bot Setup Wizard\n');

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function setup() {
  try {
    console.log('Please provide the following information:\n');
    
    const botToken = await askQuestion('1. Enter your bot token from BotFather: ');
    if (!botToken || !botToken.includes(':')) {
      console.log('❌ Invalid bot token format. It should look like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
      process.exit(1);
    }
    
    const channelId = await askQuestion('2. Enter your channel ID (negative number): ');
    if (!channelId || !channelId.startsWith('-')) {
      console.log('❌ Invalid channel ID format. It should be a negative number like: -1001234567890');
      process.exit(1);
    }
    
    const maxTradeSize = await askQuestion('3. Enter max trade size (default 0.1): ') || '0.1';
    const riskPercentage = await askQuestion('4. Enter risk percentage (default 2): ') || '2';
    
    // Create .env file
    const envContent = `# Telegram Bot Configuration
BOT_TOKEN=${botToken}
ALLOWED_CHANNEL_ID=${channelId}

# MT5 Server Configuration
MT5_HOST=localhost
MT5_PORT=18812

# Trading Configuration
MAX_TRADE_SIZE=${maxTradeSize}
RISK_PERCENTAGE=${riskPercentage}

# Logging
LOG_LEVEL=info
`;
    
    fs.writeFileSync('.env', envContent);
    
    console.log('\n✅ Configuration saved to .env file!');
    console.log('\nNext steps:');
    console.log('1. Install Python dependencies: pip install -r requirements.txt');
    console.log('2. Start MT5 server: python mt5_server.py');
    console.log('3. Start the bot: npm run dev');
    console.log('\nYour bot is ready to process trading signals! 🚀');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

setup();
