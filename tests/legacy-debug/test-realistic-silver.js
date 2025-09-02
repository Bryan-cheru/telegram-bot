const { TradeParser } = require('./dist/ocr/tradeParser');

// Test realistic Silver signal parsing
async function testRealisticSilverSignal() {
    console.log('\n🥈 Testing Realistic Silver Chart Signal...\n');
    
    const parser = new TradeParser();
    
    // Test with realistic Silver data from your chart
    const testCases = [
        {
            name: 'Silver with Clear Levels',
            caption: '#SILVER (Update) 📊\n\nNext move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅',
            text: 'SILVER BUY Entry 39.1077 buying area SL 38.7340 stop-loss current price 39.6910'
        },
        {
            name: 'Silver Simplified',
            caption: '#SILVER BUY signal',
            text: 'SILVER buy 39.10 SL 38.73 TP 39.50'
        },
        {
            name: 'XAGUSD Format',
            caption: '#XAGUSD signal',
            text: 'XAGUSD BUY 39.1077 SL 38.7340'
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📋 Testing: ${testCase.name}`);
        console.log(`   Caption: "${testCase.caption}"`);
        console.log(`   Text: "${testCase.text}"`);
        
        try {
            const signal = parser.parseTradeSignal(testCase.text, testCase.caption);
            
            if (signal) {
                console.log(`   ✅ SUCCESS: ${signal.symbol}`);
                console.log(`   📊 Action: ${signal.action}`);
                console.log(`   💰 Entry: ${signal.entryZone.min.toFixed(4)} - ${signal.entryZone.max.toFixed(4)}`);
                console.log(`   🛑 Stop Loss: ${signal.stopLoss}`);
                console.log(`   🎯 Target: ${signal.targets[0]}`);
                console.log(`   💡 Reason: ${signal.reason}`);
                
                // Check if prices are realistic for Silver (should be 20-50 range)
                const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
                if (entryPrice >= 20 && entryPrice <= 50) {
                    console.log(`   ✅ REALISTIC PRICE: Entry ${entryPrice.toFixed(4)} is within Silver range (20-50)`);
                } else {
                    console.log(`   ❌ UNREALISTIC PRICE: Entry ${entryPrice.toFixed(4)} is outside Silver range (20-50)`);
                }
            } else {
                console.log(`   ❌ FAILED: No signal detected`);
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
    }
}

testRealisticSilverSignal().catch(console.error);
