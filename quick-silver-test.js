#!/usr/bin/env node

// Quick SILVER Symbol Test
// This will test the silver symbol detection once the bot is running

console.log('🥈 QUICK SILVER SYMBOL TEST');
console.log('Waiting for bot to fully initialize before testing...\n');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function quickSilverTest() {
    // Wait for the bot to initialize properly
    console.log('⏳ Waiting 30 seconds for bot to fully sync...');
    await delay(30000);
    
    console.log('\n🧪 TESTING SILVER SYMBOL DETECTION:');
    console.log('Once your bot is running, send this test signal to your Telegram channel:');
    console.log('');
    console.log('📱 TEST MESSAGE TO SEND:');
    console.log('─'.repeat(40));
    console.log('🔥 #SILVER SIGNAL 🔥');
    console.log('📈 BUY SILVER');
    console.log('🎯 Entry: 30.50');
    console.log('⛔ SL: 30.00');
    console.log('🎯 TP: 31.00');
    console.log('─'.repeat(40));
    console.log('');
    console.log('👀 WATCH FOR THESE LOGS:');
    console.log('✅ Good: "🔄 Silver fallback: Using [SYMBOL] instead of XAGUSD"');
    console.log('❌ Problem: "❌ No silver symbols available on brokers"');
    console.log('✅ Success: "✅ Trade successful on [BROKER]: [ORDER_ID]"');
    
    console.log('\n🎯 EXPECTED BEHAVIOR:');
    console.log('1. Enhanced symbol detector will try XAGUSD first');
    console.log('2. If XAGUSD fails, it will try fallback symbols: SILVER, XAGEUR, XAG/USD, etc.');
    console.log('3. If a symbol is found, trade will execute successfully');
    console.log('4. If no symbols found, trade will be skipped with clear warning');
    
    console.log('\n✅ Test script complete. Now send the test message and watch the logs!');
}

quickSilverTest();
