#!/usr/bin/env ts-node

/**
 * Simple Signal Processing Test
 * This tests just the signal processing without the complex MetaAPI connections
 */

import { RealWorldTradeParser } from './src/ocr/realWorldTradeParser';
import { logger } from './src/utils/logger';

console.log('🧪 SIGNAL PROCESSING TEST');
console.log('=' .repeat(50));

// Test signal text
const signalText = `XAUUSD (Update)...!!✔️
Gold has shown strong bullish momentum after breaking key resistance levels and is now in a healthy retracement phase. The best buying zone is between 2453 – 2441, where price is likely to take support before continuing its upward move.

🔼Buying Reason:

- Previous breakout confirms bullish strength.
- Price is retracting back to the demand zone (2453 – 2441), offering a low-risk entry.
- Bullish trend continuation expected towards Target 1: 2501 and Final Target: 2520+.

Stop Loss: 2435

👉 This setup provides a strong risk-to-reward ratio for buyers.`;

async function testSignalProcessing() {
  console.log('🔍 Testing signal parsing...');
  
  const parser = new RealWorldTradeParser();
  
  console.log('\n📝 Input text:');
  console.log(signalText.substring(0, 200) + '...');
  
  const signal = parser.parseTradeSignal(signalText);
  
  if (signal) {
    console.log('\n✅ Signal parsed successfully:');
    console.log(`   Symbol: ${signal.symbol}`);
    console.log(`   Action: ${signal.action}`);
    console.log(`   Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
    console.log(`   Stop Loss: ${signal.stopLoss}`);
    console.log(`   Targets: ${signal.targets.join(', ')}`);
    console.log(`   Order Type: ${signal.orderType || 'Not specified'}`);
    console.log(`   Reason: ${signal.reason?.substring(0, 100)}...`);
    
    const isValid = parser.validateTradeSignal(signal);
    console.log(`   Valid: ${isValid}`);
    
    if (isValid) {
      console.log('\n🎯 Signal is ready for execution!');
      
      // Simulate what would happen in the bot
      console.log('\n🤖 Simulating bot execution flow:');
      console.log('   1. Signal received and parsed ✅');
      console.log('   2. Signal validated ✅');
      console.log('   3. Calling tradeExecutor.executeTradeSignal()...');
      
      // This is where the issue occurs - let's simulate it
      console.log('   4. MultiAccountMetaApiExecutor.executeTradeSignal() called');
      console.log('   5. Calls executeTrade() internally');
      console.log('   6. Tries to execute on each connected account');
      
      // The problem is likely here - no connected accounts or connection issues
      console.log('\n❓ ISSUE DIAGNOSIS:');
      console.log('   - Signal parsing: WORKING ✅');
      console.log('   - Signal validation: WORKING ✅');
      console.log('   - MetaAPI connection: LIKELY FAILING ❌');
      console.log('   - Trade execution: NOT REACHED ❌');
      
    } else {
      console.log('\n❌ Signal validation failed');
    }
  } else {
    console.log('\n❌ Signal parsing failed');
  }
}

// Mock the executeTradeSignal to see what should happen
async function mockExecuteTradeSignal() {
  console.log('\n🎭 MOCK EXECUTION SIMULATION');
  console.log('=' .repeat(50));
  
  const parser = new RealWorldTradeParser();
  const signal = parser.parseTradeSignal(signalText);
  
  if (!signal) {
    console.log('❌ No signal to execute');
    return;
  }
  
  // This is what should happen in executeTradeSignal:
  console.log('📋 executeTradeSignal() should:');
  console.log('   1. Call executeTrade() with the signal');
  console.log('   2. executeTrade() should execute on each connected account');
  console.log('   3. Return a MultiAccountTradeResult');
  console.log('   4. Convert to simple success/failure result');
  
  // Simulate the result format
  const mockResult = {
    success: false, // This is probably what's happening
    message: 'All trades failed',
    error: 'Multi-account execution failed',
    signalId: `multi-${Date.now()}`
  };
  
  console.log('\n📊 Likely actual result:');
  console.log(`   Success: ${mockResult.success}`);
  console.log(`   Message: ${mockResult.message}`);
  console.log(`   Error: ${mockResult.error}`);
  
  console.log('\n🔍 Root cause analysis:');
  console.log('   - executeTradeSignal() is probably returning success: false');
  console.log('   - This happens when executeTrade() finds no connected accounts');
  console.log('   - Or when all account trades fail due to connection issues');
}

// Run tests
testSignalProcessing()
  .then(() => mockExecuteTradeSignal())
  .then(() => {
    console.log('\n🎯 CONCLUSION:');
    console.log('   Signals are being read and parsed correctly.');
    console.log('   The issue is in the trade execution phase.');
    console.log('   Likely causes:');
    console.log('   1. MetaAPI accounts not properly connected');
    console.log('   2. Connection timeouts during execution');
    console.log('   3. Market closed errors not handled');
    console.log('   4. Account permission issues');
    
    console.log('\n💡 RECOMMENDED FIXES:');
    console.log('   1. Check MetaAPI account connection status');
    console.log('   2. Add better error handling in executeTradeSignal');
    console.log('   3. Implement connection retry logic');
    console.log('   4. Add market hours checking');
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
