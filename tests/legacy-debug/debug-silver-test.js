const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🧪 Testing Silver (XAGUSD) Symbol Detection...\n');

const parser = new TradeParser();

// Test various silver formats
const silverTests = [
  {
    name: 'Standard XAGUSD',
    text: 'XAGUSD BUY 25.500',
    caption: '#XAGUSD signal'
  },
  {
    name: 'SILVER keyword',
    text: 'SILVER BUY 25.500',
    caption: '#SILVER signal'  
  },
  {
    name: 'XAG format',
    text: 'XAG BUY 25.500',
    caption: '#XAG signal'
  },
  {
    name: 'Silver update message (should be skipped)',
    text: 'SILVER UPDATE: Hit TP1',
    caption: '#SILVER UPDATE'
  },
  {
    name: 'Silver result message (should be skipped)', 
    text: 'SILVER RESULT: +150 pips',
    caption: '#SILVER RESULT'
  },
  {
    name: 'Pure silver price detection',
    text: 'BUY zone: 25.450-25.500\nTP: 26.000',
    caption: 'Silver analysis'
  }
];

silverTests.forEach((test, index) => {
  console.log(`\n--- Test ${index + 1}: ${test.name} ---`);
  console.log(`Text: "${test.text}"`);
  console.log(`Caption: "${test.caption}"`);
  
  try {
    const result = parser.parseTradeSignal(test.text, test.caption);
    
    if (result) {
      console.log(`✅ SUCCESS: Symbol detected as "${result.symbol}"`);
      console.log(`   Entry: ${result.entry}`);
      console.log(`   Action: ${result.action}`);
      console.log(`   Stop: ${result.stopLoss}`);
      console.log(`   Take Profit: ${result.takeProfit}`);
    } else {
      console.log(`❌ FAILED: No signal parsed (likely result/update message)`);
    }
  } catch (error) {
    console.log(`💥 ERROR: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  }
});

console.log('\n🔍 Checking FTMO account for XAGUSD symbol availability...');

// Test FTMO symbol availability
const { MetaApiTradeExecutor } = require('./dist/mt5/metaApiTradeExecutor');

async function testFTMOSilver() {
  try {
    const executor = new MetaApiTradeExecutor({
      apiToken: process.env.METAAPI_TOKEN,
      accountId: process.env.METAAPI_ACCOUNT_ID
    });

    console.log('Connecting to FTMO account...');
    await executor.initialize();
    
    console.log('Testing XAGUSD symbol specifications...');
    const symbolSpec = await executor.getSymbolSpecification('XAGUSD');
    
    if (symbolSpec) {
      console.log('✅ XAGUSD symbol found on FTMO:');
      console.log(`   Description: ${symbolSpec.description}`);
      console.log(`   Contract Size: ${symbolSpec.contractSize}`);
      console.log(`   Min Volume: ${symbolSpec.minVolume}`);
      console.log(`   Max Volume: ${symbolSpec.maxVolume}`);
      console.log(`   Digits: ${symbolSpec.digits}`);
    } else {
      console.log('❌ XAGUSD symbol NOT found on FTMO account');
    }

    // Test current price
    const price = await executor.getSymbolPrice('XAGUSD');
    if (price) {
      console.log(`✅ Current XAGUSD price: Bid=${price.bid}, Ask=${price.ask}`);
    } else {
      console.log('❌ Could not get XAGUSD price');
    }

  } catch (error) {
    console.log(`💥 FTMO Test Error: ${error.message}`);
  }
}

// Run FTMO test if tokens are available
if (process.env.METAAPI_TOKEN && process.env.METAAPI_ACCOUNT_ID) {
  testFTMOSilver();
} else {
  console.log('⚠️ MetaAPI tokens not found - skipping FTMO test');
}
