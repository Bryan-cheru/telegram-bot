const { TradeParser } = require('./dist/ocr/tradeParser');

// Test Silver grey zone detection with realistic OCR data
async function testSilverGreyZoneDetection() {
    console.log('\n🥈 Testing Silver Grey Zone Detection Fix...\n');
    
    const parser = new TradeParser();
    
    // Test cases simulating OCR data from Silver charts
    const testCases = [
        {
            name: 'Silver Chart with Grey Zone (Your Chart Data)',
            caption: '#SILVER (Update) 📊',
            text: `Silver CFDs USD/OZ 3h TVC
            40.5000 40.0000 39.6910 39.5000
            Buying Area 39.1077 39.0000
            Stop-loss 38.7340 38.6355 38.1904
            38.0000 37.8299 37.5000 36.9924`
        },
        {
            name: 'Silver Simple OCR',
            caption: '#XAGUSD signal',
            text: 'SILVER prices: 40.50 39.61 39.11 38.73 37.50 current buying area'
        },
        {
            name: 'Silver Update with Clear Levels',
            caption: '#SILVER update',
            text: 'Silver trading 39.69 resistance 39.11 buying zone 38.73 support'
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📋 Testing: ${testCase.name}`);
        console.log(`   Caption: "${testCase.caption}"`);
        console.log(`   OCR Text: "${testCase.text}"`);
        
        try {
            const signal = parser.parseTradeSignal(testCase.text, testCase.caption);
            
            if (signal) {
                const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
                console.log(`   ✅ SUCCESS: ${signal.symbol}`);
                console.log(`   📊 Action: ${signal.action}`);
                console.log(`   💰 Entry Zone: ${signal.entryZone.min.toFixed(4)} - ${signal.entryZone.max.toFixed(4)}`);
                console.log(`   🎯 Entry Price: ${entryPrice.toFixed(4)}`);
                console.log(`   🛑 Stop Loss: ${signal.stopLoss}`);
                console.log(`   🎯 Target: ${signal.targets[0]}`);
                
                // Verify Silver price ranges
                if (entryPrice >= 20 && entryPrice <= 50) {
                    console.log(`   ✅ REALISTIC SILVER PRICE: ${entryPrice.toFixed(4)} is in Silver range`);
                } else {
                    console.log(`   ❌ UNREALISTIC PRICE: ${entryPrice.toFixed(4)} is outside Silver range (20-50)`);
                }
                
                // Check if entry is close to your chart data (39.1077)
                if (Math.abs(entryPrice - 39.1077) < 1.0) {
                    console.log(`   ✅ MATCHES CHART: Entry ${entryPrice.toFixed(4)} is close to chart buying area 39.1077`);
                }
            } else {
                console.log(`   ❌ FAILED: No signal detected`);
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
    }
}

testSilverGreyZoneDetection().catch(console.error);
