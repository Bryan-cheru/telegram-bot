/**
 * Test Pepperstone XAUUSD Symbol 1671
 * Test the actual XAUUSD symbol (1671) on your Pepperstone account
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function testPepperstoneGoldSymbol() {
    console.log('🧪 TESTING PEPPERSTONE GOLD SYMBOL 1671');
    console.log('========================================');
    
    try {
        // Initialize MetaAPI
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = '1fd3d084-a938-4399-bbad-30e29eea9311';
        
        // Get account and connection
        const account = await api.metatraderAccountApi.getAccount(accountId);
        await account.waitConnected(60000);
        
        const connection = account.getStreamingConnection();
        await connection.connect();
        await connection.waitSynchronized();
        
        // Test symbol 1671 (Gold vs US Dollar)
        const goldSymbol = '1671';
        const specifications = connection.terminalState.specifications || {};
        
        if (specifications[goldSymbol]) {
            const spec = specifications[goldSymbol];
            console.log(`✅ Found GOLD symbol: ${goldSymbol}`);
            console.log(`📝 Description: ${spec.description}`);
            console.log(`💰 Contract Size: ${spec.contractSize}`);
            console.log(`📊 Digits: ${spec.digits}`);
            console.log(`📈 Min Volume: ${spec.minVolume}`);
            console.log(`📈 Max Volume: ${spec.maxVolume}`);
            console.log(`🎯 Trade Allowed: ${spec.tradeAllowed !== false}`);
            
            // Test market data access
            try {
                const terminalState = connection.terminalState;
                const price = terminalState.price && terminalState.price[goldSymbol];
                
                if (price) {
                    console.log(`\n💹 Current Price for ${goldSymbol}:`);
                    console.log(`   Bid: ${price.bid}`);
                    console.log(`   Ask: ${price.ask}`);
                    console.log(`   Time: ${price.time}`);
                } else {
                    console.log(`⚠️ No price data available for ${goldSymbol}`);
                }
                
            } catch (priceError) {
                console.log(`❌ Price access failed: ${priceError.message}`);
            }
            
            console.log(`\n🎯 SOLUTION: Use symbol "${goldSymbol}" for XAUUSD trades on Pepperstone!`);
            
        } else {
            console.log(`❌ Symbol ${goldSymbol} not found in specifications`);
        }
        
        // Also test a few other gold symbols
        const otherGoldSymbols = ['1663', '1664', '1665', '1666', '1667', '1668'];
        console.log('\n🔍 Other Gold symbols:');
        otherGoldSymbols.forEach(symbol => {
            if (specifications[symbol]) {
                console.log(`${symbol}: ${specifications[symbol].description}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testPepperstoneGoldSymbol().then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
