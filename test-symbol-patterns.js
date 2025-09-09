#!/usr/bin/env node

/**
 * Test dynamic symbol detection patterns
 */

console.log('🧪 Testing Dynamic Symbol Detection Patterns\n');
console.log('=' .repeat(60));

// Enhanced patterns from our implementation
const patterns = {
  // Major forex pairs (6 characters)
  forex6: /\b([A-Z]{6})\b/g,
  
  // Forex pairs with separator (7 characters)
  forex7: /\b([A-Z]{3}[\/\-_]?[A-Z]{3})\b/g,
  
  // Indices patterns
  indices: /\b(US30|NAS100|SPX?500|GER30|UK100|JPN225|AUS200|FRA40|ESP35|ITA40)\b/gi,
  
  // Crypto patterns
  crypto: /\b(BTC|ETH|XRP|LTC|BCH|ADA|DOT|LINK|UNI|DOGE|SHIB)USD\b/gi,
  
  // Commodities
  commodities: /\b(XAU|XAG|XPD|XPT|USO|UKO|UGA)USD\b/gi,
  
  // Oil patterns
  oil: /\b(USOIL|UKOIL|WTIOIL|BRENTOIL)\b/gi
};

const testCaptions = [
  'EURUSD BUY signal at 1.0850',
  'GBPJPY SELL at 189.50', 
  'US30 bullish setup',
  'NAS100 short signal',
  'BTCUSD moon shot',
  'XAUUSD gold rush',
  'USOIL crude analysis',
  'Check this NZDJPY setup',
  'SPX500 breakout incoming',
  'ETHUSD ready to pump'
];

testCaptions.forEach((caption, index) => {
  console.log(`\n📝 Test ${index + 1}: "${caption}"`);
  
  let found = false;
  
  for (const [patternName, regex] of Object.entries(patterns)) {
    const matches = caption.match(regex);
    if (matches) {
      matches.forEach(match => {
        console.log(`   ✅ ${patternName.toUpperCase()}: ${match}`);
        found = true;
      });
    }
  }
  
  if (!found) {
    console.log(`   ❌ No matches found`);
  }
});

console.log('\n' + '=' .repeat(60));
console.log('🎯 Pattern testing completed!');
console.log('\n📋 Summary:');
console.log('   ✅ Forex pairs: 6-char and 7-char patterns');
console.log('   ✅ Indices: US30, NAS100, SPX500, etc.');
console.log('   ✅ Crypto: BTCUSD, ETHUSD, etc.');
console.log('   ✅ Commodities: XAUUSD, XAGUSD, etc.');
console.log('   ✅ Oil: USOIL, UKOIL, etc.');
