/**
 * Test the USDJPY ML price filtering fix
 * Should reject chart scale markers (7, 2, 13) and accept valid levels (~146-148)
 */

// Since we're testing TypeScript code from Node.js, we'll simulate the functionality
const logger = {
  info: console.log,
  warn: console.log,
  error: console.log,
  debug: console.log
};

// Simulate the price range configuration
const mockTradingConfig = {
  getPriceRange: (symbol) => {
    const ranges = {
      'USDJPY': { min: 130, max: 160 },
      'GBPJPY': { min: 160, max: 200 },
      'EURJPY': { min: 145, max: 175 },
      'DEFAULT': { min: 1, max: 100000 }
    };
    return ranges[symbol] || ranges.DEFAULT;
  }
};

// Simulate the filtering logic from colorAnalysisML.ts
function testPriceFiltering(symbol, prices, currentPrice) {
  console.log(`\n🧪 Testing ${symbol} price filtering`);
  console.log(`📊 Input prices: ${prices.join(', ')}`);
  if (currentPrice) {
    console.log(`💰 Current market price: ${currentPrice}`);
  }
  
  const upperSymbol = symbol.toUpperCase();
  const priceRange = mockTradingConfig.getPriceRange(upperSymbol);
  
  let filteredPrices = prices.filter(price => {
    // Basic range check
    if (price < priceRange.min || price > priceRange.max) {
      console.log(`❌ Rejected ${price} - outside range ${priceRange.min}-${priceRange.max}`);
      return false;
    }
    
    // Market price validation (if available)
    if (currentPrice && currentPrice > 0) {
      const tolerance = 0.20; // 20% tolerance
      const minValidPrice = currentPrice * (1 - tolerance);
      const maxValidPrice = currentPrice * (1 + tolerance);
      
      if (price < minValidPrice || price > maxValidPrice) {
        console.log(`❌ Rejected ${price} - too far from current price ${currentPrice} (valid range: ${minValidPrice.toFixed(2)}-${maxValidPrice.toFixed(2)})`);
        return false;
      }
    }
    
    const priceStr = price.toString();
    
    // Reject obvious chart scale markers (single digits for most symbols)
    if (price < 10 && !upperSymbol.includes('NAS') && !upperSymbol.includes('SPX')) {
      console.log(`❌ Rejected ${price} - likely chart scale marker for ${upperSymbol}`);
      return false;
    }
    
    // JPY-specific validation
    if (upperSymbol.includes('JPY')) {
      if (price < 50 || price > 250) {
        console.log(`❌ Rejected ${price} - outside JPY typical range (50-250)`);
        return false;
      }
      if (price < 20) {
        console.log(`❌ Rejected ${price} - obvious JPY chart scale marker`);
        return false;
      }
      if (priceStr.length <= 2 && price < 50) {
        console.log(`❌ Rejected ${price} - looks like chart coordinate for JPY`);
        return false;
      }
    }
    
    console.log(`✅ Accepted ${price} - valid trading level`);
    return true;
  });
  
  console.log(`🎯 Result: ${filteredPrices.length} valid prices: ${filteredPrices.join(', ')}`);
  return filteredPrices;
}

// Test cases
console.log('='.repeat(60));
console.log('🧪 USDJPY ML PRICE FILTERING TEST');
console.log('='.repeat(60));

// Test case 1: The problematic case (USDJPY with chart scale markers)
testPriceFiltering('USDJPY', [7, 2, 13, 146.50, 147.20, 145.80], 146.60);

// Test case 2: USDJPY without current price (should still filter out single digits)
testPriceFiltering('USDJPY', [7, 2, 13, 146.50, 147.20, 145.80], null);

// Test case 3: Valid USDJPY levels only
testPriceFiltering('USDJPY', [146.50, 147.20, 145.80, 148.00], 146.60);

// Test case 4: GBPJPY with similar issue
testPriceFiltering('GBPJPY', [5, 8, 12, 185.50, 186.20, 184.80], 185.60);

// Test case 5: XAUUSD (should work differently)
testPriceFiltering('XAUUSD', [5, 8, 12, 2650.50, 2651.20, 2649.80], 2650.60);

console.log('\n✅ Testing complete! Check if single digits are properly rejected for JPY pairs.');
