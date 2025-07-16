const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupBot() {
  console.log('🤖 Telegram Trading Bot Setup Wizard\n');
  
  const botToken = await question('Enter your bot token: ');
  
  if (!botToken || !botToken.includes(':')) {
    console.log('❌ Invalid bot token format');
    process.exit(1);
  }
  
  console.log('\n📺 Now you need to get your channel ID:');
  console.log('1. Create a channel or use existing one');
  console.log('2. Add your bot (@sabahtraderbot) as admin');
  console.log('3. Send a test message to the channel');
  console.log('4. Visit this URL in your browser:');
  console.log(`   https://api.telegram.org/bot${botToken}/getUpdates`);
  console.log('5. Find the channel ID (negative number like -1001234567890)');
  
  const channelId = await question('\nEnter your channel ID: ');
  
  if (!channelId || !channelId.startsWith('-')) {
    console.log('❌ Channel ID should be a negative number (like -1001234567890)');
    process.exit(1);
  }
  
  // Create .env file
  const envContent = `# Telegram Bot Configuration
BOT_TOKEN=${botToken}
ALLOWED_CHANNEL_ID=${channelId}

# MT5 Server Configuration
MT5_HOST=localhost
MT5_PORT=18812

# Trading Configuration
MAX_TRADE_SIZE=0.1
RISK_PERCENTAGE=2

# Logging
LOG_LEVEL=info`;

  fs.writeFileSync('.env', envContent);
  
  console.log('\n✅ Configuration saved to .env file');
  console.log('\n🚀 Next steps:');
  console.log('1. Install Python dependencies: pip install -r requirements.txt');
  console.log('2. Start MT5 and run: python mt5_server.py');
  console.log('3. Start the bot: npm run dev');
  
  rl.close();
}

setupBot().catch(console.error);
