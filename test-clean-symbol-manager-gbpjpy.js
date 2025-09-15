#!/usr/bin/env node
/**
 * Test CleanSymbolManager GBPJPY on InstantFunding
 * Uses the actual getValidSymbol method to test the fix
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

// Import the TypeScript compiled version
const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');

async function testCleanSymbolManagerGBPJPY() {
    console.log('🧪 TESTING CLEANSYMBOLMANAGER GBPJPY ON INSTANTFUNDING');
    console.log('=====================================================\n');

    try {
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade (InstantFunding)
        
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getStreamingConnection();
        
        console.log('🔌 Connecting to InstantFunding...');
        await connection.connect();
        await connection.waitSynchronized({ timeoutInSeconds: 60 });
        
        console.log('✅ Connected and synchronized\n');
        
        console.log('🔍 Testing CleanSymbolManager.getValidSymbol("GBPJPY", connection, "IFPro-Trade")...\n');
        
        try {
            const validSymbol = await CleanSymbolManager.getValidSymbol('GBPJPY', connection, 'IFPro-Trade');
            
            console.log(`🎉 SUCCESS! GBPJPY resolved to: "${validSymbol}"`);
            
            // Verify the symbol actually works
            const spec = connection.terminalState.specifications[validSymbol];
            if (spec) {
                console.log(`✅ Symbol verification:`);
                console.log(`   Description: ${spec.description}`);
                console.log(`   Digits: ${spec.digits}`);
                console.log(`   Trade allowed: ${spec.tradeAllowed !== false}`);
                console.log(`   Min volume: ${spec.minVolume || 'N/A'}`);
                console.log(`   Max volume: ${spec.maxVolume || 'N/A'}`);
            }
            
        } catch (symbolError) {
            console.log(`❌ FAILED: ${symbolError.message}`);
            
            // Debug: Show what symbols ARE available
            console.log('\n🔍 Debug: Available symbols containing GBP or JPY:');
            const specs = connection.terminalState.specifications || {};
            for (const [key, spec] of Object.entries(specs)) {
                const desc = spec.description || '';
                if (desc.toLowerCase().includes('pound') || 
                    desc.toLowerCase().includes('yen') || 
                    desc.toLowerCase().includes('gbp') || 
                    desc.toLowerCase().includes('jpy')) {
                    console.log(`   ${key}: ${desc}`);
                }
            }
        }
        
        connection.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testCleanSymbolManagerGBPJPY().catch(console.error);
