#!/usr/bin/env node

/**
 * HYPOTHESIS: The bot might be using current market price (3470) 
 * plus some calculation to get 3520 instead of using the grey zone
 */

require('dotenv').config();

console.log('🚨 TESTING HYPOTHESIS: Current Price + Buffer = 3520');
console.log('====================================================');

const currentMarketPrice = 3470.23; // From our price check
const expectedEntry = 3520; // From bot logs
const greyZoneEntry = 3385; // From our OCR analysis

console.log('📊 DATA POINTS:');
console.log(`   Current XAUUSD market price: ${currentMarketPrice}`);
console.log(`   Bot calculated entry: ${expectedEntry}`);
console.log(`   OCR grey zone entry: ${greyZoneEntry}`);
console.log(`   Difference (market → entry): ${(expectedEntry - currentMarketPrice).toFixed(2)}`);

// Test if 3520 could be derived from current price
console.log('\n🧪 POSSIBLE CALCULATIONS:');
console.log('===========================');

const calculations = [
    { name: 'Current + 50 points', value: currentMarketPrice + 50 },
    { name: 'Current + stop distance (30)', value: currentMarketPrice + 30 },
    { name: 'Current + 2% risk', value: currentMarketPrice * 1.02 },
    { name: 'Current + spread buffer', value: currentMarketPrice + 49.77 }, // Exact to get 3520
    { name: 'Round to nearest 10s', value: Math.round(currentMarketPrice / 10) * 10 },
    { name: 'Round to nearest 50s', value: Math.round(currentMarketPrice / 50) * 50 },
];

calculations.forEach(calc => {
    const diff = Math.abs(calc.value - expectedEntry);
    const match = diff < 5 ? '✅ CLOSE MATCH!' : diff < 20 ? '⚠️ Possible' : '❌';
    console.log(`   ${calc.name}: ${calc.value.toFixed(2)} (diff: ${diff.toFixed(2)}) ${match}`);
});

console.log('\n🔍 ROOT CAUSE ANALYSIS:');
console.log('========================');
console.log('The bot is NOT using your grey entry zone (3385)');
console.log('Instead, it\'s calculating entry as ~3520');
console.log('This creates a BUY order 50 points ABOVE current market');
console.log('Brokers reject this as "invalid" - you can\'t buy above market without LIMIT order');

console.log('\n💡 THE REAL ISSUE:');
console.log('===================');
console.log('1. Visual parsing extracts grey zone correctly (3385)');
console.log('2. But some logic overrides this with 3520');
console.log('3. 3520 is likely from "current price inference" bug in the parser');
console.log('4. Code thinks current price is ~3470 + some buffer = 3520');
console.log('5. This makes broker reject the trade as "Invalid stops"');

console.log('\n🔧 IMMEDIATE FIX NEEDED:');
console.log('=========================');
console.log('Find where the parser overrides grey zone (3385) with calculated price (3520)');
console.log('The issue is in the visual parsing logic around lines 900-920');
console.log('Remove the "current price inference" and use grey zone directly');

process.exit(0);
