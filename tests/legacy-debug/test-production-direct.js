// Direct Production ML Integration Test
const { ProductionMLIntegration } = require('./dist/ml/productionIntegration');
const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🎯 Testing Direct Production ML Integration...');

async function testDirectIntegration() {
  try {
    const parser = new TradeParser();
    
    // Test chart data
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
    
    const caption = '#XAUUSD Strong bullish setup from support zone';
    
    console.log('📊 Step 1: Parse with standard parser...');
    const originalSignal = parser.parseTradeSignal(chartText, caption);
    console.log('📈 Original Signal:', originalSignal ? 'Found' : 'Not found');
    
    console.log('\n🎨 Step 2: Apply Production ML Enhancement...');
    const enhancedSignal = await ProductionMLIntegration.enhanceTradeSignal(originalSignal, chartText, caption);
    
    if (enhancedSignal) {
      console.log('\n✅ ENHANCED SIGNAL GENERATED:');
      console.log('📈 Symbol:', enhancedSignal.symbol);
      console.log('🎯 Action:', enhancedSignal.action);
      console.log('🔵 Entry Zone:', `${enhancedSignal.entryZone.min} - ${enhancedSignal.entryZone.max}`);
      console.log('🛑 Stop Loss:', enhancedSignal.stopLoss);
      console.log('🎯 Targets:', enhancedSignal.targets);
      console.log('💡 Reason:', enhancedSignal.reason);
      
      console.log('\n🔍 Step 3: Risk Assessment...');
      const risk = ProductionMLIntegration.assessSignalRisk(enhancedSignal, chartText);
      
      console.log('⚠️ Risk Level:', risk.riskLevel);
      console.log('✅ Should Trade:', risk.shouldTrade);
      console.log('📋 Warnings:', risk.warnings);
      console.log('💡 Recommendation:', risk.recommendation);
      
      // Calculate metrics
      const entryCenter = (enhancedSignal.entryZone.min + enhancedSignal.entryZone.max) / 2;
      const riskPoints = Math.abs(entryCenter - enhancedSignal.stopLoss);
      const rewardPoints = Math.abs(enhancedSignal.targets[0] - entryCenter);
      const rrRatio = rewardPoints / riskPoints;
      
      console.log('\n📊 Trade Metrics:');
      console.log('⚖️ Risk:', riskPoints.toFixed(2), 'points');
      console.log('💰 Reward:', rewardPoints.toFixed(2), 'points');
      console.log('📈 R:R Ratio:', rrRatio.toFixed(2) + ':1');
      
      if (enhancedSignal.reason?.includes('Color Analysis ML')) {
        console.log('\n🎨 ✅ COLOR ML SUCCESSFULLY INTEGRATED IN PRODUCTION! 🚀');
      }
      
      if (risk.shouldTrade) {
        console.log('\n🚀 ✅ READY FOR LIVE TRADING! Signal approved by risk management.');
      } else {
        console.log('\n🚨 ⚠️ Signal rejected by risk management - review required.');
      }
      
    } else {
      console.log('\n❌ No enhanced signal generated');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDirectIntegration();
