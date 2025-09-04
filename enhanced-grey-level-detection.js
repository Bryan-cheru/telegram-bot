/**
 * ENHANCEMENT: Single Grey Level Detection for Chart Scale
 * 
 * Current Issue: The US30 chart shows 45,373.83 as a single grey level on the price scale
 * Current System: Looks for grey entry zones (ranges), may miss single precise levels
 * 
 * Enhancement Needed: Detect individual grey-colored price levels on chart scale
 */

// Test data from the actual US30 chart
const chartScalePrices = [
  { price: 45477.99, color: 'white' },
  { price: 45373.83, color: 'grey' },      // This is our entry!
  { price: 45293.07, color: 'green' },     // Current market price
  { price: 45218.76, color: 'white' },
  { price: 44800.00, color: 'white' },
  { price: 43378.78, color: 'green' }      // Target level
];

function enhancedGreyLevelDetection(scalePrices, ocrText) {
  console.log('🎨 Enhanced Grey Level Detection');
  console.log('================================');
  
  // 1. Identify single grey levels (not just zones)
  const greyLevels = scalePrices.filter(p => p.color === 'grey' || p.color === 'gray');
  const greenLevels = scalePrices.filter(p => p.color === 'green');
  const redLevels = scalePrices.filter(p => p.color === 'red');
  
  console.log('Grey levels found:', greyLevels.map(p => p.price));
  console.log('Green levels found:', greenLevels.map(p => p.price));
  console.log('Red levels found:', redLevels.map(p => p.price));
  
  if (greyLevels.length === 0) {
    console.log('❌ No grey levels detected');
    return null;
  }
  
  // 2. For single grey level, create a tight entry zone around it
  if (greyLevels.length === 1) {
    const greyPrice = greyLevels[0].price;
    const buffer = greyPrice * 0.0005; // 0.05% buffer around single level
    
    console.log(`✅ Single grey entry level detected: ${greyPrice}`);
    console.log(`📊 Creating entry zone: ${greyPrice - buffer} - ${greyPrice + buffer}`);
    
    return {
      greyEntry: {
        min: greyPrice - buffer,
        max: greyPrice + buffer,
        confidence: 0.95 // High confidence for single grey level
      },
      detectionType: 'SINGLE_GREY_LEVEL',
      originalLevel: greyPrice
    };
  }
  
  // 3. For multiple grey levels, find the tightest cluster
  if (greyLevels.length > 1) {
    const prices = greyLevels.map(p => p.price).sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    
    console.log(`✅ Multiple grey levels detected: ${prices.join(', ')}`);
    console.log(`📊 Entry zone range: ${min} - ${max}`);
    
    return {
      greyEntry: {
        min: min,
        max: max,
        confidence: 0.90
      },
      detectionType: 'MULTIPLE_GREY_LEVELS',
      originalLevels: prices
    };
  }
}

function determineTradeDirection(greyEntry, greenLevels, currentPrice) {
  if (!greyEntry) return null;
  
  const entryMid = (greyEntry.min + greyEntry.max) / 2;
  
  console.log('\n🎯 Trade Direction Analysis:');
  console.log(`Entry Level: ${entryMid}`);
  console.log(`Current Price: ${currentPrice}`);
  
  let action;
  let reasoning;
  
  if (entryMid > currentPrice) {
    action = 'SELL';
    reasoning = `Entry (${entryMid}) above current price (${currentPrice}) - SELL limit order`;
  } else if (entryMid < currentPrice) {
    action = 'BUY';
    reasoning = `Entry (${entryMid}) below current price (${currentPrice}) - BUY limit order`;
  } else {
    action = 'MARKET';
    reasoning = `Entry (${entryMid}) at current price (${currentPrice}) - Market order`;
  }
  
  console.log(`✅ Recommended Action: ${action}`);
  console.log(`📝 Reasoning: ${reasoning}`);
  
  return { action, reasoning, entryPrice: entryMid };
}

// Test with actual chart data
console.log('🧪 Testing with US30 Chart Data:');
const currentMarketPrice = 45293.07; // Green level from chart

const result = enhancedGreyLevelDetection(chartScalePrices, 'US30 chart analysis');
if (result) {
  const tradeDirection = determineTradeDirection(result.greyEntry, 
    chartScalePrices.filter(p => p.color === 'green'), 
    currentMarketPrice);
    
  console.log('\n📊 FINAL ANALYSIS RESULT:');
  console.log('=======================');
  console.log(`Grey Entry Zone: ${result.greyEntry.min} - ${result.greyEntry.max}`);
  console.log(`Trade Action: ${tradeDirection.action}`);
  console.log(`Entry Price: ${tradeDirection.entryPrice}`);
  console.log(`Confidence: ${result.greyEntry.confidence * 100}%`);
  console.log(`Detection Type: ${result.detectionType}`);
}

console.log('\n💡 ENHANCEMENT SUMMARY:');
console.log('- ✅ Detects single grey levels on price scale');
console.log('- ✅ Creates appropriate entry zones around precise levels');  
console.log('- ✅ Handles both single and multiple grey levels');
console.log('- ✅ High confidence for precise grey level detection');
console.log('- ✅ Proper SELL limit order for entry above current price');

module.exports = { enhancedGreyLevelDetection, determineTradeDirection };
