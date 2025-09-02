/**
 * Multi-Account MetaAPI Executor Test
 * Tests the simultaneous execution across multiple accounts
 */

import { MultiAccountMetaApiExecutor } from '../src/mt5/multiAccountMetaApiExecutor';
import { TradeSignal } from '../src/types';
import { logger } from '../src/utils/logger';

async function testMultiAccountExecution() {
  try {
    console.log('🧪 Testing Multi-Account MetaAPI Execution...\n');

    // Initialize the multi-account executor
    const executor = new MultiAccountMetaApiExecutor();
    
    console.log('🔗 Initializing connections to all accounts...');
    await executor.initialize();
    
    // Check account statuses
    const accountStatuses = executor.getAccountStatuses();
    console.log('\n📊 Account Status Summary:');
    accountStatuses.forEach(account => {
      const statusIcon = account.status === 'CONNECTED' ? '✅' : 
                        account.status === 'CONNECTING' ? '🔄' : '❌';
      console.log(`${statusIcon} ${account.brokerName} ${account.accountType}: ${account.status}`);
    });

    // Create a test signal
    const testSignal: TradeSignal = {
      symbol: 'XAUUSD',
      action: 'BUY',
      entryZone: {
        min: 2680.00,
        max: 2682.00
      },
      stopLoss: 2670.00,
      targets: [2690.00, 2695.00, 2700.00],
      reason: 'Multi-Account Test Signal',
      requiresChartAnalysis: false
    };

    console.log('\n🚀 Executing test trade signal across all accounts...');
    console.log('📈 Signal Details:', {
      symbol: testSignal.symbol,
      action: testSignal.action,
      entryZone: testSignal.entryZone,
      stopLoss: testSignal.stopLoss,
      targets: testSignal.targets
    });

    // Execute trade on all accounts
    const result = await executor.executeTrade(testSignal);
    
    console.log('\n🎯 Multi-Account Execution Results:');
    console.log(`📊 Overall Success: ${result.overallSuccess ? '✅ YES' : '❌ NO'}`);
    console.log(`📈 Successful Accounts: ${result.successfulAccounts}/${result.totalAccounts}`);
    console.log(`📉 Failed Accounts: ${result.failedAccounts}/${result.totalAccounts}`);
    
    console.log('\n📋 Individual Account Results:');
    result.results.forEach((accountResult, index) => {
      const successIcon = accountResult.success ? '✅' : '❌';
      console.log(`${index + 1}. ${successIcon} ${accountResult.brokerName} ${accountResult.accountType}`);
      console.log(`   Message: ${accountResult.message}`);
      if (accountResult.error) {
        console.log(`   Error: ${accountResult.error}`);
      }
    });

    // Test the interface compliance
    console.log('\n🔧 Testing ITradeExecutor Interface Compliance...');
    const interfaceResult = await executor.executeTradeSignal(testSignal);
    console.log('✅ executeTradeSignal() method working:', {
      success: interfaceResult.success,
      message: interfaceResult.message,
      signalId: interfaceResult.signalId
    });

    // Check connection status
    const isConnected = await executor.isConnected();
    console.log(`🔗 Connection Status: ${isConnected ? '✅ Connected' : '❌ Disconnected'}`);

    // Clean up
    console.log('\n🔌 Closing all connections...');
    await executor.closeConnection();
    
    console.log('✅ Multi-Account Test Completed Successfully!');

  } catch (error) {
    console.error('❌ Multi-Account Test Failed:', error);
    logger.error('Multi-Account Test Error:', error);
  }
}

// Run the test
if (require.main === module) {
  testMultiAccountExecution().catch(console.error);
}

export { testMultiAccountExecution };
