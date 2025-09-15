/**
 * Test broker-specific symbol mapping logic
 */

const { CleanSymbolManager } = require('./src/utils/cleanSymbolManager');

function testBrokerSpecificMappings() {
  console.log('🧪 TESTING BROKER-SPECIFIC SYMBOL MAPPINGS');
  console.log('==========================================\n');

  // Test GBPJPY for different brokers
  const symbol = 'GBPJPY';
  
  console.log(`📊 Testing ${symbol} variations for different brokers:\n`);
  
  // Test InstantFunding (should include numerical ID)
  const ifproVariations = CleanSymbolManager.getSymbolVariations(symbol, 'IFPro-Trade');
  console.log(`🏢 IFPro-Trade variations (${ifproVariations.length}):`);
  console.log(`   Last 5: ${ifproVariations.slice(-5).join(', ')}`);
  console.log(`   ✅ Contains '32': ${ifproVariations.includes('32')}`);
  
  // Test FTMO (should NOT include numerical ID)
  const ftmoVariations = CleanSymbolManager.getSymbolVariations(symbol, 'FTMO-Server3');
  console.log(`\n🏢 FTMO-Server3 variations (${ftmoVariations.length}):`);
  console.log(`   Last 5: ${ftmoVariations.slice(-5).join(', ')}`);
  console.log(`   ❌ Contains '32': ${ftmoVariations.includes('32')}`);
  
  // Test Pepperstone (should NOT include numerical ID)
  const pepperstoneVariations = CleanSymbolManager.getSymbolVariations(symbol, 'Pepperstone-MT5-Live01');
  console.log(`\n🏢 Pepperstone variations (${pepperstoneVariations.length}):`);
  console.log(`   Last 5: ${pepperstoneVariations.slice(-5).join(', ')}`);
  console.log(`   ❌ Contains '32': ${pepperstoneVariations.includes('32')}`);
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 BROKER-SPECIFIC LOGIC VERIFICATION');
  console.log('='.repeat(50));
  
  if (ifproVariations.includes('32') && 
      !ftmoVariations.includes('32') && 
      !pepperstoneVariations.includes('32')) {
    console.log('✅ PERFECT! Broker-specific logic working correctly');
    console.log('   • InstantFunding gets numerical IDs');
    console.log('   • Other brokers get only standard variations');
  } else {
    console.log('❌ ERROR: Broker-specific logic not working properly');
    console.log(`   • IFPro includes '32': ${ifproVariations.includes('32')}`);
    console.log(`   • FTMO includes '32': ${ftmoVariations.includes('32')}`);
    console.log(`   • Pepperstone includes '32': ${pepperstoneVariations.includes('32')}`);
  }
  
  // Test Gold as well
  console.log('\n📊 Testing XAUUSD/Gold variations:\n');
  
  const goldIFPro = CleanSymbolManager.getSymbolVariations('XAUUSD', 'IFPro-Trade');
  const goldFTMO = CleanSymbolManager.getSymbolVariations('XAUUSD', 'FTMO-Server3');
  
  console.log(`🥇 Gold IFPro contains '67': ${goldIFPro.includes('67')}`);
  console.log(`🥇 Gold FTMO contains '67': ${goldFTMO.includes('67')}`);
  
  console.log('\n🚀 Symbol mapping system optimized for multi-broker compatibility!');
}

try {
  testBrokerSpecificMappings();
} catch (error) {
  console.error('Test failed:', error.message);
}
