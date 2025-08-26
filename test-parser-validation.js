const { TradeParser } = require('./dist/ocr/tradeParser');
const { EnhancedTradeParser } = require('./dist/ocr/tradeParser-fixed');

console.log('🧪 Testing Trade Parser Implementation...\n');

const parser = new TradeParser();
const enhancedParser = new EnhancedTradeParser();

// Test cases
const testSignals = [
  'XAUUSD SELL 2440-2445 SL:2450 TP:2430,2420',
  'EURUSD BUY Entry: 1.0850-1.0860 Stop Loss: 1.0830 Take Profit: 1.0880, 1.0900',
  'Gold sell zone 2440 to 2445, stop 2450, targets 2430 and 2420',
  'GBPUSD\n1.2650\n1.2680\nBUY setup ready',
  'Chart shows USDJPY bullish bias. Current: 148.50. Resistance: 149.00. Support: 147.80'
];

console.log('🔍 Basic TradeParser Results:');
console.log('='.repeat(50));

testSignals.forEach((signal, index) => {
  console.log(`\n📊 Test ${index + 1}: "${signal}"`);
  try {
    const result = parser.parseTradeSignal(signal);
    if (result) {
      console.log(`✅ Parsed: ${result.symbol} ${result.action} Entry: ${result.entryZone.min}-${result.entryZone.max} SL: ${result.stopLoss} TP: ${result.targets.join(',')}`);
    } else {
      console.log('❌ Failed to parse');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
});

console.log('\n\n🚀 Enhanced TradeParser Results:');
console.log('='.repeat(50));

testSignals.forEach((signal, index) => {
  console.log(`\n📊 Test ${index + 1}: "${signal}"`);
  try {
    const result = enhancedParser.parseTradeSignalWithConfidence(signal);
    if (result.signal && result.isValid) {
      console.log(`✅ Parsed: ${result.signal.symbol} ${result.signal.action} Entry: ${result.signal.entryZone.min}-${result.signal.entryZone.max} SL: ${result.signal.stopLoss} TP: ${result.signal.targets.join(',')}`);
      console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}% | Valid: ${result.isValid}`);
      if (result.reasoning) {
        console.log(`💭 Reasoning: ${result.reasoning}`);
      }
    } else {
      console.log(`❌ Failed to parse (Confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      if (result.reasoning) {
        console.log(`💭 Reason: ${result.reasoning}`);
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
});

console.log('\n✅ Trade Parser Implementation Test Complete!');
