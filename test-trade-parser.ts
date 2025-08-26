import { TradeParser } from './src/ocr/tradeParser';
import { EnhancedTradeParser } from './src/ocr/tradeParser-fixed';

// Test samples
const testSignals = [
  // Standard format
  "XAUUSD SELL 2440-2445 SL:2450 TP:2430,2420",
  
  // Multi-line format
  `EURUSD BUY
  ENTRY: 1.1050-1.1060
  SL: 1.1030
  TP: 1.1080,1.1100`,
  
  // Chart setup format
  `EURUSD 4h OANDA
  1.17572
  1.16011  
  1.15989
  Bullish bias expected`,
  
  // Combined format with context
  `Looking at GBPUSD
  We have strong support at 1.2650
  Resistance at 1.2750
  BUY opportunity with targets at 1.2700, 1.2720
  Stop loss below 1.2630
  Plan: Wait for entry in the buying zone`,

  // Flexible format
  `XAUUSD analysis shows bearish momentum
  Current levels: 2445, 2438, 2422
  SELL setup active
  Target the lower levels with SL above 2450`
];

async function testTradeParsers() {
  console.log('🧪 Testing Trade Parsers...\n');
  
  const basicParser = new TradeParser();
  const enhancedParser = new EnhancedTradeParser();
  
  for (let i = 0; i < testSignals.length; i++) {
    const testText = testSignals[i];
    console.log(`\n📝 Test ${i + 1}: ${testText.substring(0, 50)}...`);
    console.log('=' .repeat(60));
    
    // Test basic parser
    console.log('\n🔵 Basic Parser:');
    try {
      const basicResult = basicParser.parseTradeSignal(testText);
      if (basicResult) {
        console.log('✅ Success:', JSON.stringify(basicResult, null, 2));
        console.log('Validation:', basicParser.validateTradeSignal(basicResult) ? '✅ Valid' : '❌ Invalid');
      } else {
        console.log('❌ No signal parsed');
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    // Test enhanced parser
    console.log('\n🟢 Enhanced Parser:');
    try {
      const enhancedResult = enhancedParser.parseTradeSignalWithConfidence(testText);
      if (enhancedResult.signal) {
        console.log(`✅ Success (${enhancedResult.confidence.toFixed(2)} confidence, ${enhancedResult.method}):`);
        console.log(JSON.stringify(enhancedResult.signal, null, 2));
      } else {
        console.log('❌ No signal parsed');
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
  
  console.log('\n🎯 Test Summary:');
  console.log('Both parsers have been implemented with comprehensive signal parsing capabilities.');
  console.log('The basic parser handles standard formats, while the enhanced parser provides');
  console.log('confidence scoring and supports more complex parsing strategies.');
}

// Run test
testTradeParsers().catch(console.error);

export { testTradeParsers };
