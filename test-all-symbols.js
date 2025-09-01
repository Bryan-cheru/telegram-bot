const { TradeParser } = require('./dist/ocr/tradeParser');

// Comprehensive test for all supported symbols
async function testAllSymbols() {
    console.log('\n🧪 COMPREHENSIVE SYMBOL DETECTION TEST\n');
    console.log('Testing all major trading symbols...\n');
    
    const parser = new TradeParser();
    
    // Test cases for all symbol categories
    const testCases = [
        // =================== METALS ===================
        {
            category: 'METALS',
            name: 'Gold (XAUUSD)',
            caption: '#XAUUSD BUY signal',
            text: 'XAUUSD buy entry 2450.50 SL 2440.00 TP 2460.00'
        },
        {
            category: 'METALS',
            name: 'Gold (Alternative)',
            caption: '#GOLD analysis',
            text: 'Gold trading at 2455.25 resistance'
        },
        {
            category: 'METALS',
            name: 'Silver (XAGUSD)',
            caption: '#XAGUSD signal',
            text: 'XAGUSD entry 32.50 stop 32.00'
        },
        {
            category: 'METALS',
            name: 'Silver (Alternative)',
            caption: '#SILVER update',
            text: 'Silver at 33.25 buying zone'
        },
        
        // =================== MAJOR FOREX ===================
        {
            category: 'MAJOR FOREX',
            name: 'EURUSD',
            caption: '#EURUSD signal',
            text: 'EURUSD sell 1.0850 SL 1.0900 TP 1.0800'
        },
        {
            category: 'MAJOR FOREX',
            name: 'GBPUSD',
            caption: '#GBPUSD analysis',
            text: 'GBPUSD buy 1.2650 stop 1.2600'
        },
        {
            category: 'MAJOR FOREX',
            name: 'USDJPY',
            caption: '#USDJPY signal',
            text: 'USDJPY entry 148.50 SL 147.50'
        },
        {
            category: 'MAJOR FOREX',
            name: 'USDCAD',
            caption: '#USDCAD update',
            text: 'USDCAD at 1.3650 resistance'
        },
        {
            category: 'MAJOR FOREX',
            name: 'AUDUSD',
            caption: '#AUDUSD signal',
            text: 'AUDUSD buy 0.6750 SL 0.6700'
        },
        {
            category: 'MAJOR FOREX',
            name: 'USDCHF',
            caption: '#USDCHF analysis',
            text: 'USDCHF sell 0.8950 TP 0.8900'
        },
        {
            category: 'MAJOR FOREX',
            name: 'NZDUSD',
            caption: '#NZDUSD signal',
            text: 'NZDUSD entry 0.6150 stop 0.6100'
        },
        
        // =================== MINOR/CROSS FOREX ===================
        {
            category: 'CROSS FOREX',
            name: 'EURCAD',
            caption: '#EURCAD signal',
            text: 'EURCAD sell 1.4950 SL 1.5000 TP 1.4900'
        },
        {
            category: 'CROSS FOREX',
            name: 'EURJPY',
            caption: '#EURJPY analysis',
            text: 'EURJPY buy 160.50 stop 159.50'
        },
        {
            category: 'CROSS FOREX',
            name: 'GBPJPY',
            caption: '#GBPJPY signal',
            text: 'GBPJPY entry 188.25 SL 187.00'
        },
        {
            category: 'CROSS FOREX',
            name: 'EURGBP',
            caption: '#EURGBP update',
            text: 'EURGBP at 0.8450 support level'
        },
        {
            category: 'CROSS FOREX',
            name: 'GBPCAD',
            caption: '#GBPCAD signal',
            text: 'GBPCAD buy 1.7250 SL 1.7200'
        },
        {
            category: 'CROSS FOREX',
            name: 'AUDJPY',
            caption: '#AUDJPY analysis',
            text: 'AUDJPY sell 100.25 TP 99.50'
        },
        
        // =================== INDICES ===================
        {
            category: 'INDICES',
            name: 'NAS100',
            caption: '#NAS100 signal',
            text: 'NAS100 buy 15250.5 SL 15200.0 TP 15300.0'
        },
        {
            category: 'INDICES',
            name: 'NASDAQ Alternative',
            caption: '#NASDAQ analysis',
            text: 'NASDAQ at 15280 resistance'
        },
        {
            category: 'INDICES',
            name: 'SPX500',
            caption: '#SPX500 signal',
            text: 'SPX500 entry 4450.25 stop 4430.00'
        },
        {
            category: 'INDICES',
            name: 'S&P Alternative',
            caption: '#SPY update',
            text: 'S&P500 trading at 4465.50'
        },
        {
            category: 'INDICES',
            name: 'US30',
            caption: '#US30 signal',
            text: 'US30 buy 34250.5 SL 34200.0'
        },
        {
            category: 'INDICES',
            name: 'DOW Alternative',
            caption: '#DOW analysis',
            text: 'DOW JONES at 34280 level'
        }
    ];
    
    let passed = 0;
    let failed = 0;
    const failures = [];
    
    // Group tests by category
    const categories = [...new Set(testCases.map(test => test.category))];
    
    for (const category of categories) {
        console.log(`\n🏷️  ========== ${category} ==========`);
        
        const categoryTests = testCases.filter(test => test.category === category);
        
        for (const testCase of categoryTests) {
            console.log(`\n📋 ${testCase.name}`);
            console.log(`   Caption: "${testCase.caption}"`);
            console.log(`   Text: "${testCase.text}"`);
            
            try {
                const signal = parser.parseTradeSignal(testCase.text, testCase.caption);
                
                if (signal && signal.symbol) {
                    console.log(`   ✅ PASS: Symbol detected as ${signal.symbol}`);
                    console.log(`   📊 ${signal.action} | Entry: ${signal.entryZone.min.toFixed(4)}-${signal.entryZone.max.toFixed(4)} | SL: ${signal.stopLoss}`);
                    passed++;
                } else {
                    console.log(`   ❌ FAIL: No signal detected`);
                    failures.push(testCase.name);
                    failed++;
                }
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                failures.push(`${testCase.name} (ERROR: ${error.message})`);
                failed++;
            }
        }
    }
    
    // Summary
    console.log(`\n\n📊 ========== TEST SUMMARY ==========`);
    console.log(`✅ PASSED: ${passed}/${testCases.length} symbols`);
    console.log(`❌ FAILED: ${failed}/${testCases.length} symbols`);
    console.log(`📈 SUCCESS RATE: ${((passed / testCases.length) * 100).toFixed(1)}%`);
    
    if (failures.length > 0) {
        console.log(`\n❌ FAILED SYMBOLS:`);
        failures.forEach(failure => console.log(`   • ${failure}`));
    }
    
    if (passed === testCases.length) {
        console.log(`\n🎉 ALL SYMBOLS WORKING PERFECTLY! 🎉`);
        console.log(`🚀 Production ready for all major trading instruments`);
    } else {
        console.log(`\n⚠️  Some symbols need attention before production`);
    }
}

testAllSymbols().catch(console.error);
