/**
 * DEBUG: Enhanced Trade Execution with Better Error Handling
 * This modifies the executeTradeSignal to provide better debugging and error handling
 */

import { MultiAccountMetaApiExecutor } from './src/mt5/multiAccountMetaApiExecutor';
import { TradeSignal } from './src/types';
import { logger } from './src/utils/logger';

// Enhanced logging function
function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Test with a real signal
async function testEnhancedExecution() {
  debugLog('Starting enhanced trade execution test...');
  
  const testSignal: TradeSignal = {
    symbol: 'XAUUSD',
    action: 'BUY',
    entryZone: { min: 2441, max: 2453 },
    stopLoss: 2435,
    targets: [2459, 2473, 2487],
    orderType: 'MARKET',
    reason: 'Test signal for debugging'
  };
  
  debugLog('Test signal created:', testSignal);
  
  const executor = new MultiAccountMetaApiExecutor();
  
  try {
    debugLog('Initializing executor...');
    await executor.initialize();
    
    // Check connection status
    debugLog('Checking connection status...');
    const isConnected = await executor.isConnected();
    debugLog('Is connected:', isConnected);
    
    const accountStatuses = executor.getAccountStatuses();
    debugLog('Account statuses:', accountStatuses);
    
    // Count connected accounts
    const connectedAccounts = accountStatuses.filter(acc => acc.status === 'CONNECTED');
    debugLog('Connected accounts count:', connectedAccounts.length);
    
    if (connectedAccounts.length === 0) {
      debugLog('❌ NO ACCOUNTS CONNECTED - This is the root cause!');
      debugLog('The bot shows connections in startup but they\'re not maintained');
      return;
    }
    
    // Try trade execution with enhanced error handling
    debugLog('Attempting trade execution...');
    const result = await executor.executeTradeSignal(testSignal);
    
    debugLog('Trade execution result:', result);
    
    if (result.success) {
      debugLog('✅ Trade was successful!');
    } else {
      debugLog('❌ Trade failed:', result.error || result.message);
    }
    
  } catch (error: any) {
    debugLog('❌ Execution failed with exception:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  } finally {
    try {
      await executor.closeConnection();
      debugLog('Connections closed');
    } catch (cleanup) {
      debugLog('Cleanup error:', cleanup);
    }
  }
}

// Also create a version that doesn't require full initialization
async function testMinimalExecution() {
  debugLog('\n🧪 Testing minimal execution path...');
  
  // This simulates what happens in the actual bot
  try {
    const executor = new MultiAccountMetaApiExecutor();
    
    // Try to get status without full initialization
    debugLog('Testing without initialization...');
    
    const testSignal: TradeSignal = {
      symbol: 'XAUUSD',
      action: 'BUY',
      entryZone: { min: 2441, max: 2453 },
      stopLoss: 2435,
      targets: [2459, 2473, 2487],
      orderType: 'MARKET',
      reason: 'Test signal'
    };
    
    try {
      const result = await executor.executeTradeSignal(testSignal);
      debugLog('Result without initialization:', result);
    } catch (error: any) {
      debugLog('Expected error without initialization:', error.message);
    }
    
  } catch (error: any) {
    debugLog('Constructor error:', error.message);
  }
}

// Run tests
testEnhancedExecution()
  .then(() => testMinimalExecution())
  .then(() => {
    debugLog('\n SUMMARY OF FINDINGS:');
    debugLog('Check the logs above to identify the exact failure point');
    process.exit(0);
  })
  .catch(error => {
    debugLog('Test crashed:', error);
    process.exit(1);
  });
