#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 SILVER SYMBOL TEST');
console.log('==================================================');

const silverSignals = [
  '#SILVER BUY signal test',
  'SILVER BUY 25.50 SL 25.00 TP 26.00',
  '🔥 #SILVER SIGNAL 🔥\n📈 BUY\n🎯 Entry: 25.50\n⛔ SL: 25.00\n🎯 TP: 26.00',
  'Silver trade incoming'
];

async function testSilverParsing() {
  try {
    console.log('1️⃣ Testing silver symbol parsing...\n');
    
    const { RealWorldTradeParser } = await import('./src/ocr/realWorldTradeParser');
    const parser = new RealWorldTradeParser();
    
    silverSignals.forEach((signal, index) => {
      console.log(`📋 Test ${index + 1}: "${signal}"`);
      const parsed = parser.parseTradeSignal(signal);
      
      if (parsed) {
        console.log(`✅ Parsed: ${parsed.symbol} ${parsed.action}`);
        console.log(`   Entry: ${JSON.stringify(parsed.entryZone)}`);
        console.log(`   SL: ${parsed.stopLoss}, TP: ${parsed.targets}`);
      } else {
        console.log('❌ Failed to parse');
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSilverParsing();
