const { TradeParser } = require('./dist/ocr/tradeParser');

const eurjpyUpdateMessage = `#EURJPY (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;

// Realistic OCR simulation - what would actually be extracted from your EURJPY chart
const realChartOCR = `Euro / Japanese Yen • 2h • OANDA
EURJPY 2h
172.690
172.689
172.600
172.400
171.844
171.711  ← This is the grey zone entry
171.600
171.473
171.400
171.200
171.117
Admin: @FX_Trader3`;

console.log('🧪 Testing Precise Grey Zone Entry Detection\n');
console.log('📝 Caption:');
console.log(eurjpyUpdateMessage);
console.log('\n📊 Real Chart OCR:');
console.log(realChartOCR);
console.log('\n🎯 EXPECTED: Entry at 171.711 (grey zone price level)');
console.log('\n' + '='.repeat(60) + '\n');

const parser = new TradeParser();

const parsedSignal = parser.parseTradeSignal(realChartOCR, eurjpyUpdateMessage);

if (parsedSignal) {
    console.log('✅ SIGNAL DETECTED!');
    console.log(`   Symbol: ${parsedSignal.symbol}`);
    console.log(`   Action: ${parsedSignal.action}`);
    console.log(`   Entry Zone: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
    console.log(`   Stop Loss: ${parsedSignal.stopLoss}`);
    console.log(`   Targets: ${parsedSignal.targets.join(', ')}`);
    
    // Check if 171.711 is within the detected entry zone
    const targetEntry = 171.711;
    const inZone = targetEntry >= parsedSignal.entryZone.min && targetEntry <= parsedSignal.entryZone.max;
    
    console.log(`\n📊 PRECISION CHECK:`);
    console.log(`   Target Entry (171.711): ${inZone ? '✅ IN ZONE' : '❌ NOT IN ZONE'}`);
    console.log(`   Zone Coverage: ${parsedSignal.entryZone.min} ≤ 171.711 ≤ ${parsedSignal.entryZone.max}`);
    
} else {
    console.log('❌ NO SIGNAL DETECTED');
}

console.log('\n' + '='.repeat(60));
console.log('💡 CHART ANALYSIS LOGIC NEEDED:');
console.log('For consistent grey zone detection:');
console.log('1. Extract ALL price levels from OCR text');
console.log('2. Identify which prices are in the "grey zone" visually');
console.log('3. Use those specific price levels as entry zones');
console.log('4. For EURJPY: 171.711 should be the primary entry');
console.log('5. Set SL below grey zone, TP in green zone area');
