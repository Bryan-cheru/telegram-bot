// Test Trade Signal Processing Logic
// This tests the parsing logic without requiring the full bot

// Mock trading signal examples
const testSignals = [
  {
    caption: "#EURCAD (SELL SETUP) 📊",
    text: `
Selling Zone: 1.6100 - 1.6120
SL: 1.6150
TP: 1.6050
Risk Management: Use 2% risk per trade
    `,
    description: "EURCAD Sell Signal with proper structure"
  },
  
  {
    caption: "#XAUUSD Gold Analysis 📈",
    text: `
BUY Zone: 2650 - 2655
Stop Loss: 2640
Take Profit: 2670
Risk: 2%
    `,
    description: "Gold Buy Signal"
  },
  
  {
    caption: "#EURCAD (Update) 📊",
    text: `
Next move on the way — focus on proper risk management & stay disciplined. 
Wishing you successful trades....!!✅
    `,
    description: "Update message (should be skipped)"
  },
  
  {
    caption: "#GBPUSD Setup Ready 💰",
    text: `
Buy Limit: 1.2650-1.2680
SL: 1.2620
TP1: 1.2720
TP2: 1.2750
    `,
    description: "GBPUSD Buy Signal with multiple targets"
  }
];

// Predefined symbols (from your bot)
const FOREX_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
  'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF',
  'EURCAD'
];
const METAL_SYMBOLS = ['XAUUSD', 'XAGUSD', 'GOLD', 'SILVER'];
const INDEX_SYMBOLS = ['US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225'];

function isValidSymbol(symbol) {
  const allSymbols = [...FOREX_PAIRS, ...METAL_SYMBOLS, ...INDEX_SYMBOLS];
  return allSymbols.includes(symbol.toUpperCase());
}

function isResultOrUpdateMessage(text) {
  const updatePatterns = [
    /(?:update|result|closed|hit|reached)/i,
    /(?:next move|wishing you|successful trades)/i,
    /(?:focus on|stay disciplined)/i
  ];
  return updatePatterns.some(pattern => pattern.test(text));
}

async function testTradeProcessing() {
  console.log("🤖 Testing Telegram Bot Trade Signal Processing\n");
  console.log("=" .repeat(60));
  
  for (let i = 0; i < testSignals.length; i++) {
    const signal = testSignals[i];
    console.log(`\n📨 TEST ${i + 1}: ${signal.description}`);
    console.log("-".repeat(50));
    console.log(`Caption: "${signal.caption}"`);
    console.log(`Text: "${signal.text.trim()}"`);
    
    // Test symbol extraction
    console.log("\n🔍 Symbol Detection:");
    const hashtagMatch = signal.caption.match(/#([A-Z0-9]{3,10})(?:\s|\(|\b|$)/i);
    if (hashtagMatch) {
      const rawSymbol = hashtagMatch[1].toUpperCase();
      let normalizedSymbol = rawSymbol;
      
      // Apply normalization
      if (['GOLD', 'XAU'].includes(rawSymbol)) normalizedSymbol = 'XAUUSD';
      else if (['SILVER', 'XAG'].includes(rawSymbol)) normalizedSymbol = 'XAGUSD';
      
      const isValid = isValidSymbol(normalizedSymbol);
      console.log(`✅ Hashtag found: #${rawSymbol} → Symbol: ${normalizedSymbol}`);
      console.log(`📋 Valid symbol: ${isValid ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log("❌ No hashtag pattern found");
    }
    
    // Test if it's an update message
    const combinedText = `${signal.caption} ${signal.text}`;
    const isUpdate = isResultOrUpdateMessage(combinedText);
    console.log(`\n📊 Is Update/Result Message: ${isUpdate ? '✅ Yes (will skip)' : '❌ No (will process)'}`);
    
    if (!isUpdate) {
      // Test signal components
      console.log("\n🎯 Signal Analysis:");
      
      const hasBuyKeywords = /(?:buy|buying|long|bull)/i.test(combinedText);
      const hasSellKeywords = /(?:sell|selling|short|bear)/i.test(combinedText);
      const hasPrices = /\d+\.?\d*/g.test(combinedText);
      const hasStopLoss = /(?:sl|stop)/i.test(combinedText);
      const hasTargets = /(?:tp|target|take profit)/i.test(combinedText);
      
      console.log(`📈 Buy keywords: ${hasBuyKeywords ? '✅' : '❌'}`);
      console.log(`📉 Sell keywords: ${hasSellKeywords ? '✅' : '❌'}`);
      console.log(`💰 Has prices: ${hasPrices ? '✅' : '❌'}`);
      console.log(`🛑 Has stop loss: ${hasStopLoss ? '✅' : '❌'}`);
      console.log(`🎯 Has targets: ${hasTargets ? '✅' : '❌'}`);
      
      const hasDirection = hasBuyKeywords || hasSellKeywords;
      const hasRequiredData = hasPrices && hasStopLoss && hasTargets;
      const canParse = hasDirection && hasRequiredData;
      
      console.log(`\n🎯 Can Create Trade Signal: ${canParse ? '✅ YES' : '❌ NO'}`);
      
      if (canParse) {
        const action = hasBuyKeywords ? 'BUY' : 'SELL';
        console.log(`📊 Trade Action: ${action}`);
        
        // Extract price ranges (basic)
        const prices = combinedText.match(/\d+\.?\d*/g)?.map(p => parseFloat(p)).filter(p => p > 0);
        if (prices && prices.length >= 3) {
          console.log(`💰 Extracted prices: ${prices.slice(0, 5).join(', ')}${prices.length > 5 ? '...' : ''}`);
        }
      }
    }
    
    console.log("\n" + "=".repeat(50));
  }
  
  // Test environment configuration
  console.log("\n🌐 Environment Configuration:");
  console.log("-".repeat(50));
  
  const hasMetaToken = !!process.env.METAAPI_TOKEN;
  const hasAccountId = !!process.env.METAAPI_ACCOUNT_ID;
  const hasBotToken = !!process.env.BOT_TOKEN;
  const hasChannelId = !!process.env.ALLOWED_CHANNEL_ID;
  
  console.log(`🔑 BOT_TOKEN: ${hasBotToken ? 'Set ✅' : 'Missing ❌'}`);
  console.log(`📢 ALLOWED_CHANNEL_ID: ${hasChannelId ? 'Set ✅' : 'Missing ❌'}`);
  console.log(`🔑 METAAPI_TOKEN: ${hasMetaToken ? 'Set ✅' : 'Missing ❌'}`);
  console.log(`🏦 METAAPI_ACCOUNT_ID: ${hasAccountId ? 'Set ✅' : 'Missing ❌'}`);
  
  const isFullyConfigured = hasBotToken && hasChannelId && hasMetaToken && hasAccountId;
  console.log(`\n🚀 Bot Ready for Trading: ${isFullyConfigured ? '✅ YES' : '❌ NO'}`);
  
  if (isFullyConfigured) {
    console.log("\n✅ Your bot can execute trades when:");
    console.log("   ✓ Valid trading signal detected (not update message)");
    console.log("   ✓ Signal contains: symbol, action, entry, stop loss, targets");
    console.log("   ✓ Message from authorized Telegram channel");
    console.log("   ✓ MetaAPI connection established");
  } else {
    console.log("\n❌ Missing configuration - check your .env file");
  }
}

// Run the test
testTradeProcessing();
