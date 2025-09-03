#!/usr/bin/env ts-node

/**
 * Test Signal Sending
 * This simulates what happens when a signal is processed by the running bot
 */

import { RealWorldTradeParser } from './src/ocr/realWorldTradeParser';

console.log('🧪 TESTING SIGNAL THAT WOULD BE SENT TO RUNNING BOT');
console.log('=' .repeat(60));

const signalText = `#XAUUSD

Best buying zone: 2450 - 2460
Stop Loss: 2440  
Target 1: 2470
Target 2: 2480
Target 3: 2490

Analysis:
Gold showing bullish momentum after breaking key resistance
Expecting continuation towards targets`;

console.log('📝 Signal Text:');
console.log(signalText);
console.log('\n🔍 This signal would be processed as follows:');

const parser = new RealWorldTradeParser();

// Check if it would be detected as a result/update message (should be skipped)
const isResultMessage = parser.isResultOrUpdateMessage(signalText);
console.log(`   Is result/update message: ${isResultMessage}`);

// Debug: Check which keyword is triggering this
if (isResultMessage) {
  const ignoreKeywords = [
    'report', 'results', 'summary', 'closed', 'hit tp', 'target reached', 'stopped out', 'result:', 
    'profit:', 'loss:', 'pips gained', 'pips lost', 'congratulations', 'well done',
    'order closed', 'order canceled', 'order modified',
    'partial close', 'close half', 'breakeven activated',
    'update', 'previous signal', 'trade closed', 'signal completed'
  ];
  
  const triggeredKeywords = ignoreKeywords.filter(keyword => 
    signalText.toLowerCase().includes(keyword.toLowerCase())
  );
  console.log(`   Triggered by keywords: ${triggeredKeywords.join(', ')}`);
}

if (isResultMessage) {
  console.log('🚫 This message would be SKIPPED (result/update detected)');
} else {
  // Parse the signal
  const signal = parser.parseTradeSignal(signalText);
  
  if (signal) {
    console.log('✅ Signal would be PARSED successfully:');
    console.log(`   Symbol: ${signal.symbol}`);
    console.log(`   Action: ${signal.action}`);
    console.log(`   Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
    console.log(`   Stop Loss: ${signal.stopLoss}`);
    console.log(`   Targets: ${signal.targets.join(', ')}`);
    
    const isValid = parser.validateTradeSignal(signal);
    console.log(`   Valid: ${isValid}`);
    
    if (isValid) {
      console.log('\n🚀 Signal would be sent to executeTradeSignal()');
      console.log('   This is where your issue occurs!');
      console.log('   Check the running bot logs to see what executeTradeSignal() returns');
    } else {
      console.log('\n❌ Signal would be REJECTED (validation failed)');
    }
  } else {
    console.log('❌ Signal would FAIL to parse');
  }
}

console.log('\n💡 Now check your running bot terminal for detailed execution logs!');
console.log('   The enhanced logging should show exactly what happens in executeTradeSignal()');
