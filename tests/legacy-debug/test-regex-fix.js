// Test EURCAD regex pattern fix
console.log('🧪 Testing EURCAD Price Regex Pattern...\n');

const testText = `
Euro / Canadian Dollar • 2h • OANDA
CAD
1.61850
1.61381
1.61290
1.61032
Support Become a Resistance
1.60829
1.60602
1.60500
Target
1.59860
1.59854
EURCAD
2h
`;

console.log('📄 Test text sample:', testText.substring(0, 200) + '...\n');

// Test the old broken pattern
const oldPattern = /\b(\d\.\d{4,5})\b/g;
const oldMatches = [...testText.matchAll(oldPattern)].map(m => parseFloat(m[1]));
console.log('❌ Old pattern matches:', oldMatches);

// Test the new fixed pattern  
const newPattern = /\b(\d{1,2}\.\d{4,5})\b/g;
const newMatches = [...testText.matchAll(newPattern)].map(m => parseFloat(m[1]));
console.log('✅ New pattern matches:', newMatches);

// Filter for EURCAD range
const filteredPrices = newMatches.filter(p => p >= 1.5 && p <= 1.7);
console.log('🎯 EURCAD range filtered:', filteredPrices);
console.log('📊 Count:', filteredPrices.length, '(need >= 3)');

if (filteredPrices.length >= 3) {
  console.log('✅ EURCAD handler should now work!');
} else {
  console.log('❌ Still not enough prices found');
}
