// Test script for comprehensive trade history functionality
import { MultiAccountMetaApiExecutor } from './src/mt5/multiAccountMetaApiExecutor';
import { logger } from './src/utils/logger';

async function testTradeHistory() {
  console.log('🧪 Testing Trade History Functionality\n');

  const executor = new MultiAccountMetaApiExecutor();

  try {
    // Initialize the executor
    console.log('1️⃣ Initializing Multi-Account Executor...');
    await executor.initialize();
    console.log('✅ Initialization complete!\n');

    // Test 1: Get basic trade history
    console.log('2️⃣ Testing basic trade history retrieval...');
    const history = await executor.getTradeHistory({
      limit: 10,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    });

    console.log(`📊 Trade History Results:`);
    console.log(`   Deals: ${history.deals.length}`);
    console.log(`   Orders: ${history.orders.length}`);
    console.log(`   Positions: ${history.positions.length}`);
    console.log(`   Transactions: ${history.transactions.length}`);
    console.log(`   Total Profit: $${history.summary.totalProfit.toFixed(2)}`);
    console.log(`   Win Rate: ${history.summary.winRate.toFixed(1)}%`);
    console.log(`   Accounts Analyzed: ${history.summary.accountsAnalyzed.join(', ')}\n`);

    // Test 2: Get performance metrics for each connected account
    console.log('3️⃣ Testing performance metrics...');
    const allMetrics = await executor.getAllAccountsPerformanceMetrics();
    
    allMetrics.forEach((metrics, index) => {
      console.log(`📈 Account ${index + 1}: ${metrics.brokerName} (${metrics.accountType})`);
      console.log(`   Total Trades: ${metrics.metrics.totalTrades}`);
      console.log(`   Win Rate: ${metrics.metrics.winRate.toFixed(1)}%`);
      console.log(`   Net Profit: $${metrics.metrics.netProfit.toFixed(2)}`);
      console.log(`   Profit Factor: ${metrics.metrics.profitFactor.toFixed(2)}`);
      console.log(`   Max Drawdown: $${metrics.metrics.maxDrawdown.toFixed(2)}`);
      console.log(`   Sharpe Ratio: ${metrics.metrics.sharpeRatio.toFixed(3)}`);
      
      if (metrics.symbolBreakdown.length > 0) {
        console.log(`   Top Symbols:`);
        metrics.symbolBreakdown.slice(0, 3).forEach(symbol => {
          console.log(`     ${symbol.symbol}: ${symbol.trades} trades, $${symbol.profit.toFixed(2)} profit`);
        });
      }
      console.log('');
    });

    // Test 3: Get specific account details
    if (allMetrics.length > 0) {
      const firstAccount = allMetrics[0];
      console.log('4️⃣ Testing detailed account history...');
      
      const detailedHistory = await executor.getTradeHistory({
        accountId: firstAccount.accountId,
        limit: 5
      });

      console.log(`📋 Detailed History for ${firstAccount.brokerName}:`);
      
      if (detailedHistory.deals.length > 0) {
        console.log('   Recent Deals:');
        detailedHistory.deals.slice(0, 3).forEach(deal => {
          console.log(`     ${deal.symbol} ${deal.type} - Vol: ${deal.volume}, Profit: $${deal.profit.toFixed(2)}`);
        });
      }

      if (detailedHistory.positions.length > 0) {
        console.log('   Positions:');
        detailedHistory.positions.slice(0, 3).forEach(pos => {
          console.log(`     ${pos.symbol} ${pos.type} - Vol: ${pos.volume}, Status: ${pos.status}`);
          if (pos.profit !== undefined) {
            console.log(`       Profit: $${pos.profit.toFixed(2)}, Open: ${pos.openTime.toISOString().substring(0, 10)}`);
          }
        });
      }
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up connections
    await executor.cleanup();
    console.log('🔌 Connections cleaned up');
  }
}

// Run the test
testTradeHistory().catch(console.error);
