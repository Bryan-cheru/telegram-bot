const { TradeParser } = require('./dist/ocr/tradeParser');

const eurjpyUpdateMessage = `#EURJPY (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;

// Enhanced OCR simulation - including what would be detected from grey zones
const simulatedChartOCRWithGreyZone = `Euro / Japanese Yen • 2h • OANDA
EURJPY 2h
172.690
172.689
172.600
172.400
171.844 ← Current Price
171.711
171.600
171.473
171.400  ← Grey Zone Start
171.200  ← Grey Zone End
171.117
Best buying Area: 171.200 - 171.400
Admin: @FX_Trader3`;

console.log('🧪 Testing EURJPY Grey Zone Detection\n');
console.log('📝 Caption:');
console.log(eurjpyUpdateMessage);
console.log('\n📊 Chart OCR with Grey Zone:');
console.log(simulatedChartOCRWithGreyZone);
console.log('\n' + '='.repeat(60) + '\n');

const parser = new TradeParser();

console.log('1️⃣ Testing Grey Zone Extraction...');

const parsedSignal = parser.parseTradeSignal(simulatedChartOCRWithGreyZone, eurjpyUpdateMessage);

if (parsedSignal) {
    console.log('✅ GREY ZONE SIGNAL DETECTED!');
    console.log(`   Symbol: ${parsedSignal.symbol}`);
    console.log(`   Action: ${parsedSignal.action}`);
    console.log(`   Entry Zone (Grey): ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
    console.log(`   Stop Loss: ${parsedSignal.stopLoss}`);
    console.log(`   Targets: ${parsedSignal.targets.join(', ')}`);
    console.log(`   Reason: ${parsedSignal.reason}`);
    if (parsedSignal.plan) {
        console.log(`   Plan: ${parsedSignal.plan}`);
    }
    
    console.log('\n🎯 ANALYSIS:');
    const entryMid = (parsedSignal.entryZone.min + parsedSignal.entryZone.max) / 2;
    const riskDistance = Math.abs(parsedSignal.stopLoss - entryMid);
    const rewardDistance = Math.abs(parsedSignal.targets[0] - entryMid);
    const rrRatio = rewardDistance / riskDistance;
    
    console.log(`   Entry Mid: ${entryMid}`);
    console.log(`   Risk Distance: ${riskDistance.toFixed(3)}`);
    console.log(`   Reward Distance: ${rewardDistance.toFixed(3)}`);
    console.log(`   Risk:Reward Ratio: 1:${rrRatio.toFixed(2)}`);
    
} else {
    console.log('❌ NO SIGNAL DETECTED');
    
    // Debug what patterns are found
    console.log('\n🔧 DEBUG:');
    const greyPatterns = [
        /(?:Best|Good)\s+(?:Selling|Buying)\s+(?:Area|Zone)\s*:?\s*\(?(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)\)?/gi,
        /(\d{3}\.\d{2,4})\s*[-–—]\s*(\d{3}\.\d{2,4})\s*(?:Entry|Grey|Gray)/gi
    ];
    
    greyPatterns.forEach((pattern, index) => {
        const matches = [...simulatedChartOCRWithGreyZone.matchAll(pattern)];
        console.log(`Pattern ${index + 1} matches:`, matches.length > 0 ? matches[0] : 'None');
    });
}

console.log('\n' + '='.repeat(60));
console.log('💡 EXPECTED BEHAVIOR:');
console.log('The bot should:');
console.log('1. Detect "Best buying Area: 171.200 - 171.400" as grey entry zone');
console.log('2. Determine BUY action from "buying" keyword');
console.log('3. Set entry zone: 171.200 - 171.400');
console.log('4. Calculate stop loss below grey zone');
console.log('5. Calculate target with appropriate risk:reward ratio');
