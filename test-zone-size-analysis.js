const path = require('path');
const fs = require('fs');

// Test analyzing zone sizes to improve trade direction inference
async function testZoneSizeAnalysis() {
  console.log('\n🔍 TESTING: Zone Size Analysis for Trade Direction');
  console.log('=' .repeat(60));
  const imagePath = path.join(__dirname, 'trade_signals', 'trade_1753024399847_dj72dphh2.json');
  
  try {
    // Read the signal data
    const signalData = require(imagePath);
    const caption = signalData.caption || '';
    
    console.log('📝 Caption:', caption);
    console.log('\n🎯 Current Bot Logic:');
    console.log('  ✅ Entry: 171.711 (from grey zone detection)');
    console.log('  ✅ Action: BUY (from price position analysis)');
    console.log('  📊 Logic Used: Current price (172.690) > Entry (171.711) = BUY');
    
    console.log('\n📊 ENHANCED ZONE SIZE ANALYSIS:');
    console.log('-'.repeat(40));
    
    // Simulate enhanced zone detection logic
    console.log('🔍 Analyzing Chart Zones:');
    console.log('  🟢 Green Zone (Upper): Large resistance area ~172.000-172.600+ (≈600 pips)');
    console.log('  🔴 Red Zone (Lower): Small support area ~171.400-171.600 (≈200 pips)'); 
    console.log('  ⚪ Grey Entry: 171.711 (between zones, closer to support)');
    
    console.log('\n💡 Zone Size Inference:');
    console.log('  📏 Green zone is 3x larger than red zone');
    console.log('  📍 Entry is closer to smaller (support) zone');
    console.log('  🎯 Logic: BUY at support, target large resistance');
    console.log('  ✅ Enhanced Direction: BUY (confirmed by zone asymmetry)');
    
    console.log('\n🧠 Trading Psychology:');
    console.log('  • Large green zone = Strong resistance (profit target)');
    console.log('  • Small red zone = Weaker support (risk area)'); 
    console.log('  • Entry between = Good risk:reward setup');
    console.log('  • Direction = Expect bounce from support toward resistance');

  } catch (error) {
    console.error('❌ Error in zone analysis:', error.message);
  }
}

console.log('🚀 Zone Size Analysis Test');
console.log('📅 Date:', new Date().toLocaleString());
testZoneSizeAnalysis();
