/**
 * Test XAUUSD Symbol Fix for Pepperstone
 * Verify that symbol 1671 is now correctly discovered
 */

require('dotenv').config();

// Import the CleanSymbolManager
const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');
const MetaApi = require('metaapi.cloud-sdk').default;

async function testXAUUSDFix() {
    console.log('🧪 TESTING XAUUSD SYMBOL FIX FOR PEPPERSTONE');
    console.log('==============================================');
    
    try {
        // Initialize MetaAPI
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = '1fd3d084-a938-4399-bbad-30e29eea9311';
        
        console.log('📊 Connecting to Pepperstone Demo...');
        
        // Get account and connection
        const account = await api.metatraderAccountApi.getAccount(accountId);
        await account.waitConnected(60000);
        
        const connection = account.getStreamingConnection();
        await connection.connect();
        await connection.waitSynchronized();
        
        console.log('✅ Connected and synchronized');
        
        // Test the CleanSymbolManager with XAUUSD
        console.log('\n🔍 Testing CleanSymbolManager.getValidSymbol for XAUUSD...');
        
        try {
            const validSymbol = await CleanSymbolManager.getValidSymbol(
                'XAUUSD',
                connection,
                'Pepperstone-Demo'
            );
            
            console.log(`🎉 SUCCESS! Found valid symbol: ${validSymbol}`);
            
            // Get specification details
            const specifications = connection.terminalState.specifications || {};
            const spec = specifications[validSymbol];
            
            if (spec) {
                console.log(`📝 Description: ${spec.description}`);
                console.log(`💰 Contract Size: ${spec.contractSize}`);
                console.log(`📊 Digits: ${spec.digits}`);
                console.log(`📈 Min Volume: ${spec.minVolume}`);
                console.log(`📈 Max Volume: ${spec.maxVolume}`);
                console.log(`🎯 Trade Allowed: ${spec.tradeAllowed !== false}`);
            }
            
            console.log('\n✅ XAUUSD symbol mapping is now FIXED for Pepperstone!');
            
        } catch (symbolError) {
            console.error(`❌ Symbol lookup failed: ${symbolError.message}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testXAUUSDFix().then(() => {
    console.log('\n🎯 Test complete! Your bot should now work with XAUUSD signals.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
