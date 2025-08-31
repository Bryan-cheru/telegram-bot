// Quick test for caption parsing with your specific signal
const testCaption = `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
On rejection from this area, bullish move expected.

🔼Signal:

📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408 - Final TP: Higher towards 3420+ ❌ SL: 3370...!!`;

console.log('Testing caption parsing...');
console.log('Original caption:', testCaption);
console.log('\n--- Pattern Tests ---');

// Test 1: Buy Setup Detection
const setupPatterns = [
  /(bullish|bearish|buying|selling)\s+(?:setup|zone)/i,
  /(buy|sell)\s+setup/i,
  /(buy|sell)\s+limit/i,
  /best\s+(buying|selling)\s+zone/i,
  /(bullish|bearish)\s+move\s+expected/i
];

console.log('\n1. Action Detection:');
setupPatterns.forEach((pattern, i) => {
  const match = testCaption.match(pattern);
  if (match) {
    console.log(`   ✅ Pattern ${i+1}: "${match[0]}" -> Action: ${match[1].toLowerCase().includes('bull') || match[1].toLowerCase().includes('buy') ? 'BUY' : 'SELL'}`);
  }
});

// Test 2: Entry Zone Detection
const entryPatterns = [
  /(?:zone|area|levels?)[:\s]*\(?(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)\)?/i,
  /(?:buy|sell)\s+limit[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
  /entry[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
  /(\d{4}\.?\d*)\s*[–\-~]\s*(\d{4}\.?\d*)/
];

console.log('\n2. Entry Zone Detection:');
entryPatterns.forEach((pattern, i) => {
  const match = testCaption.match(pattern);
  if (match) {
    const min = Math.min(parseFloat(match[1]), parseFloat(match[2]));
    const max = Math.max(parseFloat(match[1]), parseFloat(match[2]));
    console.log(`   ✅ Pattern ${i+1}: "${match[0]}" -> Entry: ${min} - ${max}`);
  }
});

// Test 3: Stop Loss Detection
const slPatterns = [
  /(?:stop\s+loss|SL|❌\s*SL)[:\s]*(\d+\.?\d*)/i,
  /SL[:\s]+(\d+\.?\d*)/i,
  /❌[^0-9]*(\d+\.?\d*)/
];

console.log('\n3. Stop Loss Detection:');
slPatterns.forEach((pattern, i) => {
  const match = testCaption.match(pattern);
  if (match) {
    console.log(`   ✅ Pattern ${i+1}: "${match[0]}" -> SL: ${match[1]}`);
  }
});

console.log('\n--- Symbol Detection Test ---');
const symbolMatch = testCaption.match(/#(XAUUSD|Gold|XAU|GOLD)/i);
if (symbolMatch) {
  console.log(`✅ Symbol detected: XAUUSD from pattern: ${symbolMatch[1]}`);
} else {
  console.log('❌ Symbol not detected');
}

console.log('\n--- Final Expected Result ---');
console.log('Expected: XAUUSD BUY 3375-3385 SL:3370 with 1:1 Target');
