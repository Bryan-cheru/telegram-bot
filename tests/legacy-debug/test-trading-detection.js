// Test the improved trading info detection
console.log('🧪 Testing improved trading info detection...\n');

function hasTradingSetupData(caption) {
  const tradingSetupPatterns = [
    /(?:SL|Stop\s*Loss)[\s:]*\d+/i,           // Stop Loss with number
    /(?:TP|Target|Take\s*Profit)[\s:]*\d+/i,  // Target with number
    /(?:Entry|Zone|Limit)[\s:]*\d+/i,         // Entry with number
    /\d+\.\d{3,5}/,                           // Price levels (1.61850)
    /\d+\s*[-–]\s*\d+/,                      // Price ranges
    /#\w+.*(?:buy|sell|limit|zone)/i          // Hashtag with setup
  ];
  
  return tradingSetupPatterns.some(pattern => pattern.test(caption));
}

// Test EURCAD update caption (should return FALSE - no trading setup)
const eurCadCaption = "EURCAD UPDATE NEXT MOVE ON THE WAY FOCUS ON PROPER RISK MANAGEMENT STAY DISCIPLINED. WISHING YOU SUCCESSFUL TRADES....";
console.log('📄 EURCAD Caption:', eurCadCaption.substring(0, 80) + '...');
console.log('📊 Has trading setup?', hasTradingSetupData(eurCadCaption));

if (!hasTradingSetupData(eurCadCaption)) {
  console.log('✅ EURCAD caption will trigger OCR on the image!');
} else {
  console.log('❌ Would still use caption only');
}

console.log('\n🧪 Testing with complete trading setup...');

// Test complete signal (should return TRUE)
const completeSignal = "#EURCAD Buy Zone 1.6180-1.6185 SL: 1.6170 TP: 1.6200";
console.log('📄 Complete Signal:', completeSignal);
console.log('📊 Has trading setup?', hasTradingSetupData(completeSignal));

console.log('\n🧪 Testing edge cases...');

// Test symbol mention without setup (should return FALSE)
const symbolOnly = "EURUSD looking bullish today";
console.log('📄 Symbol Only:', symbolOnly);
console.log('📊 Has trading setup?', hasTradingSetupData(symbolOnly));

// Test with price levels (should return TRUE)
const withPrices = "EURCAD analysis showing 1.61850 as key level";
console.log('📄 With Prices:', withPrices);
console.log('📊 Has trading setup?', hasTradingSetupData(withPrices));
