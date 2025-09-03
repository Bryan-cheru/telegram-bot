#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 DETAILED SILVER PARSING DEBUG');
console.log('==================================================');

async function debugSilverParsing() {
  try {
    const { RealWorldTradeParser } = await import('./src/ocr/realWorldTradeParser');
    const parser = new RealWorldTradeParser();
    
    const testSignal = `🔥 #SILVER SIGNAL 🔥
📈 BUY SILVER
🎯 Entry: 25.50-25.60
⛔ Stop Loss: 25.00
🎯 TP1: 26.00
🎯 TP2: 26.50
🎯 TP3: 27.00`;

    console.log('📋 Test Signal:');
    console.log(testSignal);
    console.log('\n🔍 Step-by-step debugging...\n');
    
    // Test symbol extraction directly
    console.log('1️⃣ Testing symbol extraction:');
    const symbolResult = (parser as any).extractSymbol(testSignal);
    console.log(`Symbol extracted: "${symbolResult}"`);
    
    // Test action detection
    console.log('\n2️⃣ Testing action detection:');
    const actionResult = (parser as any).detectAction(testSignal);
    console.log(`Action detected: "${actionResult}"`);
    
    // Test entry zone extraction
    console.log('\n3️⃣ Testing entry zone extraction:');
    const entryResult = (parser as any).extractEntryZone(testSignal, symbolResult);
    console.log(`Entry zone: ${JSON.stringify(entryResult)}`);
    
    // Test stop loss extraction
    console.log('\n4️⃣ Testing stop loss extraction:');
    console.log('(Skipping - private method)');
    
    // Test targets extraction
    console.log('\n5️⃣ Testing targets extraction:');
    console.log('(Skipping - private method)');
    
    console.log('\n6️⃣ Full parsing result:');
    const fullResult = parser.parseTradeSignal(testSignal);
    console.log(JSON.stringify(fullResult, null, 2));
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugSilverParsing();
