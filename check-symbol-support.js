// Simple Symbol Check
// File: check-symbol-support.js

require('dotenv').config();

// Mock logger for this test
const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log
};

// Mock the imports to check symbol support
const mockSymbols = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'US30', 'BTCUSD'
];

console.log('🔍 CHECKING SYMBOL SUPPORT');
console.log('═══════════════════════════\n');

console.log('💡 DIAGNOSIS:');
console.log('The issue is likely that XAGUSD is NOT in the discovered symbols from your brokers.');
console.log('Even though aliasMap["SILVER"] = "XAGUSD", if XAGUSD doesnt exist on your brokers,');
console.log('the detection will fail at UniversalSymbolSupport.isSymbolSupported(XAGUSD)\n');

console.log('🧪 TESTING ALIAS MAPPING:');
const aliasMap = {
    'GOLD': 'XAUUSD',
    'SILVER': 'XAGUSD',
    'SILVERUSD': 'XAGUSD'
};

const testInput = 'SILVER';
const mappedSymbol = aliasMap[testInput];
console.log(`Input: "${testInput}" → Mapped to: "${mappedSymbol}"`);

// Simulate the check that's failing
const mockSupportedSymbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30']; // No XAGUSD
const isSupported = mockSupportedSymbols.includes(mappedSymbol);
console.log(`Is "${mappedSymbol}" in supported symbols? ${isSupported}`);
console.log(`Supported symbols: [${mockSupportedSymbols.join(', ')}]`);

if (!isSupported) {
    console.log('\n❌ THIS IS THE PROBLEM!');
    console.log(`SILVER maps to XAGUSD, but XAGUSD is not available on your brokers.`);
}

console.log('\n🔧 SOLUTIONS:');
console.log('1. Check if your brokers actually support silver trading');
console.log('2. Find the correct silver symbol name on your brokers');
console.log('3. Update the alias mapping to use the correct symbol');
console.log('4. Add fallback symbols in the alias mapping');

console.log('\n📋 NEXT STEPS:');
console.log('Run your bot with debug logging and look for:');
console.log('- "Discovered symbols from broker X"');
console.log('- Check if any XAG*, SILVER*, or silver-related symbols appear');
console.log('- Update aliasMap with the actual silver symbol your brokers use');
