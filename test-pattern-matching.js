const { TradeParser } = require('./dist/ocr/tradeParser');

// Test specific pattern matching
const sampleSignal = `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
On rejection from this area, bullish move expected.

🔼Signal:

📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408 - Final TP: Higher towards 3420+
❌ SL: 3370...!!`;

console.log('🧪 Testing Specific Pattern Matching...\n');

// Test Pattern 5: Gold/XAUUSD specific format
const pattern5 = /(?:#?XAUUSD|Gold)[\s\S]*?(Selling|Buying|SELL|BUY)[\s\S]*?(?:zone|resistance|support)[\s\S]*?\(?(\d+)[\s–-]+(\d+)\)?[\s\S]*?(?:SL|❌\s*SL)[\s:]?(\d+)[\s\S]*?(?:TP|🏹\s*TP)[\s:]*(\d+(?:\s*\/\s*\d+)?)/gi;

console.log('Testing Pattern 5...');
const match5 = pattern5.exec(sampleSignal);
if (match5) {
    console.log('✅ Pattern 5 Match:', match5);
} else {
    console.log('❌ Pattern 5 No match');
}

// Test Pattern 4: Caption format
const pattern4 = /#?(\w+)[\s\S]*?(BUY|SELL|Buying|Selling)[\s\S]*?(?:zone|levels?|area)[\s\S]*?\(?(\d+\.?\d*)[\s–-]+(\d+\.?\d*)\)?[\s\S]*?(?:SL|Stop|stop)[\s:]?(\d+\.?\d*)[\s\S]*?(?:TP|Target|targets?)[\s:]?([\d.\s\/,]+)/gi;

console.log('\nTesting Pattern 4...');
const match4 = pattern4.exec(sampleSignal);
if (match4) {
    console.log('✅ Pattern 4 Match:', match4);
} else {
    console.log('❌ Pattern 4 No match');
}

// Test a new pattern specifically for this format
console.log('\n🆕 Testing New Custom Pattern...');
const newPattern = /#?XAUUSD[\s\S]*?(Buy|Buying|BUY)[\s\S]*?(?:zone|area)[\s\S]*?(\d{4})\s*[–-]\s*(\d{4})[\s\S]*?(?:Tp1?|TP1?|Target)[\s\S]*?(\d{4})[\s\S]*?(?:SL|❌\s*SL)[\s\S]*?(\d{4})/gi;

const newMatch = newPattern.exec(sampleSignal);
if (newMatch) {
    console.log('✅ New Pattern Match:', newMatch);
    const [, action, entryMax, entryMin, target, stopLoss] = newMatch;
    console.log(`Action: ${action}`);
    console.log(`Entry: ${entryMin} - ${entryMax}`);
    console.log(`Target: ${target}`);
    console.log(`Stop Loss: ${stopLoss}`);
} else {
    console.log('❌ New Pattern No match');
}

// Manual extraction test
console.log('\n🔧 Manual Text Extraction...');
const lines = sampleSignal.split('\n');
lines.forEach((line, index) => {
    console.log(`Line ${index}: "${line}"`);
});

// Extract numbers
console.log('\n🔢 All numbers found:');
const allNumbers = sampleSignal.match(/\d{4}/g);
console.log(allNumbers);
