#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 COMPREHENSIVE SIGNAL TESTING SUITE');
console.log('==================================================');

// Different signal formats to test
const testSignals = [
  {
    name: "Standard Gold Signal",
    signal: `
🔥 GOLD SIGNAL 🔥

📈 BUY XAUUSD
🎯 Entry: 2450-2460
⛔ Stop Loss: 2420
🎯 TP1: 2490
🎯 TP2: 2520  
🎯 TP3: 2550

Risk: 2%
`
  },
  {
    name: "EUR/USD Forex Signal",
    signal: `
💶 FOREX SIGNAL 💶

📉 SELL EURUSD
🎯 Entry: 1.0850-1.0860
⛔ Stop Loss: 1.0890
🎯 TP1: 1.0820
🎯 TP2: 1.0800
🎯 TP3: 1.0780

Risk: 1.5%
`
  },
  {
    name: "GBP/USD Market Order",
    signal: `
🇬🇧 MARKET ORDER 🇬🇧

📈 BUY GBPUSD NOW
Entry: MARKET
⛔ Stop Loss: 1.2650
🎯 TP: 1.2750

Risk: 1%
`
  },
  {
    name: "Oil Signal",
    signal: `
🛢️ OIL TRADING 🛢️

📉 SELL USOIL
🎯 Entry Zone: 75.50-76.00
⛔ SL: 77.00
🎯 Target 1: 74.00
🎯 Target 2: 73.00

Risk: 2.5%
`
  }
];

async function testSignalProcessing() {
  console.log('📋 Testing signal parsing only (no trades executed)...\n');
  
  try {
    const { RealWorldTradeParser } = await import('./src/ocr/realWorldTradeParser');
    const parser = new RealWorldTradeParser();
    
    for (let i = 0; i < testSignals.length; i++) {
      const test = testSignals[i];
      console.log(`${i + 1}️⃣ Testing: ${test.name}`);
      console.log('📤 Input Signal:');
      console.log(test.signal.trim());
      
      const parsed = parser.parseTradeSignal(test.signal);
      
      if (parsed) {
        console.log('✅ Successfully Parsed:');
        console.log(`   Symbol: ${parsed.symbol}`);
        console.log(`   Action: ${parsed.action}`);
        console.log(`   Entry: ${parsed.entryZone?.min || 'MARKET'}-${parsed.entryZone?.max || 'MARKET'}`);
        console.log(`   Stop Loss: ${parsed.stopLoss}`);
        console.log(`   Targets: ${parsed.targets.join(', ')}`);
        console.log(`   Order Type: ${parsed.orderType}`);
      } else {
        console.log('❌ Failed to Parse Signal');
      }
      
      console.log('─'.repeat(50));
    }
    
    console.log('\n🎯 Signal Processing Tests Complete!');
    
    // Test with one live trade execution
    console.log('\n🚀 Testing ONE live trade execution with the first signal...');
    const firstSignal = testSignals[0];
    const parsedSignal = parser.parseTradeSignal(firstSignal.signal);
    
    if (parsedSignal) {
      const { MultiAccountMetaApiExecutor } = await import('./src/mt5/multiAccountMetaApiExecutor');
      const executor = new MultiAccountMetaApiExecutor();
      
      console.log('📡 Initializing executor...');
      await executor.initialize();
      
      const isConnected = await executor.isConnected();
      if (isConnected) {
        console.log('🎯 Executing test trade...');
        const result = await executor.executeTradeSignal(parsedSignal);
        
        console.log('📊 Live Test Result:', {
          success: result.success,
          message: result.message
        });
        
        await executor.cleanup();
      } else {
        console.log('❌ Executor not connected - skipping live test');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  setTimeout(() => {
    console.log('\n🧹 All tests finished');
    process.exit(0);
  }, 2000);
}

testSignalProcessing();
