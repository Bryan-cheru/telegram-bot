// Quick test to verify fallback symbol system
const { EnhancedSymbolDetector } = require('./src/utils/enhancedSymbolDetector');

async function testFallbackSymbols() {
  console.log('🧪 Testing Fallback Symbol System...\n');
  
  const testSymbols = [
    'EURUSD',
    'GBPUSD', 
    'XAUUSD',
    'GOLD',
    'SILVER',
    'BTCUSD',
    'US30'
  ];
  
  for (const symbol of testSymbols) {
    console.log(`Testing: ${symbol}`);
    const result = await EnhancedSymbolDetector.detectSymbol(symbol);
    if (result) {
      console.log(`✅ ${symbol} → ${result.symbol} (${result.confidence}% confidence, source: ${result.source})`);
    } else {
      console.log(`❌ ${symbol} → No match found`);
    }
    console.log('');
  }
  
  console.log('🎉 Fallback system test complete!');
}

testFallbackSymbols().catch(console.error);
