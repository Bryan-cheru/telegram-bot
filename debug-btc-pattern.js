// Debug the BTCUSD price pattern
const chartText = `Bitcoin / U.S. Dollar - 2h - INDEX © usp ~
o | , fi I 10,UUU.VU
Fr
| i iE } oo 114,000.00
IE i i ly l 2 p 112,000.00
| wl To ly
oC LE 4 | LE iE
tl CL  selingae(081-1000) py
|
| 104,000.00
17 i mnomaen...

108,105.64
108.1 - 109.1
101,439.42
110,013.96
106,889.87
55:53`;

console.log('🧪 Debugging BTCUSD price patterns...');

// Test current BTCUSD pattern
const btcPattern = /\b([1-9]\d{4,5}\.?\d{0,2})\b/g;
console.log('\n📋 Current BTCUSD pattern:', btcPattern);

const matches = [...chartText.matchAll(btcPattern)];
console.log('🔍 Pattern matches:', matches.map(m => m[1]));

// Test with comma-aware pattern
const btcPatternWithCommas = /\b([1-9]\d{1,2}[,.]?\d{3}[,.]?\d{0,2})\b/g;
console.log('\n📋 BTCUSD pattern with commas:', btcPatternWithCommas);

const commaMatches = [...chartText.matchAll(btcPatternWithCommas)];
console.log('🔍 Comma-aware matches:', commaMatches.map(m => m[1]));

// Test parsing
const testPrices = ['108,105.64', '114,000.00', '112,000.00', '104,000.00', '101,439.42'];
console.log('\n🧮 Testing price parsing:');
testPrices.forEach(price => {
  const parsed = parseFloat(price.replace(/,/g, ''));
  console.log(`  ${price} → ${parsed}`);
});

// Test if prices are in the valid range
const btcRange = { min: 50000, max: 150000 };
console.log('\n✅ Valid BTCUSD range:', btcRange);
testPrices.forEach(price => {
  const parsed = parseFloat(price.replace(/,/g, ''));
  const isValid = parsed >= btcRange.min && parsed <= btcRange.max;
  console.log(`  ${price} (${parsed}) → ${isValid ? '✅ Valid' : '❌ Invalid'}`);
});