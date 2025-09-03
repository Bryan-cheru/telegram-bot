#!/usr/bin/env ts-node

/**
 * SIMPLE TRADE EXECUTOR TEST
 * Tests just the trade executor without all the bot complexity
 */

import { MultiAccountMetaApiExecutor } from './src/mt5/multiAccountMetaApiExecutor';
import { TradeSignal } from './src/types';

console.log('🔧 SIMPLE TRADE EXECUTOR TEST');
console.log('=' .repeat(50));

async function testExecutor() {
  const signal: TradeSignal = {
    symbol: 'XAUUSD',
    action: 'BUY',
    entryZone: { min: 2450, max: 2460 },
    stopLoss: 2420, // Increased distance from entry
    targets: [2490, 2520, 2550], // Increased distances
    orderType: 'MARKET'
  };

  console.log('🎯 Testing with signal:', signal);
  
  const executor = new MultiAccountMetaApiExecutor();
  
  try {
    console.log('\n1️⃣ Initializing...');
    await executor.initialize();
    
    console.log('\n2️⃣ Checking connection...');
    const isConnected = await executor.isConnected();
    console.log(`Connected: ${isConnected}`);
    
    if (!isConnected) {
      console.log('❌ Not connected - this is your problem!');
      const statuses = executor.getAccountStatuses();
      console.log('Account statuses:', statuses);
      return;
    }
    
    console.log('\n3️⃣ Executing trade...');
    const result = await executor.executeTradeSignal(signal);
    
    console.log('\n✅ Result:');
    console.log(`Success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    console.log(`Error: ${result.error || 'None'}`);
    
    if (result.success) {
      console.log('\n🎉 TRADE EXECUTION WORKS!');
      console.log('The problem is NOT in the trade executor');
    } else {
      console.log('\n❌ TRADE EXECUTION FAILED');
      console.log('This is where your problem is!');
    }
    
  } catch (error: any) {
    console.error('\n💥 Exception:', error.message);
  } finally {
    try {
      await executor.closeConnection();
      console.log('\n🧹 Cleaned up');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

testExecutor().catch(console.error);
