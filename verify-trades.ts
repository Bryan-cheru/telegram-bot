#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 TRADE VERIFICATION TEST');
console.log('==================================================');
console.log('Checking if trades actually appeared in MetaAPI accounts...\n');

async function verifyTrades() {
  try {
    const { MultiAccountMetaApiExecutor } = await import('./src/mt5/multiAccountMetaApiExecutor');
    const executor = new MultiAccountMetaApiExecutor();
    
    console.log('1️⃣ Initializing executor...');
    await executor.initialize();
    
    console.log('\n2️⃣ Checking connection status...');
    const isConnected = await executor.isConnected();
    console.log(`Connected: ${isConnected}`);
    
    if (!isConnected) {
      console.log('❌ Not connected to accounts');
      return;
    }
    
    console.log('\n3️⃣ Retrieving trade history from all accounts...');
    
    // Get access to accounts
    const accounts = (executor as any).accounts;
    
    for (const [accountId, accountConfig] of accounts) {
      console.log(`\n📊 === ${accountConfig.brokerName} ${accountConfig.accountType} ===`);
      
      try {
        // Get terminal state to access trade history
        const terminalState = accountConfig.connection.terminalState;
        
        // Check if terminal state is synchronized
        if (!terminalState.synchronized) {
          console.log('⏳ Account not fully synchronized yet...');
          continue;
        }
        
        // Get current positions
        const positions = terminalState.positions || [];
        console.log(`📈 Open Positions: ${positions.length}`);
        
        if (positions.length > 0) {
          positions.forEach((position: any, index: number) => {
            console.log(`   ${index + 1}. ${position.symbol} ${position.type} Volume: ${position.volume} Profit: $${position.profit}`);
          });
        }
        
        // Get recent orders (both pending and historical)
        const orders = terminalState.orders || [];
        console.log(`� Pending Orders: ${orders.length}`);
        
        if (orders.length > 0) {
          orders.forEach((order: any, index: number) => {
            console.log(`   ${index + 1}. ${order.symbol} ${order.type} Volume: ${order.volume} Price: ${order.openPrice}`);
          });
        }
        
        // Get account info
        const accountInfo = terminalState.accountInformation;
        if (accountInfo) {
          console.log(`💰 Balance: $${accountInfo.balance} | Equity: $${accountInfo.equity} | Margin: $${accountInfo.margin}`);
        }
        
        // Check for recent activity using history if available
        try {
          // Try to get deal history for the last hour
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago
          
          const dealHistory = await accountConfig.connection.getDealsByTimeRange(startTime, endTime);
          console.log(`� Recent Deals (last hour): ${dealHistory.length}`);
          
          dealHistory.slice(-5).forEach((deal: any, index: number) => {
            const dealTime = new Date(deal.time).toLocaleString();
            console.log(`   ${index + 1}. [${dealTime}] ${deal.symbol} ${deal.type} Vol: ${deal.volume} Price: ${deal.price}`);
          });
          
        } catch (historyError) {
          console.log('📊 Deal history not available or limited access');
        }
        
      } catch (error) {
        console.error(`❌ Error checking ${accountConfig.brokerName}:`, error);
      }
    }
    
    console.log('\n4️⃣ Manual Check Instructions:');
    console.log('🔍 To verify trades manually:');
    console.log('   1. Log into your MetaTrader 5 accounts');
    console.log('   2. Check the "Trade" tab for open positions');
    console.log('   3. Check the "History" tab for completed trades');
    console.log('   4. Look for recent XAUUSD trades');
    
    console.log('\n💡 Common reasons trades might not show:');
    console.log('   - Demo account with insufficient balance');
    console.log('   - Market closed (weekend/holidays)');
    console.log('   - Spread too wide for small volumes');
    console.log('   - Orders pending execution');
    
    console.log('\n5️⃣ Cleaning up...');
    await executor.cleanup();
    
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED');
    console.error('Error:', error);
  }
  
  setTimeout(() => {
    console.log('\n🧹 Verification complete');
    process.exit(0);
  }, 2000);
}

verifyTrades();
