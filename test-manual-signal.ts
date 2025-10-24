/**
 * TEST: Manual Signal Parser
 * 
 * This demonstrates the ultra-simple manual signal format
 */

import { ManualSignalParser } from './src/services/ManualSignalParser';

const parser = new ManualSignalParser();

console.log('🧪 TESTING MANUAL SIGNAL PARSER\n');
console.log('=' .repeat(60));

// Test cases
const testSignals = [
  'XAGUSD BUY 50.9207',
  'Silver buy at 51.5000',
  'SELL GOLD 3590.50',
  'Buy EURUSD 1.0850',
  'GBPUSD SELL 1.2650',
  'XAUUSD BUY 3600.00'
];

testSignals.forEach((signal, index) => {
  console.log(`\n📝 Test ${index + 1}: "${signal}"`);
  console.log('-'.repeat(60));
  
  const parsed = parser.parseSignal(signal);
  
  if (parsed) {
    console.log('✅ PARSED SUCCESSFULLY:');
    console.log(`   Symbol: ${parsed.symbol}`);
    console.log(`   Direction: ${parsed.direction}`);
    console.log(`   Entry: ${parsed.entryPrice}`);
    console.log(`   Stop Loss: ${parsed.stopLoss} (Risk: $${parsed.riskAmount})`);
    console.log(`   Take Profit: ${parsed.takeProfit} (Reward: $${parsed.rewardAmount})`);
    console.log(`   Lot Size: ${parsed.lotSize}`);
    console.log(`   RR Ratio: 1:${parsed.rewardAmount / parsed.riskAmount}`);
    
    // Show confirmation message
    console.log('\n📋 CONFIRMATION MESSAGE:');
    console.log(parser.generateConfirmationMessage(parsed));
  } else {
    console.log('❌ FAILED TO PARSE');
  }
});

console.log('\n' + '='.repeat(60));
console.log('✅ Testing complete!\n');
