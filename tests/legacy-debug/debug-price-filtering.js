// Simple EURCAD parsing debug
// Let's add more logging to understand why EURCAD fails

console.log('🧪 Testing EURCAD Parsing Logic...\n');

// Test the FOREX_PAIRS array and price filtering
const FOREX_PAIRS = [
  'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURAUD', 'GBPAUD',
  'EURCAD', 'GBPCAD', 'AUDCAD', 'CADJPY', 'NZDCAD'
];

const symbol = 'EURCAD';
const upperSym = symbol.toUpperCase();

console.log('🔍 Symbol Analysis:');
console.log('Symbol:', symbol);
console.log('upperSym:', upperSym);
console.log('Is in FOREX_PAIRS?', FOREX_PAIRS.some(pair => upperSym.includes(pair)));

// Test price filtering
const getMinPriceForSymbol = (sym) => {
  const upperSym = sym.toUpperCase();
  if (upperSym.includes('XAG') || upperSym.includes('SILVER')) return 15;
  if (upperSym.includes('XAU') || upperSym.includes('GOLD')) return 1000;
  if (upperSym.includes('BTC') || upperSym.includes('BITCOIN')) return 10000;
  if (FOREX_PAIRS.some(pair => upperSym.includes(pair))) return 0.1;
  return 100;
};

const getMaxPriceForSymbol = (sym) => {
  const upperSym = sym.toUpperCase();
  if (upperSym.includes('XAG') || upperSym.includes('SILVER')) return 60;
  if (upperSym.includes('XAU') || upperSym.includes('GOLD')) return 5000;
  if (upperSym.includes('BTC') || upperSym.includes('BITCOIN')) return 200000;
  if (FOREX_PAIRS.some(pair => upperSym.includes(pair))) return 200; // FIXED
  return 100000;
};

const minPrice = getMinPriceForSymbol(symbol);
const maxPrice = getMaxPriceForSymbol(symbol);

console.log('💰 Price Range:');
console.log('minPrice:', minPrice);
console.log('maxPrice:', maxPrice);

// Test actual EURCAD prices from your chart
const testPrices = [1.61850, 1.61381, 1.61290, 1.61032, 1.60829, 1.60602, 1.60500, 1.59860, 1.59854];
console.log('📊 Chart Prices:', testPrices);

const filteredPrices = testPrices.filter(p => p >= minPrice && p <= maxPrice);
console.log('✅ Filtered Prices:', filteredPrices);
console.log('🎯 Price Count:', filteredPrices.length, '(need >= 4 for parsing)');

if (filteredPrices.length >= 4) {
  console.log('✅ EURCAD should parse successfully!');
  
  // Test grey zone extraction
  filteredPrices.sort((a, b) => a - b);
  const priceCount = filteredPrices.length;
  const startIdx = Math.floor(priceCount * 0.3);
  const endIdx = Math.floor(priceCount * 0.7);
  const greyZonePrices = filteredPrices.slice(startIdx, endIdx);
  
  console.log('🔘 Grey Zone Analysis:');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
  console.log('greyZonePrices:', greyZonePrices);
  
  if (greyZonePrices.length >= 2) {
    const greyMin = Math.min(...greyZonePrices);
    const greyMax = Math.max(...greyZonePrices);
    const medianPrice = greyZonePrices[Math.floor(greyZonePrices.length / 2)];
    
    console.log('Entry Zone:', { min: greyMin, max: greyMax, median: medianPrice });
  }
} else {
  console.log('❌ Not enough prices - parsing will fail');
}
