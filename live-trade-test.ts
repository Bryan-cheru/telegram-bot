#!/usr/bin/env npx ts-node

import dotenv from 'dotenv';
dotenv.config();

console.log('🎯 LIVE TRADE VERIFICATION TEST');
console.log('==================================================');
console.log('Testing with smaller volume and immediate verification...\n');

async function testLiveTrade() {
  try {
    const { MultiAccountMetaApiExecutor } = await import('./src/mt5/multiAccountMetaApiExecutor');
    const executor = new MultiAccountMetaApiExecutor();
    
    console.log('1️⃣ Initializing executor...');
    await executor.initialize();
    
    console.log('\n2️⃣ Checking connection...');
    const isConnected = await executor.isConnected();
    if (!isConnected) {
      console.log('❌ Not connected');
      return;
    }
    
    console.log('\n3️⃣ Creating small test trade...');
    const testSignal = {
      symbol: 'EURUSD',  // Forex pair (lower spread than gold)
      action: 'BUY' as const,
      entryZone: { min: 1.1000, max: 1.1010 },
      stopLoss: 1.0950,
      targets: [1.1050, 1.1100, 1.1150],
      orderType: 'MARKET' as const
    };
    
    console.log('🎯 Signal:', JSON.stringify(testSignal, null, 2));
    
    // Execute the trade
    const result = await executor.executeTradeSignal(testSignal);
    console.log('\n📊 Trade Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n⏳ Waiting 10 seconds for trade to settle...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log('\n4️⃣ Checking positions immediately after trade...');
      
      // Get accounts to check positions
      const accounts = (executor as any).accounts;
      
      for (const [accountId, accountConfig] of accounts) {
        if (accountConfig.status !== 'CONNECTED') continue;
        
        console.log(`\n📊 === Checking ${accountConfig.brokerName} ===`);
        
        try {
          const terminalState = accountConfig.connection.terminalState;
          
          if (terminalState.synchronized) {
            const positions = terminalState.positions || [];
            const eurusdPositions = positions.filter((p: any) => p.symbol === 'EURUSD');
            
            console.log(`📈 Total positions: ${positions.length}`);
            console.log(`💱 EURUSD positions: ${eurusdPositions.length}`);
            
            if (eurusdPositions.length > 0) {
              eurusdPositions.forEach((pos: any, i: number) => {
                console.log(`   ${i + 1}. EURUSD ${pos.type} Volume: ${pos.volume} Price: ${pos.openPrice} Profit: $${pos.profit}`);
              });
            }
            
            // Check account balance
            const accountInfo = terminalState.accountInformation;
            if (accountInfo) {
              console.log(`💰 Balance: $${accountInfo.balance} | Equity: $${accountInfo.equity}`);
            }
            
          } else {
            console.log('⏳ Still synchronizing...');
          }
          
        } catch (error) {
          console.error(`❌ Error checking ${accountConfig.brokerName}:`, error);
        }
      }
    }
    
    console.log('\n5️⃣ Analysis:');
    if (result.success) {
      console.log('✅ Trade command was accepted by MetaAPI');
      console.log('🔍 If positions don\'t show immediately, this could mean:');
      console.log('   - Trade is being processed by broker');
      console.log('   - Insufficient balance on demo account');
      console.log('   - Market conditions prevented execution');
      console.log('   - Weekend/market closed');
    } else {
      console.log('❌ Trade command was rejected');
      console.log('🔍 Check the error message above for details');
    }
    
    console.log('\n6️⃣ Cleaning up...');
    await executor.cleanup();
    
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error);
  }
  
  setTimeout(() => {
    console.log('\n🧹 Test complete');
    process.exit(0);
  }, 2000);
}

testLiveTrade();
