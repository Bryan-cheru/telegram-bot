const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🧪 Testing your specific signal format...\n');

const parser = new TradeParser();

// Your exact signal format
const testSignal = `#XAUUSD (Update) Selling Setup 📊

Gold has tested the upper resistance zone (3379–3384) where selling pressure is expected. From this zone, a possible downside move towards the 3357–3344 levels can be seen.

⚠️ This setup is a bit risky due to recent volatility, so make sure to trade with proper money management.

❌ SL: 3393
🏹 TP: 3357 / 3344`;

console.log('📝 Signal text:');
console.log(testSignal);
console.log('\n' + '='.repeat(50));

try {
  const result = parser.parseTradeSignal(testSignal);
  
  if (result) {
    console.log('✅ SUCCESSFULLY PARSED!');
    console.log(`📊 Symbol: ${result.symbol}`);
    console.log(`📈 Action: ${result.action}`);
    console.log(`🎯 Entry Zone: ${result.entryZone.min} - ${result.entryZone.max}`);
    console.log(`🛑 Stop Loss: ${result.stopLoss}`);
    console.log(`🎯 Targets: ${result.targets.join(', ')}`);
    if (result.reason) console.log(`💭 Reason: ${result.reason}`);
    
    console.log('\n🎉 This signal format is now supported!');
  } else {
    console.log('❌ Failed to parse - need further enhancement');
  }
} catch (error) {
  console.log('❌ Error:', error.message);
}

console.log('\n✨ Test complete!');
