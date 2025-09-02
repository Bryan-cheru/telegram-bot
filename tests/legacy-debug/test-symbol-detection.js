const { TradeParser } = require('./dist/ocr/tradeParser');
const logger = require('./dist/utils/logger');

// Test symbol detection for Silver and EURCAD
async function testSymbolDetection() {
    console.log('\n🧪 Testing Symbol Detection Fix...\n');
    
    const parser = new TradeParser();
    
    // Test cases
    const testCases = [
        {
            name: 'Silver Signal',
            text: 'XAGUSD BUY Entry 32.50 SL 32.00 TP 33.00',
            caption: '#XAGUSD signal'
        },
        {
            name: 'Silver Alternative',
            text: 'Silver trading signal 30.25 31.00',
            caption: 'Silver update'
        },
        {
            name: 'EURCAD Signal',
            text: 'EURCAD SELL Entry 1.50250 SL 1.50500 TP 1.50000',
            caption: '#EURCAD analysis'
        },
        {
            name: 'EURCAD Alternative',
            text: 'EUR/CAD pair at 1.4985 zone',
            caption: 'EURCAD update'
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📋 Testing: ${testCase.name}`);
        console.log(`   Text: "${testCase.text}"`);
        console.log(`   Caption: "${testCase.caption}"`);
        
        try {
            const signal = parser.parseTradeSignal(testCase.text, testCase.caption);
            
            if (signal) {
                console.log(`   ✅ SUCCESS: Symbol detected as ${signal.symbol}`);
                console.log(`   📊 Action: ${signal.action}, Entry: ${signal.entryZone.min}-${signal.entryZone.max}`);
            } else {
                console.log(`   ❌ FAILED: No signal detected`);
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
    }
}

testSymbolDetection().catch(console.error);
