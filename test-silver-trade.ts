#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🥈 SILVER TRADE EXECUTION TEST');
console.log('==================================================');

async function testSilverTrade() {
  try {
    const { MultiAccountMetaApiExecutor } = await import('./src/mt5/multiAccountMetaApiExecutor');
    const { RealWorldTradeParser } = await import('./src/ocr/realWorldTradeParser');
    
    const parser = new RealWorldTradeParser();
    const executor = new MultiAccountMetaApiExecutor();
    
    // Test silver signal
    const silverSignal = `🔥 #SILVER SIGNAL 🔥
📈 BUY SILVER
🎯 Entry: 25.50-25.60
⛔ Stop Loss: 25.00
🎯 TP1: 26.00
🎯 TP2: 26.50
🎯 TP3: 27.00`;

    console.log('1️⃣ Parsing silver signal...');
    const parsed = parser.parseTradeSignal(silverSignal);
    
    if (!parsed) {
      console.log('❌ Failed to parse signal');
      return;
    }
    
    console.log('✅ Parsed signal:');
    console.log(`   Symbol: ${parsed.symbol} (converted from SILVER)`);
    console.log(`   Action: ${parsed.action}`);
    console.log(`   Entry: ${parsed.entryZone.min} - ${parsed.entryZone.max}`);
    console.log(`   SL: ${parsed.stopLoss}, TP: ${parsed.targets.join(', ')}`);
    
    console.log('\n2️⃣ Initializing executor...');
    await executor.initialize();
    
    const isConnected = await executor.isConnected();
    if (!isConnected) {
      console.log('❌ Not connected to MetaAPI');
      return;
    }
    
    console.log('\n3️⃣ Executing XAGUSD trade...');
    const result = await executor.executeTradeSignal(parsed);
    
    console.log('\n📊 Trade Result:');
    console.log(`Success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    
    await executor.cleanup();
    
    if (result.success) {
      console.log('\n🎉 SILVER TRADING WORKS!');
      console.log('Your #SILVER signals will now be converted to XAGUSD and executed properly.');
    } else {
      console.log('\n⚠️ Trade execution had issues (check broker symbols)');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
  
  setTimeout(() => {
    console.log('\n🧹 Test complete');
    process.exit(0);
  }, 2000);
}

testSilverTrade();
