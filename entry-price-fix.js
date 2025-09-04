/**
 * CRITICAL FIX: US30 Entry Price = 0 Issue
 * 
 * Problem Analysis:
 * - Real failed signal: "#US30 (Update) 📊 Next move on the way"
 * - OCR parsing returns entryZone: { min: 0, max: 0 }
 * - multiAccountMetaApiExecutor calculates finalEntryPrice = 0
 * - MetaAPI rejects with "TRADE_RETCODE_INVALID_PRICE"
 * 
 * Root Cause:
 * When entryZone = { min: 0, max: 0 }, the calculation:
 * - BUY: Math.max(0, Math.min(0, currentPrice - 0.0001)) = 0
 * - SELL: Math.min(0, Math.max(0, currentPrice + 0.0001)) = 0
 * 
 * Solution:
 * 1. Detect invalid entryZone (min=0, max=0)
 * 2. Use current market price as fallback with small offset
 * 3. Apply proper limit order pricing rules
 */

const INVALID_ENTRY_ZONE_THRESHOLD = 0.01; // Entry zone smaller than this is considered invalid

/**
 * Enhanced entry price calculation with current market price fallback
 */
function calculateEntryPriceWithFallback(signal, currentPrice) {
  const isInvalidEntryZone = 
    signal.entryZone.min <= INVALID_ENTRY_ZONE_THRESHOLD &&
    signal.entryZone.max <= INVALID_ENTRY_ZONE_THRESHOLD;

  if (isInvalidEntryZone) {
    console.log('⚠️ Invalid entry zone detected, using current market price fallback');
    
    // Use current market price with appropriate offset for limit orders
    if (signal.action === 'BUY') {
      // BUY limit must be BELOW current price
      return currentPrice - (currentPrice * 0.0001); // 0.01% below
    } else if (signal.action === 'SELL') {
      // SELL limit must be ABOVE current price  
      return currentPrice + (currentPrice * 0.0001); // 0.01% above
    }
  }

  // Original logic for valid entry zones
  if (signal.action === 'BUY') {
    const maxBuyPrice = Math.min(signal.entryZone.max, currentPrice - 0.0001);
    return Math.max(signal.entryZone.min, maxBuyPrice);
  } else if (signal.action === 'SELL') {
    const minSellPrice = Math.max(signal.entryZone.min, currentPrice + 0.0001);
    return Math.min(signal.entryZone.max, minSellPrice);
  } else {
    return (signal.entryZone.min + signal.entryZone.max) / 2;
  }
}

// Test the fix with actual US30 data
const testSignal = {
  symbol: 'US30',
  action: 'BUY',
  entryZone: { min: 0, max: 0 }, // Invalid zone from failed parsing
  stopLoss: 0,
  targets: [0]
};

const currentUS30Price = 45236.8; // From the logs

console.log('🧪 Testing entry price calculation fix:');
console.log('Signal:', testSignal);
console.log('Current Price:', currentUS30Price);

const fixedEntryPrice = calculateEntryPriceWithFallback(testSignal, currentUS30Price);
console.log('Fixed Entry Price:', fixedEntryPrice);
console.log('Is Valid?', fixedEntryPrice > 0 && fixedEntryPrice < currentUS30Price);

module.exports = { calculateEntryPriceWithFallback, INVALID_ENTRY_ZONE_THRESHOLD };
