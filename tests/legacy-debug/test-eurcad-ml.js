// Test Color ML with EURCAD chart
const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🍁 Testing Color ML with EURCAD Chart...');

async function testEURCADColorML() {
  try {
    const parser = new TradeParser();
    
    // EURCAD chart text (typical forex chart with entry zones)
    const eurcadText = `
EUR/CAD · 4h · TradingView
Target 3: 1.6185
Target 2: 1.6165  
Target 1: 1.6145
1.6125
1.6105 Best buying Area: (1.6105-1.6085)
1.6095
1.6085
1.6075
1.6055 Stop Loss
Strong Support Zone
EURCAD ANALYSIS...
    `;
    
    const caption = '#EURCAD Bullish setup from support, focus on proper risk management';
    
    console.log('📊 Parsing EURCAD with Color ML...');
    const signal = parser.parseTradeSignal(eurcadText, caption);
    
    if (signal) {
      console.log('\n✅ EURCAD Signal Generated:');
      console.log('📈 Symbol:', signal.symbol);
      console.log('🎯 Action:', signal.action);
      console.log('🔵 Entry Zone:', `${signal.entryZone.min} - ${signal.entryZone.max}`);
      console.log('🛑 Stop Loss:', signal.stopLoss);
      console.log('🎯 Targets:', signal.targets);
      console.log('💡 Reason:', signal.reason);
      
      // Calculate Risk-Reward
      const entryCenter = (signal.entryZone.min + signal.entryZone.max) / 2;
      const risk = Math.abs(entryCenter - signal.stopLoss);
      const reward = Math.abs(signal.targets[0] - entryCenter);
      const rr = reward / risk;
      
      console.log('\n📊 Risk-Reward Analysis:');
      console.log('⚖️ Risk:', risk.toFixed(5), 'CAD');
      console.log('💰 Reward:', reward.toFixed(5), 'CAD');
      console.log('📈 R:R Ratio:', rr.toFixed(2) + ':1');
      
      if (signal.reason && signal.reason.includes('Color Analysis ML')) {
        console.log('\n🎨 ✅ COLOR ML WORKED FOR EURCAD TOO! 🇪🇺🇨🇦');
      }
    } else {
      console.log('\n❌ No EURCAD signal generated');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testEURCADColorML();
