const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🔍 DEBUGGING RESULT/UPDATE MESSAGE DETECTION\n');

const testCases = [
  {
    name: "NAS100 Sell Signal",
    text: `#NAS100 Sell Setup

Tech index at resistance.
Entry: 15850 - 15800
SL: 15900
TP1: 15750
TP2: 15700
TP3: 15650`
  },
  
  {
    name: "Emoji Heavy Signal", 
    text: `🥇 #XAUUSD Setup

🔼 BUY Gold
📍 Entry: 3380 – 3375
🎯 TP: 3405
❌ SL: 3368

💪 Strong support holding!`
  },
  
  {
    name: "Actual Result Message (should be blocked)",
    text: `XAUUSD Result Update:

Entry: 2645 ✅
Target hit: 2635 ✅
+150 pips secured!

Perfect execution with no drawdown.`
  }
];

const parser = new TradeParser();

testCases.forEach((test, i) => {
  console.log(`${i+1}. Testing: ${test.name}`);
  console.log('-'.repeat(40));
  console.log('Text:', test.text);
  console.log('');
  
  const isResult = parser.isResultOrUpdateMessage(test.text);
  console.log(`Is Result Message: ${isResult ? '✅ YES (blocked)' : '❌ NO (allowed)'}`);
  
  if (isResult) {
    console.log('🔍 Why it was blocked:');
    const lower = test.text.toLowerCase();
    
    // Check each condition
    if (lower.includes('result update')) console.log('   - Contains "result update"');
    if (lower.includes('entry:') && lower.includes('target hit:')) console.log('   - Has entry: and target hit:');
    if (lower.includes('secured')) console.log('   - Contains "secured"');
    if (lower.includes('executed')) console.log('   - Contains "executed"');
    if (lower.includes('delivered')) console.log('   - Contains "delivered"');
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
});
