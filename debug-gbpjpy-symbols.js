/**
 * Debug script to find GBPJPY symbols on all brokers
 * This will help us understand what symbols are actually available
 */

const fs = require('fs');

// Simulate broker specifications based on the logs
const brokerData = {
  'FTMO-Server3': {
    symbolCount: 131,
    patterns: ['GBPJPY', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash', 'GBPJPY_', 'GBPJPY.std', 'gbpjpy', 'GBPJPYpro']
  },
  'IFPro-Trade': {
    symbolCount: 69,
    patterns: ['GBPJPY', 'gbpjpy', 'GBPJPY_', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash']
  },
  'Pepperstone-MT5-Live01': {
    symbolCount: 1732,
    patterns: ['GBPJPY', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash', 'GBPJPY.a', 'GBPJPY_ECN', 'GBPJPYECN', 'gbpjpy']
  },
  'Pepperstone-MT5-Live02': {
    symbolCount: 1732,
    patterns: ['GBPJPY', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash', 'GBPJPY.a', 'GBPJPY_ECN', 'GBPJPYECN', 'gbpjpy']
  },
  'FTMO-Brian': {
    symbolCount: 131,
    patterns: ['GBPJPY', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash', 'GBPJPY_', 'GBPJPY.std', 'gbpjpy', 'GBPJPYpro']
  }
};

console.log('🔍 GBPJPY Symbol Analysis Based on Logs');
console.log('=' .repeat(60));

// Analyze each broker
for (const [broker, data] of Object.entries(brokerData)) {
  console.log(`\n📊 ${broker} (${data.symbolCount} total symbols)`);
  console.log(`   Tried patterns: ${data.patterns.join(', ')}`);
  console.log(`   Result: ❌ No GBPJPY found`);
}

console.log('\n🔍 Analysis Summary:');
console.log('- All brokers have significant symbol counts (69-1732 symbols)');
console.log('- Standard GBPJPY variations were tested on all brokers');
console.log('- No broker found any GBPJPY variation');

console.log('\n💡 Possible Reasons:');
console.log('1. GBPJPY may not be offered by these brokers');
console.log('2. GBPJPY might use a completely different symbol name');
console.log('3. GBPJPY might be temporarily unavailable');
console.log('4. Symbol might be filtered out due to trading restrictions');

console.log('\n🔧 Recommended Actions:');
console.log('1. Check if GBPJPY is actually available on these broker accounts');
console.log('2. Look for alternative GBP/JPY symbol names in broker platforms');
console.log('3. Consider adding a symbol discovery tool that lists all available symbols');
console.log('4. Check if there are account-specific trading restrictions');

console.log('\n📋 Common Alternative Symbol Names to Try:');
const alternatives = [
  'GBPJPY.raw',
  'GBPJPY.swap',
  'GBPJPY#',
  'GBP-JPY',
  'GBPJPY_raw',
  'GBPJPY_mini',
  'GBPJPY_micro',
  'GBPJPYex',
  'GBPJPYfx',
  'Sterling/Yen',
  'GBP_JPY',
  'POUND/YEN'
];

alternatives.forEach((alt, index) => {
  console.log(`   ${index + 1}. ${alt}`);
});

console.log('\n🚀 Next Steps:');
console.log('Run a full symbol discovery to see what symbols are actually available.');
