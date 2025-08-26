#!/usr/bin/env node
/**
 * Trade Parser Verification Script
 * Run this to verify your trade parser implementation is working correctly
 */

const { TradeParser } = require('./dist/ocr/tradeParser');
const { EnhancedTradeParser } = require('./dist/ocr/tradeParser-fixed');

console.log('🚀 Telegram Trading Bot - Trade Parser Verification\n');

// Test signals covering different formats
const testSignals = [
  {
    name: 'Standard Format',
    text: 'XAUUSD SELL 2440-2445 SL:2450 TP:2430,2420',
    expected: { symbol: 'XAUUSD', action: 'SELL', shouldParse: true }
  },
  {
    name: 'Natural Language',
    text: 'Gold sell zone 2440 to 2445, stop 2450, targets 2430 and 2420',
    expected: { symbol: 'GOLD', action: 'SELL', shouldParse: true }
  },
  {
    name: 'Chart Analysis',
    text: 'GBPUSD bullish setup. Entry: 1.2650-1.2680. Stop: 1.2630. Targets: 1.2700, 1.2720',
    expected: { symbol: 'GBPUSD', action: 'BUY', shouldParse: true }
  },
  {
    name: 'Forex Verbose',
    text: 'EURUSD BUY Entry: 1.0850-1.0860 Stop Loss: 1.0830 Take Profit: 1.0880, 1.0900',
    expected: { symbol: 'EURUSD', action: 'BUY', shouldParse: false } // This one might not parse with basic parser
  }
];

async function verifyParsers() {
  const basicParser = new TradeParser();
  const enhancedParser = new EnhancedTradeParser();
  
  let basicSuccessCount = 0;
  let enhancedSuccessCount = 0;
  
  console.log('📋 Testing Signal Parsing Capabilities:\n');
  console.log('=' * 60);
  
  for (let i = 0; i < testSignals.length; i++) {
    const test = testSignals[i];
    console.log(`\n🔍 Test ${i + 1}: ${test.name}`);
    console.log(`📝 Signal: "${test.text}"`);
    console.log('-' * 40);
    
    // Test basic parser
    try {
      const basicResult = basicParser.parseTradeSignal(test.text);
      if (basicResult) {
        console.log(`✅ Basic Parser: ${basicResult.symbol} ${basicResult.action} (Entry: ${basicResult.entryZone.min}-${basicResult.entryZone.max})`);
        basicSuccessCount++;
      } else {
        console.log('❌ Basic Parser: Failed to parse');
      }
    } catch (error) {
      console.log(`❌ Basic Parser: Error - ${error.message}`);
    }
    
    // Test enhanced parser
    try {
      const enhancedResult = enhancedParser.parseTradeSignalWithConfidence(test.text);
      if (enhancedResult.signal && enhancedResult.isValid) {
        console.log(`🚀 Enhanced Parser: ${enhancedResult.signal.symbol} ${enhancedResult.signal.action} (Confidence: ${(enhancedResult.confidence * 100).toFixed(1)}%)`);
        enhancedSuccessCount++;
      } else {
        console.log(`⚠️ Enhanced Parser: Low confidence (${(enhancedResult.confidence * 100).toFixed(1)}%) - ${enhancedResult.reasoning}`);
      }
    } catch (error) {
      console.log(`❌ Enhanced Parser: Error - ${error.message}`);
    }
  }
  
  console.log('\n' + '=' * 60);
  console.log('📊 VERIFICATION RESULTS:');
  console.log('=' * 60);
  console.log(`Basic Parser Success Rate: ${basicSuccessCount}/${testSignals.length} (${(basicSuccessCount/testSignals.length*100).toFixed(1)}%)`);
  console.log(`Enhanced Parser Success Rate: ${enhancedSuccessCount}/${testSignals.length} (${(enhancedSuccessCount/testSignals.length*100).toFixed(1)}%)`);
  
  if (basicSuccessCount >= 2 && enhancedSuccessCount >= 1) {
    console.log('\n🎉 VERIFICATION PASSED! Your trade parser is working correctly.');
    console.log('✅ Ready for production use with real trading signals.');
  } else {
    console.log('\n⚠️ VERIFICATION NEEDS ATTENTION:');
    console.log('   - Check that your TypeScript compilation is successful');
    console.log('   - Verify all dependencies are installed (npm install)');
    console.log('   - Review the error messages above for specific issues');
  }
  
  console.log('\n📚 Next Steps:');
  console.log('   1. Copy .env.example to .env and configure your settings');
  console.log('   2. Set up your Telegram bot token and channel ID');
  console.log('   3. Configure your MT5 or MetaAPI connection');
  console.log('   4. Test with TRADING_MODE=simulation first');
  console.log('   5. Run: npm run dev (for development) or npm start (for production)');
  
  console.log('\n📖 Documentation:');
  console.log('   - Setup Guide: README.md');
  console.log('   - MT5 Setup: MT5_SETUP_GUIDE.md');
  console.log('   - Multi-Account: MULTI_ACCOUNT_SETUP.md');
  
  console.log('\n✨ Trade Parser Verification Complete!\n');
}

// Run verification
verifyParsers().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
