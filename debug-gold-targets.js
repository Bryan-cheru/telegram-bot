// Test Gold target extraction issue
console.log('🔍 TESTING GOLD TARGET EXTRACTION ISSUE');
console.log('=====================================');

// Your Gold signal OCR text (from logs)
const ocrText = `Gold Spot / U.S. Dollar - 30 - Phillip Nova = uso ~
Stop Loss (3604) en rn
| i ~~ selling Area: (3592 - 3596)
ik ) 3,590.000
[ I Target 1 Eee
I | 3,570.000
J |
i Hed Target2 | ili
fF Pid Cu .
| | JET ...`;

console.log('📄 OCR TEXT:');
console.log(ocrText);

// Test current price patterns
const patterns = [
  { name: 'Pattern 1 (Current)', regex: /\b[1-9]\d{3,4}\.?\d{0,2}\b/g },
  { name: 'Pattern 2 (Current)', regex: /\b\d{1,3}\.\d{4,5}\b/g },
  { name: 'Pattern 3 (Current)', regex: /\b\d{2,4}\.\d{2,3}\b/g }
];

patterns.forEach((pattern, index) => {
  console.log(`\n${pattern.name}:`);
  const matches = ocrText.match(pattern.regex) || [];
  console.log('  Raw matches:', matches);
  
  const prices = matches.map(m => parseFloat(m)).filter(p => p > 0);
  console.log('  Parsed prices:', prices);
  
  // Apply Gold price filter
  const validGoldPrices = prices.filter(p => p >= 1500 && p <= 5000);
  console.log('  Valid Gold prices:', validGoldPrices);
  
  const invalidPrices = prices.filter(p => p < 1500 && p > 100);
  console.log('  Invalid prices (should be 3xxx):', invalidPrices);
});

console.log('\n🎯 THE PROBLEM:');
console.log('Pattern 3 is matching "570.000" and "590.000"');
console.log('These should be "3570" and "3590" from visual context');
console.log('But OCR is reading "3,570.000" as "570.000" (missing 3 prefix)');

console.log('\n💡 SOLUTION:');
console.log('Need smarter price reconstruction for Gold signals');
console.log('When we find 590, 570, 540 in Gold context, assume 3590, 3570, 3540');

process.exit(0);
