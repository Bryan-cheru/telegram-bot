/**
 * Test script to verify synchronization fixes
 * Run with: node test-sync-fix.js
 */

const { MultiAccountMetaApiExecutor } = require('./dist/src/mt5/multiAccountMetaApiExecutor');

async function testSyncFix() {
    console.log('🧪 Testing synchronization fixes...');
    
    try {
        const executor = new MultiAccountMetaApiExecutor();
        
        // Initialize connections
        console.log('⏳ Initializing connections...');
        await executor.initialize();
        
        // Test manual trade with retry logic
        const testSignal = {
            symbol: 'XAUUSD',
            action: 'BUY',
            lotSize: 0.01, // Small test size
            stopLoss: null,
            takeProfit: null,
            comment: 'Sync Fix Test'
        };
        
        console.log('🎯 Executing test trade with synchronization fixes...');
        const result = await executor.executeManualTradeWithRetry(testSignal, 2);
        
        console.log('📊 Results:', {
            overallSuccess: result.overallSuccess,
            successfulAccounts: result.successfulAccounts,
            totalAccounts: result.totalAccounts
        });
        
        if (result.overallSuccess) {
            console.log('✅ Synchronization fix successful!');
        } else {
            console.log('❌ Still experiencing issues. Details:');
            result.results.forEach(r => {
                console.log(`  ${r.brokerName}: ${r.success ? '✅' : '❌'} ${r.message}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testSyncFix().catch(console.error);
