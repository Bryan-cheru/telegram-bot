// Test Enhanced Symbol Detector with Fallback
// File: test-symbol-fallback.js

console.log('🔍 TESTING ENHANCED SYMBOL DETECTOR WITH FALLBACK\n');

async function testSymbolFallback() {
    try {
        const { EnhancedSymbolDetector } = require('./dist/utils/enhancedSymbolDetector');
        const { UniversalSymbolSupport } = require('./dist/utils/universalSymbolSupport');
        
        console.log('✅ Successfully imported modules\n');
        
        // Check current symbol support
        const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
        console.log(`📊 Currently supported symbols: ${supportedSymbols.length}`);
        
        if (supportedSymbols.length === 0) {
            console.log('⚠️ Universal symbol support is EMPTY - fallback should activate\n');
        } else {
            console.log(`✅ Universal symbol support has ${supportedSymbols.length} symbols\n`);
        }
        
        // Test symbol detection for EURCAD (the failing symbol from your logs)
        console.log('🧪 Testing EURCAD symbol detection:');
        console.log('─'.repeat(40));
        
        const eurcadResult = await EnhancedSymbolDetector.detectSymbol('EURCAD');
        
        if (eurcadResult) {
            console.log('✅ EURCAD Detection SUCCESS:');
            console.log(`   Symbol: ${eurcadResult.symbol}`);
            console.log(`   Confidence: ${eurcadResult.confidence}%`);
            console.log(`   Source: ${eurcadResult.source}`);
            console.log(`   Broker: ${eurcadResult.brokerName || 'N/A'}`);
            
            if (eurcadResult.symbolInfo) {
                console.log(`   Type: ${eurcadResult.symbolInfo.type}`);
                console.log(`   Min Lot: ${eurcadResult.symbolInfo.minLot}`);
                console.log(`   Max Lot: ${eurcadResult.symbolInfo.maxLot}`);
                console.log(`   Pip Value: ${eurcadResult.symbolInfo.pipValue}`);
            }
        } else {
            console.log('❌ EURCAD Detection FAILED');
        }
        
        // Test other common symbols
        console.log('\n🧪 Testing Other Common Symbols:');
        console.log('─'.repeat(40));
        
        const testSymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD'];
        
        for (const symbol of testSymbols) {
            const result = await EnhancedSymbolDetector.detectSymbol(symbol);
            const status = result ? '✅ DETECTED' : '❌ FAILED';
            const confidence = result ? `${result.confidence}%` : 'N/A';
            const source = result ? result.source : 'N/A';
            
            console.log(`${symbol.padEnd(8)} → ${status.padEnd(12)} (${confidence}, ${source})`);
        }
        
        // Test SILVER conversion
        console.log('\n🥈 Testing SILVER Conversion:');
        console.log('─'.repeat(30));
        
        const silverResult = await EnhancedSymbolDetector.detectSymbol('SILVER');
        if (silverResult) {
            console.log(`✅ SILVER → ${silverResult.symbol} (${silverResult.confidence}% confidence)`);
        } else {
            console.log('❌ SILVER conversion failed');
        }
        
        console.log('\n🎯 FALLBACK SYSTEM TEST RESULTS:');
        console.log('='.repeat(50));
        console.log(`• EURCAD detection: ${eurcadResult ? 'SUCCESS' : 'FAILED'}`);
        console.log(`• Common symbols working: ${testSymbols.filter(async s => await EnhancedSymbolDetector.detectSymbol(s)).length}/${testSymbols.length}`);
        console.log(`• SILVER conversion: ${silverResult ? 'SUCCESS' : 'FAILED'}`);
        
        console.log('\n📋 NEXT STEPS:');
        console.log('1. Start bot and test with real manual command');
        console.log('2. Should now detect EURCAD and execute trade');
        console.log('3. Fallback ensures trading works even when MetaAPI sync fails');
        
    } catch (error) {
        console.error('❌ Error testing symbol fallback:', error);
    }
}

testSymbolFallback();
