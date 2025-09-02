const { TradeParser } = require('./dist/ocr/tradeParser');

// Test the exact Silver signal you want to try
async function testSilverSignal() {
    console.log('\n🧪 Testing Silver Signal from User...\n');
    
    const parser = new TradeParser();
    
    const testSignal = {
        caption: '#SILVER (Update) 📊\n\nNext move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅',
        text: 'SILVER chart analysis buying area 39.1077 stop-loss 38.7340' // Simulated OCR from chart
    };
    
    console.log('📋 Testing Silver Update Signal:');
    console.log(`   Caption: "${testSignal.caption}"`);
    console.log(`   Simulated OCR: "${testSignal.text}"`);
    
    try {
        const signal = parser.parseTradeSignal(testSignal.text, testSignal.caption);
        
        if (signal) {
            console.log('\n✅ SUCCESS: Silver signal parsed!');
            console.log(`   🎯 Symbol: ${signal.symbol}`);
            console.log(`   📊 Action: ${signal.action}`);
            console.log(`   💰 Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
            console.log(`   🛑 Stop Loss: ${signal.stopLoss}`);
            console.log(`   🎯 Targets: ${signal.targets.join(', ')}`);
            console.log(`   📋 Order Type: ${signal.orderType}`);
            console.log(`   💡 Reason: ${signal.reason}`);
        } else {
            console.log('\n❌ FAILED: No signal detected');
            console.log('   This suggests the symbol detection or parsing logic needs adjustment');
        }
    } catch (error) {
        console.log(`\n❌ ERROR: ${error.message}`);
    }
}

testSilverSignal().catch(console.error);
