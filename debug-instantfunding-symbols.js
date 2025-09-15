#!/usr/bin/env node
/**
 * InstantFunding Symbol Analysis Tool
 * Checks if InstantFunding uses numerical values for symbol determination
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function analyzeInstantFundingSymbols() {
    console.log('🔍 INSTANTFUNDING SYMBOL ANALYSIS');
    console.log('=================================\n');

    try {
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade (InstantFunding)
        
        console.log('🏦 Analyzing IFPro-Trade (InstantFunding) symbols...');
        console.log('────────────────────────────────────────────────────\n');
        
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getStreamingConnection();
        
        console.log('🔌 Connecting...');
        await connection.connect();
        
        console.log('🔄 Waiting for synchronization...');
        await connection.waitSynchronized({ timeoutInSeconds: 60 });
        
        const specs = connection.terminalState.specifications || {};
        const allSymbols = Object.keys(specs);
        
        console.log(`📊 Total symbols available: ${allSymbols.length}\n`);
        
        // Analyze symbol patterns
        console.log('🔍 SYMBOL PATTERN ANALYSIS:');
        console.log('==========================\n');
        
        // Check for numerical patterns
        const numericalSymbols = allSymbols.filter(symbol => /\d/.test(symbol));
        const purelyNumerical = allSymbols.filter(symbol => /^\d+$/.test(symbol));
        const mixedAlphaNumeric = allSymbols.filter(symbol => /^[A-Z]+\d+/.test(symbol));
        const withNumericSuffix = allSymbols.filter(symbol => /[A-Z]+\d+$/.test(symbol));
        
        console.log(`📈 Symbols with numbers: ${numericalSymbols.length}/${allSymbols.length}`);
        console.log(`🔢 Purely numerical symbols: ${purelyNumerical.length}`);
        console.log(`🔤 Mixed alphanumeric: ${mixedAlphaNumeric.length}`);
        console.log(`📝 With numeric suffix: ${withNumericSuffix.length}\n`);
        
        if (purelyNumerical.length > 0) {
            console.log('🔢 PURELY NUMERICAL SYMBOLS:');
            purelyNumerical.slice(0, 10).forEach(symbol => {
                const spec = specs[symbol];
                console.log(`   ${symbol}: ${spec.description || 'No description'}`);
            });
            if (purelyNumerical.length > 10) {
                console.log(`   ... and ${purelyNumerical.length - 10} more\n`);
            }
        }
        
        if (withNumericSuffix.length > 0) {
            console.log('📝 SYMBOLS WITH NUMERIC SUFFIX:');
            withNumericSuffix.slice(0, 15).forEach(symbol => {
                const spec = specs[symbol];
                console.log(`   ${symbol}: ${spec.description || 'No description'}`);
            });
            if (withNumericSuffix.length > 15) {
                console.log(`   ... and ${withNumericSuffix.length - 15} more\n`);
            }
        }
        
        // Look for GBP/JPY related symbols with numbers
        console.log('🎯 LOOKING FOR GBP/JPY PATTERNS:');
        console.log('================================\n');
        
        const gbpRelated = allSymbols.filter(symbol => 
            symbol.toUpperCase().includes('GBP') || 
            symbol.includes('826') || // GBP currency code
            symbol.toLowerCase().includes('pound') ||
            symbol.toLowerCase().includes('sterling')
        );
        
        const jpyRelated = allSymbols.filter(symbol => 
            symbol.toUpperCase().includes('JPY') || 
            symbol.includes('392') || // JPY currency code
            symbol.toLowerCase().includes('yen') ||
            symbol.toLowerCase().includes('japan')
        );
        
        console.log(`💷 GBP-related symbols found: ${gbpRelated.length}`);
        if (gbpRelated.length > 0) {
            gbpRelated.forEach(symbol => {
                const spec = specs[symbol];
                console.log(`   ${symbol}: ${spec.description || 'No description'}`);
            });
        }
        
        console.log(`💴 JPY-related symbols found: ${jpyRelated.length}`);
        if (jpyRelated.length > 0) {
            jpyRelated.forEach(symbol => {
                const spec = specs[symbol];
                console.log(`   ${symbol}: ${spec.description || 'No description'}`);
            });
        }
        
        // Show first 20 symbols for general pattern recognition
        console.log('\n📋 FIRST 20 SYMBOLS (for pattern analysis):');
        console.log('==========================================');
        allSymbols.slice(0, 20).forEach(symbol => {
            const spec = specs[symbol];
            console.log(`${symbol}: ${spec.description || 'No description'}`);
        });
        
        connection.close();
        
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    }
}

analyzeInstantFundingSymbols().catch(console.error);
