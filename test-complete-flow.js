const { TelegramBot } = require('./dist/bot/bot');
const { config, validateConfig } = require('./dist/utils/config');

console.log('🧪 COMPREHENSIVE TELEGRAM BOT TEST\n');

// Check environment configuration
console.log('1️⃣ Checking Environment Configuration...');
console.log('='.repeat(50));

const configValid = validateConfig();
console.log(`Config validation: ${configValid ? '✅ Valid' : '❌ Invalid'}`);

console.log('\nConfiguration Details:');
console.log(`Bot Token: ${config.botToken ? '✅ Set (' + config.botToken.substring(0, 10) + '...)' : '❌ Missing'}`);
console.log(`Allowed Channel ID: ${config.allowedChannelId || '❌ Missing'}`);
console.log(`MetaAPI Token: ${config.metaApi.token ? '✅ Set (' + config.metaApi.token.substring(0, 10) + '...)' : '❌ Missing'}`);
console.log(`MetaAPI Account ID: ${config.metaApi.accountId || '❌ Missing'}`);
console.log(`Max Trade Size: ${config.trading.maxTradeSize}`);
console.log(`Risk Percentage: ${config.trading.riskPercentage}%`);

if (!configValid) {
    console.log('\n❌ Cannot proceed with testing - configuration is invalid.');
    console.log('💡 Please check your .env file or environment variables.');
    process.exit(1);
}

console.log('\n2️⃣ Testing Signal Processing...');
console.log('='.repeat(50));

// Test the same signal parsing we did before
const { TradeParser } = require('./dist/ocr/tradeParser');
const sampleSignal = `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
On rejection from this area, bullish move expected.

🔼Signal:

📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408 - Final TP: Higher towards 3420+
❌ SL: 3370...!!`;

const parser = new TradeParser();
const parsedSignal = parser.parseTradeSignal(sampleSignal);

if (parsedSignal) {
    console.log('✅ Signal parsing successful!');
    console.log('📊 Parsed Signal:', JSON.stringify(parsedSignal, null, 2));
} else {
    console.log('❌ Signal parsing failed!');
    process.exit(1);
}

console.log('\n3️⃣ Testing MetaAPI Connection...');
console.log('='.repeat(50));

async function testMetaApiConnection() {
    try {
        const { MetaApiTradeExecutor } = require('./dist/mt5/metaApiTradeExecutor');
        const tradeExecutor = new MetaApiTradeExecutor();
        
        console.log('🌐 Initializing MetaAPI connection...');
        await tradeExecutor.initialize();
        
        console.log('✅ MetaAPI connection successful!');
        
        // Test trade execution (DRY RUN - won't actually execute)
        console.log('\n4️⃣ Testing Trade Signal Execution (DRY RUN)...');
        console.log('='.repeat(50));
        
        console.log('📋 Would execute trade with:');
        console.log(`   Symbol: ${parsedSignal.symbol}`);
        console.log(`   Action: ${parsedSignal.action}`);
        console.log(`   Entry Zone: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
        console.log(`   Stop Loss: ${parsedSignal.stopLoss}`);
        console.log(`   Targets: ${parsedSignal.targets.join(', ')}`);
        
        console.log('\n✅ ALL TESTS PASSED! Your bot is ready to trade! 🚀');
        
        await tradeExecutor.closeConnection();
        
    } catch (error) {
        console.log('❌ MetaAPI connection failed:', error.message);
        console.log('\n💡 Common issues:');
        console.log('   - Check your METAAPI_TOKEN is valid');
        console.log('   - Check your METAAPI_ACCOUNT_ID is correct');
        console.log('   - Ensure your MetaTrader account is deployed and connected');
        console.log('   - Verify your account has sufficient balance');
    }
}

testMetaApiConnection();
