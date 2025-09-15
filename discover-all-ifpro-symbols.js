#!/usr/bin/env node
/**
 * InstantFunding Complete Symbol Mapping Discovery
 * Maps all major forex pairs to their numerical IDs on IFPro-Trade
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function discoverAllInstantFundingSymbols() {
    console.log('🔍 INSTANTFUNDING COMPLETE SYMBOL MAPPING');
    console.log('=========================================\n');

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
        
        // Major forex pairs to map
        const majorForexPairs = [
            'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
            'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 
            'CHFJPY', 'NZDJPY', 'EURAUD', 'EURNZD', 'EURSEK', 'EURNOK', 'EURCAD',
            'GBPAUD', 'GBPCAD', 'GBPNZD', 'AUDCAD', 'AUDNZD', 'CADCHF', 'NZDCHF',
            'AUDCHF', 'NZDCAD', 'SGDJPY', 'USDSEK', 'USDNOK', 'USDDKK', 'USDPLN'
        ];
        
        console.log('🎯 MAJOR FOREX PAIRS MAPPING:');
        console.log('=============================\n');
        
        const symbolMappings = {};
        let mappedCount = 0;
        
        for (const forexPair of majorForexPairs) {
            const mapping = findForexPairMapping(forexPair, specs);
            if (mapping) {
                symbolMappings[forexPair] = mapping;
                console.log(`✅ ${forexPair}: ${mapping.id} - ${mapping.description}`);
                mappedCount++;
            } else {
                console.log(`❌ ${forexPair}: Not found`);
            }
        }
        
        console.log(`\n📈 SUCCESS RATE: ${mappedCount}/${majorForexPairs.length} pairs mapped (${Math.round(mappedCount/majorForexPairs.length*100)}%)\n`);
        
        // Generate code for cleanSymbolManager.ts
        console.log('🔧 CODE FOR CLEANSYMBOLMANAGER.TS:');
        console.log('=================================\n');
        
        for (const [forexPair, mapping] of Object.entries(symbolMappings)) {
            console.log(`    // ${forexPair} variations - Enhanced with InstantFunding numerical ID`);
            console.log(`    else if (symbol === '${forexPair}') {`);
            console.log(`      variations.push(`);
            
            // Generate standard variations
            const standardVariations = generateStandardVariations(forexPair);
            const variationLines = [];
            
            // Add standard variations in groups of 4
            for (let i = 0; i < standardVariations.length; i += 4) {
                const group = standardVariations.slice(i, i + 4);
                variationLines.push(`        '${group.join("', '")}'`);
            }
            
            // Add numerical ID
            variationLines.push(`        '${mapping.id}' // InstantFunding: "${mapping.description}"`);
            
            console.log(variationLines.join(',\n'));
            console.log(`      );`);
            console.log(`    }`);
        }
        
        console.log('\n🎉 COMPLETE MAPPING READY!');
        console.log('Copy the above code into cleanSymbolManager.ts to enable all forex pairs on InstantFunding.');
        
        connection.close();
        
    } catch (error) {
        console.error('❌ Discovery failed:', error.message);
    }
}

function findForexPairMapping(forexPair, specs) {
    // Currency keywords for each major pair
    const currencyKeywords = {
        'EURUSD': ['euro', 'dollar', 'eur', 'usd'],
        'GBPUSD': ['pound', 'dollar', 'gbp', 'usd', 'united kingdom', 'sterling'],
        'USDJPY': ['dollar', 'yen', 'usd', 'jpy', 'japanese'],
        'USDCHF': ['dollar', 'franc', 'usd', 'chf', 'swiss'],
        'AUDUSD': ['australian', 'dollar', 'aud', 'usd'],
        'USDCAD': ['dollar', 'canadian', 'usd', 'cad'],
        'NZDUSD': ['new zealand', 'dollar', 'nzd', 'usd'],
        'EURGBP': ['euro', 'pound', 'eur', 'gbp', 'united kingdom'],
        'EURJPY': ['euro', 'yen', 'eur', 'jpy', 'japanese'],
        'GBPJPY': ['pound', 'yen', 'gbp', 'jpy', 'united kingdom', 'japanese'],
        'EURCHF': ['euro', 'franc', 'eur', 'chf', 'swiss'],
        'GBPCHF': ['pound', 'franc', 'gbp', 'chf', 'united kingdom', 'swiss'],
        'AUDJPY': ['australian', 'yen', 'aud', 'jpy', 'japanese'],
        'CADJPY': ['canadian', 'yen', 'cad', 'jpy', 'japanese'],
        'CHFJPY': ['franc', 'yen', 'chf', 'jpy', 'swiss', 'japanese'],
        'NZDJPY': ['new zealand', 'yen', 'nzd', 'jpy', 'japanese'],
        'EURAUD': ['euro', 'australian', 'eur', 'aud'],
        'EURNZD': ['euro', 'new zealand', 'eur', 'nzd'],
        'EURSEK': ['euro', 'swedish', 'eur', 'sek', 'krona'],
        'EURNOK': ['euro', 'norwegian', 'eur', 'nok', 'krone'],
        'EURCAD': ['euro', 'canadian', 'eur', 'cad'],
        'GBPAUD': ['pound', 'australian', 'gbp', 'aud', 'united kingdom'],
        'GBPCAD': ['pound', 'canadian', 'gbp', 'cad', 'united kingdom'],
        'GBPNZD': ['pound', 'new zealand', 'gbp', 'nzd', 'united kingdom'],
        'AUDCAD': ['australian', 'canadian', 'aud', 'cad'],
        'AUDNZD': ['australian', 'new zealand', 'aud', 'nzd'],
        'CADCHF': ['canadian', 'franc', 'cad', 'chf', 'swiss'],
        'NZDCHF': ['new zealand', 'franc', 'nzd', 'chf', 'swiss'],
        'AUDCHF': ['australian', 'franc', 'aud', 'chf', 'swiss'],
        'NZDCAD': ['new zealand', 'canadian', 'nzd', 'cad'],
        'SGDJPY': ['singapore', 'yen', 'sgd', 'jpy', 'japanese'],
        'USDSEK': ['dollar', 'swedish', 'usd', 'sek', 'krona'],
        'USDNOK': ['dollar', 'norwegian', 'usd', 'nok', 'krone'],
        'USDDKK': ['dollar', 'danish', 'usd', 'dkk', 'krone'],
        'USDPLN': ['dollar', 'polish', 'usd', 'pln', 'zloty']
    };
    
    const keywords = currencyKeywords[forexPair];
    if (!keywords) return null;
    
    for (const [id, spec] of Object.entries(specs)) {
        const description = (spec.description || '').toLowerCase();
        
        // Must contain "vs" and match at least 2 keywords
        if (description.includes('vs')) {
            const matchedKeywords = keywords.filter(keyword => description.includes(keyword));
            if (matchedKeywords.length >= 2) {
                return {
                    id: id,
                    description: spec.description
                };
            }
        }
    }
    
    return null;
}

function generateStandardVariations(symbol) {
    const variations = [symbol, symbol.toLowerCase()];
    
    // Add common suffixes and formats
    const suffixes = ['_', '.', 'm', 'Cash', '.std', 'pro', '_ECN', 'ECN', '.a', '.raw', '.swap', '#', '_raw', '_mini', '_micro', 'ex', 'fx', 'c', '.r', '.fx'];
    
    suffixes.forEach(suffix => {
        variations.push(symbol + suffix);
    });
    
    // Add slash format
    if (symbol.length === 6) {
        variations.push(symbol.substring(0, 3) + '/' + symbol.substring(3));
        variations.push(symbol.substring(0, 3) + '-' + symbol.substring(3));
        variations.push(symbol.substring(0, 3) + '_' + symbol.substring(3));
    }
    
    return variations.slice(0, 20); // Limit to reasonable number
}

discoverAllInstantFundingSymbols().catch(console.error);
