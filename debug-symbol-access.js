#!/usr/bin/env node
/**
 * Debug InstantFunding Symbol Access Methods
 * Tests different ways to access symbol 32 on InstantFunding
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function debugSymbolAccess() {
    console.log('🔧 DEBUGGING INSTANTFUNDING SYMBOL ACCESS');
    console.log('=========================================\n');

    try {
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade (InstantFunding)
        
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getStreamingConnection();
        
        console.log('🔌 Connecting...');
        await connection.connect();
        await connection.waitSynchronized({ timeoutInSeconds: 60 });
        
        console.log('✅ Connected and synchronized\n');
        
        // Method 1: Direct specifications access
        console.log('🔍 Method 1: Direct specifications access');
        const specs = connection.terminalState.specifications || {};
        console.log(`Available symbols: ${Object.keys(specs).length}`);
        
        if (specs['32']) {
            console.log(`✅ Symbol '32' found: ${specs['32'].description}`);
        } else {
            console.log(`❌ Symbol '32' not found in specifications`);
        }
        
        // Method 2: specification() method
        console.log('\n🔍 Method 2: specification() method');
        try {
            const spec32 = connection.terminalState.specification('32');
            if (spec32) {
                console.log(`✅ specification('32') found: ${spec32.description}`);
            } else {
                console.log(`❌ specification('32') returned null/undefined`);
            }
        } catch (e) {
            console.log(`❌ specification('32') threw error: ${e.message}`);
        }
        
        // Method 3: Check if symbol exists in different format
        console.log('\n🔍 Method 3: Check all symbol keys');
        const allKeys = Object.keys(specs);
        console.log('First 10 symbols:');
        allKeys.slice(0, 10).forEach(key => {
            console.log(`  "${key}": ${specs[key].description}`);
        });
        
        // Look for symbol that contains "United Kingdom Pound vs Japanese Yen"
        console.log('\n🔍 Method 4: Search by description');
        for (const [key, spec] of Object.entries(specs)) {
            if (spec.description && spec.description.toLowerCase().includes('united kingdom pound vs japanese yen')) {
                console.log(`✅ Found by description! Symbol: "${key}" = ${spec.description}`);
                break;
            }
        }
        
        connection.close();
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

debugSymbolAccess().catch(console.error);
