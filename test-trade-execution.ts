#!/usr/bin/env ts-node

/**
 * Direct Trade Execution Test
 * This tests the actual trade execution flow to identify where it's failing
 */

import { MultiAccountMetaApiExecutor } from './src/mt5/multiAccountMetaApiExecutor';
import { TradeSignal } from './src/types';
import { logger } from './src/utils/logger';

console.log('🧪 DIRECT TRADE EXECUTION TEST');
console.log('=' .repeat(50));

async function testTradeExecution() {
  try {
    // Create a sample trade signal
    const testSignal: TradeSignal = {
      symbol: 'XAUUSD',
      action: 'BUY',
      entryZone: { min: 2400, max: 2410 },
      entryPrice: 2405,
      stopLoss: 2390,
      targets: [2420, 2430, 2440],
      orderType: 'MARKET',
      reason: 'Test signal for debugging trade execution'
    };

    console.log('📊 Test Signal:', {
      symbol: testSignal.symbol,
      action: testSignal.action,
      entryZone: testSignal.entryZone,
      stopLoss: testSignal.stopLoss,
      targets: testSignal.targets
    });

    // Initialize the Multi-Account executor
    console.log('\n🔄 Initializing Multi-Account MetaAPI Executor...');
    const executor = new MultiAccountMetaApiExecutor();
    
    try {
      await executor.initialize();
      console.log('✅ Executor initialized successfully');
    } catch (initError) {
      console.error('❌ Executor initialization failed:', initError);
      console.log('\n🔍 Checking connection status...');
      
      const isConnected = await executor.isConnected();
      console.log(`Connection Status: ${isConnected ? 'Connected' : 'Disconnected'}`);
      
      const accountStatuses = executor.getAccountStatuses();
      console.log('Account Statuses:', accountStatuses);
      
      // Don't exit, let's test what happens with executeTradeSignal
      console.log('\n⚠️ Proceeding with trade execution test despite initialization issues...');
    }

    // Test the executeTradeSignal method
    console.log('\n🚀 Testing executeTradeSignal method...');
    try {
      const result = await executor.executeTradeSignal(testSignal);
      
      console.log('\n✅ Trade Execution Result:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Message: ${result.message}`);
      console.log(`   Error: ${result.error || 'None'}`);
      console.log(`   Signal ID: ${result.signalId || 'None'}`);
      
      if (result.success) {
        console.log('\n🎉 Trade execution was successful!');
      } else {
        console.log('\n❌ Trade execution failed, but method returned gracefully');
      }
      
    } catch (executionError: any) {
      console.error('\n💥 executeTradeSignal threw an error:', executionError);
      console.error('Error Details:');
      console.error(`   Name: ${executionError?.name || 'Unknown'}`);
      console.error(`   Message: ${executionError?.message || 'Unknown'}`);
      if (executionError?.stack) {
        console.error(`   Stack: ${executionError.stack.split('\n')[0]}`);
      }
    }

    // Test connection cleanup
    console.log('\n🧹 Cleaning up connections...');
    try {
      await executor.closeConnection();
      console.log('✅ Cleanup completed');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup had issues:', cleanupError);
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Run the test
testTradeExecution().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
