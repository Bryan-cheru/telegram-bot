// Test Silver and EURCAD parsing specifically
const fs = require('fs');
const path = require('path');

// Test data
const testCases = [
  {
    name: 'Silver Signal',
    text: '#XAGUSD Silver BUY Entry: 40.500-40.700 SL: 40.200 TP: 41.000',
    caption: '#XAGUSD Silver BUY Entry: 40.500-40.700 SL: 40.200 TP: 41.000'
  },
  {
    name: 'EURCAD Signal', 
    text: '#EURCAD BUY Entry: 1.6100-1.6120 SL: 1.6080 TP: 1.6150',
    caption: '#EURCAD BUY Entry: 1.6100-1.6120 SL: 1.6080 TP: 1.6150'
  }
];

// Test Silver price pattern
const hasSilverPrices = /\b[1-5]\d\.\d{2,3}\b/;

console.log('🧪 Testing Silver price patterns:');
console.log('Pattern:', hasSilverPrices.toString());
console.log('40.500 matches:', hasSilverPrices.test('40.500'));
console.log('40.686 matches:', hasSilverPrices.test('40.686')); 
console.log('41.000 matches:', hasSilverPrices.test('41.000'));

console.log('\n🧪 Testing EURCAD price patterns:');
const hasForexPrices = /\b1\.\d{4,5}\b/;
console.log('Pattern:', hasForexPrices.toString());
console.log('1.6100 matches:', hasForexPrices.test('1.6100'));
console.log('1.60957 matches:', hasForexPrices.test('1.60957'));

console.log('\n🔍 Testing symbol detection:');
testCases.forEach(testCase => {
  console.log(`\n--- ${testCase.name} ---`);
  
  // Test symbol patterns
  const symbolPatterns = [
    /#(XAUUSD|Gold|XAU|GOLD)/i,
    /#(XAGUSD|Silver|XAG|SILVER)/i,
    /#(EURCAD)/i,
    /\b(XAUUSD|XAGUSD|EURCAD|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD|EURJPY|GBPJPY|EURGBP|AUDJPY|EURAUD|EURCHF|AUDNZD|NZDJPY|GBPAUD|GBPCAD|EURNZD|AUDCAD|GBPCHF|AUDCHF)\b/gi
  ];
  
  symbolPatterns.forEach((pattern, index) => {
    const match = testCase.text.match(pattern);
    console.log(`Pattern ${index + 1}: ${pattern} -> ${match ? match[0] : 'NO MATCH'}`);
  });
});
