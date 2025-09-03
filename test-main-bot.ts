#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🔧 MAIN BOT SIGNAL PROCESSING TEST');
console.log('==================================================');

// Test signal (realistic XAUUSD signal)
const testSignal = `
🔥 GOLD SIGNAL 🔥

📈 BUY XAUUSD
🎯 Entry: 2450-2460
⛔ Stop Loss: 2420
🎯 TP1: 2490
🎯 TP2: 2520  
🎯 TP3: 2550

Risk: 2%
`;

console.log('🎯 Testing with realistic signal:', testSignal);

async function testMainBot() {
  try {
    console.log('\n1️⃣ Testing just the parser...');
    
    const { RealWorldTradeParser } = await import('./src/ocr/realWorldTradeParser');
    const parser = new RealWorldTradeParser();
    
    const parsedSignal = parser.parseTradeSignal(testSignal);
    
    console.log('\n📋 Parsed signal:', JSON.stringify(parsedSignal, null, 2));
    
    if (!parsedSignal) {
      console.log('❌ Signal parsing failed');
      return;
    }
    
    console.log('\n2️⃣ Testing trade executor directly...');
    
    const { MultiAccountMetaApiExecutor } = await import('./src/mt5/multiAccountMetaApiExecutor');
    const executor = new MultiAccountMetaApiExecutor();
    
    console.log('\n3️⃣ Initializing executor...');
    await executor.initialize();
    
    console.log('\n4️⃣ Checking connection...');
    const isConnected = await executor.isConnected();
    console.log(`Connected: ${isConnected}`);
    
    if (!isConnected) {
      console.log('❌ Executor not connected');
      return;
    }
    
    console.log('\n5️⃣ Executing signal...');
    const result = await executor.executeTradeSignal(parsedSignal);
    
    console.log('\n📊 Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ MAIN BOT FLOW WORKS PERFECTLY!');
    } else {
      console.log('❌ Trade execution failed:', result.error);
    }
    
    console.log('\n6️⃣ Cleaning up...');
    await executor.cleanup();
    
  } catch (error) {
    console.error('\n❌ MAIN BOT TEST FAILED');
    console.error('Error:', error);
    
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
  
  // Give time for async operations to complete
  setTimeout(() => {
    console.log('\n🧹 Test finished');
    process.exit(0);
  }, 2000);
}

testMainBot();
