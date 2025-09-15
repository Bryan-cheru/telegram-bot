#!/usr/bin/env node
/**
 * InstantFunding PRECISE Symbol Mapping Discovery
 * Precisely maps major forex pairs to their correct numerical IDs
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function discoverPreciseInstantFundingSymbols() {
    console.log('🔍 INSTANTFUNDING PRECISE SYMBOL MAPPING');
    console.log('========================================\n');

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
        
        console.log(`📊 Total symbols available: ${allSymbols.length}\n`);
        
        console.log('🎯 ALL AVAILABLE FOREX PAIRS:');
        console.log('=============================\n');
        
        // First, let's see all the actual forex pairs available
        const forexPairs = [];
        for (const [id, spec] of Object.entries(specs)) {
            const description = spec.description || '';
            if (description.toLowerCase().includes('vs') && 
                (description.toLowerCase().includes('dollar') || 
                 description.toLowerCase().includes('euro') || 
                 description.toLowerCase().includes('yen') || 
                 description.toLowerCase().includes('pound') || 
                 description.toLowerCase().includes('franc'))) {
                forexPairs.push({
                    id: id,
                    description: description
                });
                console.log(`${id}: ${description}`);
            }
        }
        
        console.log(`\n📈 Found ${forexPairs.length} forex pairs\n`);
        
        console.log('🎯 PRECISE MAPPING ANALYSIS:');
        console.log('============================\n');
        
        // Now let's do precise mapping based on exact descriptions
        const preciseMapping = {};
        
        // We know GBPJPY = 32, let's find other precise matches
        for (const pair of forexPairs) {
            const desc = pair.description.toLowerCase();
            let forexSymbol = null;
            
            // Precise pattern matching
            if (desc.includes('united kingdom pound') && desc.includes('japanese yen')) {
                forexSymbol = 'GBPJPY';
            }
            else if (desc.includes('euro') && desc.includes('united states dollar')) {
                forexSymbol = 'EURUSD';
            }
            else if (desc.includes('united kingdom pound') && desc.includes('united states dollar')) {
                forexSymbol = 'GBPUSD';
            }
            else if (desc.includes('united states dollar') && desc.includes('japanese yen')) {
                forexSymbol = 'USDJPY';
            }
            else if (desc.includes('united states dollar') && desc.includes('swiss franc')) {
                forexSymbol = 'USDCHF';
            }
            else if (desc.includes('australian dollar') && desc.includes('united states dollar')) {
                forexSymbol = 'AUDUSD';
            }
            else if (desc.includes('united states dollar') && desc.includes('canadian dollar')) {
                forexSymbol = 'USDCAD';
            }
            else if (desc.includes('new zealand dollar') && desc.includes('united states dollar')) {
                forexSymbol = 'NZDUSD';
            }
            else if (desc.includes('euro') && desc.includes('united kingdom pound')) {
                forexSymbol = 'EURGBP';
            }
            else if (desc.includes('euro') && desc.includes('japanese yen')) {
                forexSymbol = 'EURJPY';
            }
            else if (desc.includes('euro') && desc.includes('swiss franc')) {
                forexSymbol = 'EURCHF';
            }
            else if (desc.includes('united kingdom pound') && desc.includes('swiss franc')) {
                forexSymbol = 'GBPCHF';
            }
            else if (desc.includes('australian dollar') && desc.includes('japanese yen')) {
                forexSymbol = 'AUDJPY';
            }
            else if (desc.includes('canadian dollar') && desc.includes('japanese yen')) {
                forexSymbol = 'CADJPY';
            }
            else if (desc.includes('swiss franc') && desc.includes('japanese yen')) {
                forexSymbol = 'CHFJPY';
            }
            else if (desc.includes('new zealand dollar') && desc.includes('japanese yen')) {
                forexSymbol = 'NZDJPY';
            }
            else if (desc.includes('euro') && desc.includes('australian dollar')) {
                forexSymbol = 'EURAUD';
            }
            else if (desc.includes('euro') && desc.includes('canadian dollar')) {
                forexSymbol = 'EURCAD';
            }
            else if (desc.includes('united kingdom pound') && desc.includes('australian dollar')) {
                forexSymbol = 'GBPAUD';
            }
            else if (desc.includes('united kingdom pound') && desc.includes('canadian dollar')) {
                forexSymbol = 'GBPCAD';
            }
            else if (desc.includes('australian dollar') && desc.includes('canadian dollar')) {
                forexSymbol = 'AUDCAD';
            }
            else if (desc.includes('new zealand dollar') && desc.includes('canadian dollar')) {
                forexSymbol = 'NZDCAD';
            }
            else if (desc.includes('us dollar') && desc.includes('swedish krona')) {
                forexSymbol = 'USDSEK';
            }
            
            if (forexSymbol) {
                preciseMapping[forexSymbol] = {
                    id: pair.id,
                    description: pair.description
                };
                console.log(`✅ ${forexSymbol}: ${pair.id} - ${pair.description}`);
            }
        }
        
        console.log(`\n📈 PRECISE MATCHES: ${Object.keys(preciseMapping).length}\n`);
        
        // Generate the corrected code
        console.log('🔧 CORRECTED CODE FOR CLEANSYMBOLMANAGER.TS:');
        console.log('============================================\n');
        
        for (const [forexPair, mapping] of Object.entries(preciseMapping)) {
            console.log(`    // ${forexPair} variations - Enhanced with InstantFunding numerical ID`);
            console.log(`    else if (symbol === '${forexPair}') {`);
            console.log(`      variations.push(`);
            console.log(`        '${forexPair}', '${forexPair.toLowerCase()}', '${forexPair}_', '${forexPair}.',`);
            console.log(`        '${forexPair}m', '${forexPair}Cash', '${forexPair}.std', '${forexPair}pro',`);
            console.log(`        '${forexPair}_ECN', '${forexPair}ECN', '${forexPair}.a', '${forexPair}.raw',`);
            console.log(`        '${forexPair}.swap', '${forexPair}#', '${forexPair}_raw', '${forexPair}_mini',`);
            console.log(`        '${forexPair}_micro', '${forexPair}ex', '${forexPair}fx', '${forexPair}c',`);
            console.log(`        '${forexPair}.r', '${forexPair}.fx', '${forexPair.substring(0,3)}/${forexPair.substring(3)}', '${forexPair.substring(0,3)}-${forexPair.substring(3)}',`);
            console.log(`        '${mapping.id}' // InstantFunding: "${mapping.description}"`);
            console.log(`      );`);
            console.log(`    }`);
        }
        
        connection.close();
        
    } catch (error) {
        console.error('❌ Discovery failed:', error.message);
    }
}

discoverPreciseInstantFundingSymbols().catch(console.error);
