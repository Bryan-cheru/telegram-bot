#!/usr/bin/env node
/**
 * InstantFunding GBPJPY Numerical ID Finder
 * Searches through all numerical symbols to find GBP/JPY pair
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function findGBPJPYNumericalID() {
    console.log('🔍 FINDING GBPJPY NUMERICAL ID ON INSTANTFUNDING');
    console.log('===============================================\n');

    try {
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade (InstantFunding)
        
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getStreamingConnection();
        
        console.log('🔌 Connecting to InstantFunding...');
        await connection.connect();
        await connection.waitSynchronized({ timeoutInSeconds: 60 });
        
        const specs = connection.terminalState.specifications || {};
        const allSymbols = Object.keys(specs);
        
        console.log(`📊 Analyzing all ${allSymbols.length} symbols for GBP/JPY...\n`);
        
        // Look for GBP/JPY in descriptions
        let gbpjpyFound = false;
        for (const symbol of allSymbols) {
            const spec = specs[symbol];
            const description = (spec.description || '').toLowerCase();
            
            // Check if description contains both 'british' or 'pound' or 'gbp' AND 'yen' or 'jpy' or 'japan'
            const hasGBP = description.includes('british') || 
                          description.includes('pound') || 
                          description.includes('great britain') ||
                          description.includes('gbp') ||
                          description.includes('sterling');
                          
            const hasJPY = description.includes('yen') || 
                          description.includes('jpy') || 
                          description.includes('japan') ||
                          description.includes('japanese');
            
            if (hasGBP && hasJPY) {
                console.log(`✅ FOUND GBPJPY: Symbol ID = ${symbol}`);
                console.log(`   Description: ${spec.description}`);
                console.log(`   Digits: ${spec.digits}`);
                console.log(`   Spread: ${spec.spread}`);
                gbpjpyFound = true;
                break;
            }
        }
        
        if (!gbpjpyFound) {
            console.log('❌ GBPJPY not found. Showing all available currency pairs:\n');
            
            console.log('💱 ALL FOREX PAIRS AVAILABLE:');
            console.log('=============================');
            for (const symbol of allSymbols) {
                const spec = specs[symbol];
                const description = spec.description || '';
                
                // Check if it's a forex pair (contains "vs" and mentions currencies)
                if (description.toLowerCase().includes('vs') && 
                    (description.toLowerCase().includes('dollar') || 
                     description.toLowerCase().includes('euro') || 
                     description.toLowerCase().includes('yen') || 
                     description.toLowerCase().includes('pound') || 
                     description.toLowerCase().includes('franc'))) {
                    console.log(`${symbol}: ${description}`);
                }
            }
        }
        
        connection.close();
        
        if (gbpjpyFound) {
            console.log('\n🎯 SOLUTION FOUND!');
            console.log('==================');
            console.log('We now know the numerical ID for GBPJPY on InstantFunding.');
            console.log('The cleanSymbolManager.ts needs to be updated to handle numerical symbols.');
        } else {
            console.log('\n❌ GBPJPY NOT AVAILABLE');
            console.log('========================');
            console.log('InstantFunding does not offer GBP/JPY trading pair.');
            console.log('This confirms why the symbol validation was failing.');
        }
        
    } catch (error) {
        console.error('❌ Search failed:', error.message);
    }
}

findGBPJPYNumericalID().catch(console.error);
