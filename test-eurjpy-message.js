const { TradeParser } = require('./dist/ocr/tradeParser');

const eurjpyMessage = `#EURJPY (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;

console.log('🧪 Testing EURJPY Message\n');
console.log('📝 Message Text:');
console.log(eurjpyMessage);
console.log('\n' + '='.repeat(60) + '\n');

const parser = new TradeParser();

// Test if this is considered a result/motivational message
console.log('1️⃣ Checking Result Detection...');
const isResult = parser.isResultOrUpdateMessage(eurjpyMessage);
console.log(`Is Result/Update Message: ${isResult ? '🚫 YES (Blocked)' : '✅ NO (Allowed)'}`);

if (!isResult) {
    console.log('\n2️⃣ Testing Signal Parsing...');
    const parsedSignal = parser.parseTradeSignal(eurjpyMessage);
    
    if (parsedSignal) {
        console.log('✅ SIGNAL DETECTED:');
        console.log(`   Symbol: ${parsedSignal.symbol}`);
        console.log(`   Action: ${parsedSignal.action}`);
        console.log(`   Entry: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
        console.log(`   Stop Loss: ${parsedSignal.stopLoss}`);
        console.log(`   Targets: ${parsedSignal.targets.join(', ')}`);
    } else {
        console.log('❌ NO TRADING SIGNAL DETECTED');
        console.log('💡 This appears to be a motivational/educational message');
        console.log('   without specific entry, stop loss, or target levels.');
    }
} else {
    console.log('\n✅ CORRECT BEHAVIOR: Message blocked from trading');
    console.log('💡 This is a general update/motivational message, not a trade signal');
}

console.log('\n' + '='.repeat(60));
console.log('🔍 ANALYSIS:');
console.log('This message contains:');
console.log('- ✅ Symbol reference (#EURJPY)');
console.log('- ✅ "Update" label');
console.log('- ❌ No entry price/zone');
console.log('- ❌ No stop loss level');
console.log('- ❌ No target price');
console.log('- ✅ Motivational content');
console.log('\n💭 CONCLUSION: This is educational/motivational content, not a trade signal');
