// Test Color ML Integration in Trade Parser
const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🎯 Testing Color ML Integration in TradeParser...');

async function testColorMLIntegration() {
  try {
    const parser = new TradeParser();
    
    // Your actual XAUUSD chart text with caption
    const chartText = `
Gold Spot / U.S. Dollar · 3h · OANDA
Final Target 3475.040
Target 1 3460.000
3450.397
3447.435
3440.000
3433.594 Best buying Area: (3433-3423)
3423.144
3400.000
Resistance Become a Support
GOLD TRADER...
    `;
    
    const caption = '#XAUUSD Next move on the way, focus on proper risk management';
    
    console.log('📊 Parsing with Color ML integration...');
    const signal = parser.parseTradeSignal(chartText, caption);
    
    if (signal) {
      console.log('\n✅ SUCCESS! Generated Trade Signal:');
      console.log('📈 Symbol:', signal.symbol);
      console.log('🎯 Action:', signal.action);
      console.log('🔵 Entry Zone:', `${signal.entryZone.min} - ${signal.entryZone.max}`);
      console.log('🛑 Stop Loss:', signal.stopLoss);
      console.log('🎯 Targets:', signal.targets);
      console.log('💡 Reason:', signal.reason);
      console.log('📋 Plan:', signal.plan);
      
      // Check if it used Color ML
      if (signal.reason && signal.reason.includes('Color Analysis ML')) {
        console.log('\n🎨 ✅ COLOR ML WAS USED! Perfect integration! 🚀');
      } else {
        console.log('\n🔄 Used traditional parsing (Color ML confidence may be too low)');
      }
    } else {
      console.log('\n❌ No trade signal generated');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testColorMLIntegration();
