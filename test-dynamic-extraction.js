#!/usr/bin/env node

/**
 * Quick test to verify dynamic symbol extraction works for all trading pairs
 */

const { PhotoHandler } = require('./dist/bot/handlers/photoHandler.js');

// Test data for different instrument types
const testCaptions = [
  // Forex pairs
  'EURUSD BUY signal at 1.0850',
  'GBPJPY SELL at 189.50',
  'AUDUSD long entry',
  
  // Indices
  'US30 bullish setup',
  'NAS100 short signal',
  'SPX500 breakout',
  'GER30 technical analysis',
  
  // Crypto
  'BTCUSD moon shot',
  'ETHUSD pump incoming',
  'XRPUSD reversal',
  
  // Commodities
  'XAUUSD gold rush',
  'XAGUSD silver breakout',
  'USOIL crude analysis',
  
  // Complex patterns
  'Check this NZDJPY setup with great R:R',
  'USDCAD looking good for shorts',
  'Bitcoin BTCUSD ready to fly'
];

console.log('🧪 Testing Dynamic Symbol Extraction\n');
console.log('=' .repeat(50));

// Create a mock PhotoHandler instance for testing
const mockContext = { reply: () => {} };
const photoHandler = new PhotoHandler();

testCaptions.forEach((caption, index) => {
  console.log(`\n📝 Test ${index + 1}: "${caption}"`);
  
  try {
    // Access the private method via a test approach
    // Note: In production this would be tested via the public interface
    const result = photoHandler.extractInstrumentFromCaption(caption);
    
    if (result) {
      console.log(`   ✅ Detected: ${result.symbol} (${result.type})`);
      console.log(`   📊 Confidence: ${result.confidence}`);
    } else {
      console.log(`   ❌ No instrument detected`);
    }
  } catch (error) {
    console.log(`   ⚠️  Error: ${error.message}`);
  }
});

console.log('\n' + '=' .repeat(50));
console.log('🎯 Dynamic extraction test completed!');
console.log('\n💡 Note: This test verifies the symbol extraction logic.');
console.log('   The Visual ML system will handle chart analysis dynamically.');
