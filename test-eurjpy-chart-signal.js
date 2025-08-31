const { TradeParser } = require('./dist/ocr/tradeParser');

const eurjpyUpdateMessage = `#EURJPY (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;

// Simulated OCR text that would be extracted from the chart image
const simulatedChartOCR = `Euro / Japanese Yen • 2h • OANDA
EURJPY 2h
172.690
172.689
172.600
172.400
171.844
171.711
171.600
171.473
171.400
171.200
171.117
Admin: @FX_Trader3`;

console.log('🧪 Testing EURJPY Chart Signal Parsing\n');
console.log('📝 Caption/Message Text:');
console.log(eurjpyUpdateMessage);
console.log('\n📊 Simulated Chart OCR Text:');
console.log(simulatedChartOCR);
console.log('\n' + '='.repeat(60) + '\n');

const parser = new TradeParser();

console.log('1️⃣ Testing with Chart OCR Data...');

// Combine caption and OCR text (as the bot would do)
const fullText = `${simulatedChartOCR}\n${eurjpyUpdateMessage}`;
console.log('Combined text for parsing:', fullText.substring(0, 100) + '...');

const parsedSignal = parser.parseTradeSignal(simulatedChartOCR, eurjpyUpdateMessage);

if (parsedSignal) {
    console.log('✅ CHART SIGNAL DETECTED!');
    console.log(`   Symbol: ${parsedSignal.symbol}`);
    console.log(`   Action: ${parsedSignal.action}`);
    console.log(`   Entry: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
    console.log(`   Stop Loss: ${parsedSignal.stopLoss}`);
    console.log(`   Targets: ${parsedSignal.targets.join(', ')}`);
    if (parsedSignal.reason) {
        console.log(`   Reason: ${parsedSignal.reason}`);
    }
} else {
    console.log('❌ NO SIGNAL DETECTED FROM CHART');
    console.log('\n🔧 DEBUG: Let me check what the visual parser sees...');
    
    // Check if EURJPY is detected as a valid symbol
    console.log('- Contains EURJPY:', fullText.includes('EURJPY'));
    console.log('- Contains Update:', eurjpyUpdateMessage.includes('Update'));
    console.log('- Price levels found:', fullText.match(/171\.\d{3}/g));
    console.log('- Higher levels:', fullText.match(/172\.\d{3}/g));
}

console.log('\n' + '='.repeat(60));
console.log('💡 EXPECTED BEHAVIOR:');
console.log('With "Update" keyword + chart image, bot should:');
console.log('1. Detect EURJPY symbol from chart');
console.log('2. Identify price zones (green = buy, red = sell)');
console.log('3. Extract entry, target, and stop loss levels');
console.log('4. Generate trading signal automatically');
console.log('\n📈 From your chart, the signal might be:');
console.log('- Current: ~171.844');
console.log('- Green zone (buy target): ~172.600+'); 
console.log('- Red zone (sell area): ~171.400-');
console.log('- Potential setup: Buy on bounce from support ~171.400');
