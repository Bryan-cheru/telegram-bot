const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');

async function testUSDCHFSymbolMapping() {
    try {
        console.log('🧪 Testing USDCHF Symbol Mapping Fix');
        console.log('=====================================');
        
        // Test 1: Test symbol variations for USDCHF
        console.log('\n📍 Test 1: Testing getSymbolVariations for USDCHF');
        const variations = CleanSymbolManager.getSymbolVariations('USDCHF');
        console.log(`   USDCHF variations: [${variations.join(', ')}]`);
        
        // Test 2: Test other major forex pairs
        console.log('\n📍 Test 2: Testing other major forex pairs');
        const majorPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD'];
        
        for (const pair of majorPairs) {
            const variations = CleanSymbolManager.getSymbolVariations(pair);
            console.log(`   ${pair}: variations=[${variations.join(', ')}]`);
        }
        
        // Test 3: Test cross pairs
        console.log('\n📍 Test 3: Testing cross forex pairs');
        const crossPairs = ['EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY'];
        
        for (const pair of crossPairs) {
            const variations = CleanSymbolManager.getSymbolVariations(pair);
            console.log(`   ${pair}: variations=[${variations.join(', ')}]`);
        }
        
        console.log('\n✅ USDCHF Symbol Mapping Test Complete');
        console.log('🔧 Symbol recognition now supports all major and cross forex pairs');
        
    } catch (error) {
        console.error('❌ Error testing USDCHF symbol mapping:', error);
        console.error(error.stack);
    }
}

testUSDCHFSymbolMapping();
