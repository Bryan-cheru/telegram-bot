// Test Silver price pattern matching
console.log('🧪 Testing Silver Price Pattern Detection...\n');

const silverPricePattern = /\b[1-5]\d\.\d{2,3}\b/;

const testPrices = [
  '25.500',     // Should match
  '25.50',      // Should match  
  '32.450',     // Should match
  '15.123',     // Should match
  '59.999',     // Should match
  '60.000',     // Should NOT match (outside range)
  '9.500',      // Should NOT match (outside range)
  '125.500',    // Should NOT match (too high)
  '2,500.00',   // Comma format - won't match
  '25,500',     // Different format - won't match
];

console.log('Testing Silver price pattern: /\\b[1-5]\\d\\.\\d{2,3}\\b/\n');

testPrices.forEach(price => {
  const matches = silverPricePattern.test(price);
  console.log(`${matches ? '✅' : '❌'} "${price}" ${matches ? 'MATCHES' : 'does not match'}`);
});

console.log('\n🔍 Testing sample silver signals...\n');

const sampleTexts = [
  'XAGUSD BUY 25.500',
  'Silver entry: 32.45',
  'XAG zone: 28.123-29.456', 
  'Buy zone: 25.450-25.500\nTP: 26.000',
  'SILVER UPDATE: Hit TP1',
  'Entry 25,500 TP 26,000',  // Comma format
];

sampleTexts.forEach((text, i) => {
  const hasPattern = silverPricePattern.test(text);
  console.log(`${i+1}. "${text}"`);
  console.log(`   Silver prices detected: ${hasPattern ? '✅ YES' : '❌ NO'}`);
  console.log('');
});

// Test improved pattern
console.log('\n🔧 Testing improved Silver price pattern...\n');

const improvedSilverPattern = /\b([1-5]\d|[6-9])\.\d{1,4}\b/; // Covers 10-99.xxxx range

console.log('Improved pattern: /\\b([1-5]\\d|[6-9])\\.\\d{1,4}\\b/\n');

sampleTexts.forEach((text, i) => {
  const hasPattern = improvedSilverPattern.test(text);
  console.log(`${i+1}. "${text}"`);
  console.log(`   Silver prices detected: ${hasPattern ? '✅ YES' : '❌ NO'}`);
  console.log('');
});
