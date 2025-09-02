const MetaApiTradeExecutor = require('./dist/mt5/metaApiTradeExecutor').MetaApiTradeExecutor;
const config = require('./dist/utils/config').config;

async function testMondayMarketStatus() {
  console.log('\n🧪 Testing Monday Market Status Detection...\n');
  
  try {
    // Initialize MetaAPI connection
    console.log('🔗 Connecting to MetaAPI...');
    const executor = new MetaApiTradeExecutor();
    await executor.initialize();
    console.log('✅ MetaAPI connected\n');
    
    // Test market status for XAUUSD
    console.log('📊 Testing XAUUSD market status...');
    const marketStatus = await executor.checkMarketStatus('XAUUSD');
    
    console.log('\n📋 Market Status Results:');
    console.log('   Symbol: XAUUSD');
    console.log(`   Is Open: ${marketStatus.isOpen ? '✅ YES' : '❌ NO'}`);
    console.log(`   Reason: ${marketStatus.reason}`);
    console.log(`   Server Time: ${marketStatus.serverTime}`);
    console.log(`   Price Available: ${marketStatus.price ? 'YES' : 'NO'}`);
    if (marketStatus.price) {
      console.log(`   Bid/Ask: ${marketStatus.price.bid}/${marketStatus.price.ask}`);
    }
    
    // Current time info
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
    console.log(`\n⏰ Current Time Info:`);
    console.log(`   Day: ${dayName} (${dayOfWeek})`);
    console.log(`   UTC Time: ${now.toUTCString()}`);
    console.log(`   Local Time: ${now.toString()}`);
    
    // Expected result
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isActualWeekendClosure = (dayOfWeek === 6) || (dayOfWeek === 0 && now.getUTCHours() < 21);
    
    console.log(`\n🎯 Analysis:`);
    console.log(`   Is Weekend: ${isWeekend ? 'YES' : 'NO'}`);
    console.log(`   Should be Closed (Weekend Gap): ${isActualWeekendClosure ? 'YES' : 'NO'}`);
    console.log(`   Expected Market Status: ${isActualWeekendClosure ? 'CLOSED' : 'OPEN'}`);
    console.log(`   Actual Result: ${marketStatus.isOpen ? 'OPEN' : 'CLOSED'}`);
    console.log(`   ✅ Match: ${(marketStatus.isOpen && !isActualWeekendClosure) || (!marketStatus.isOpen && isActualWeekendClosure) ? 'YES' : 'NO'}`);
    
    if (dayOfWeek === 1) {
      console.log(`\n🌟 Special Monday Test:`);
      console.log(`   It's Monday - Market should definitely be OPEN`);
      console.log(`   Result: ${marketStatus.isOpen ? '✅ CORRECT - Market detected as OPEN' : '❌ WRONG - Market incorrectly detected as CLOSED'}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
  
  console.log('\n🧪 Market Status Test Complete\n');
  process.exit(0);
}

// Run the test
testMondayMarketStatus();
