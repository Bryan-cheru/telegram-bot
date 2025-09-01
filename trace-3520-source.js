#!/usr/bin/env node

/**
 * DEEPER DEBUG: Find where exactly 3520 comes from
 */

require('dotenv').config();

console.log('🔍 TRACING THE EXACT SOURCE OF 3520');
console.log('===================================');

const ocrText = `@ Gold Spot / U.S. Dollar - 1h- OANDA © '= Final Target usD ~~
3,430.000
3,420.000
3,408:369)
\\o. ee, i ee Target 1 FEYER
38:34
100-000
. . . 3,390.000
a. Lo EEEn
se ' LT Best buying Area: (3385-3375) ~ 3,380.000
cot tani ry
[Adi a fale = 3,360.000
wp,
L i adh. 3.340.000
20 2 22 2 26 27 28 29 Sep 2 3 4 ®
@xawst 1h 2% BOO hw = eM`;

console.log('📄 OCR TEXT ANALYSIS:');
console.log('======================');

// Test different price patterns that might extract 3520
const patterns = [
    { name: 'Standard (3+ digits)', pattern: /\b(\d{3,4}\.\d{2,4})\b/g },
    { name: 'With commas', pattern: /(\d{1,3},\d{3}\.?\d*)/g },
    { name: 'All 4-digit numbers', pattern: /\b(\d{4})\b/g },
    { name: 'Gold-like prices', pattern: /3[0-9]{3}\.?\d*/g },
    { name: 'Any number sequence', pattern: /\d+\.?\d*/g },
];

patterns.forEach(({ name, pattern }) => {
    console.log(`\n${name}:`);
    const matches = [...ocrText.matchAll(pattern)];
    const numbers = matches.map(m => m[1] || m[0]).filter(n => parseFloat(n) > 100);
    console.log('  Raw matches:', matches.map(m => m[0]));
    console.log('  Parsed numbers:', numbers.map(n => parseFloat(n.replace(',', ''))));
});

// Check if 3520 could be constructed from OCR errors
console.log('\n🔍 POSSIBLE OCR MISREADS:');
console.log('==========================');
const lines = ocrText.split('\n');
lines.forEach((line, i) => {
    if (line.includes('3')) {
        console.log(`Line ${i+1}: "${line}"`);
        
        // Check if this line could be misread as containing 3520
        if (line.includes('3,4') || line.includes('352') || line.includes('520')) {
            console.log(`  ⚠️ Could be source of 3520`);
        }
    }
});

// Test the exact pattern used in the code
console.log('\n🎯 EXACT PATTERN FROM CODE:');
console.log('============================');
const pricePattern = /\b(\d{3}\.\d{2,4})\b/g;
const codeMatches = [...ocrText.matchAll(pricePattern)];
console.log('Code pattern matches:', codeMatches.map(m => m[1]));

// Now check what happens with the full number processing
const allPrices = codeMatches.map(m => parseFloat(m[1])).filter(p => p > 0);
console.log('Filtered prices > 0:', allPrices);

// Sort descending to see what would be "current price"
allPrices.sort((a, b) => b - a);
console.log('Sorted descending:', allPrices);
console.log('Would use as "current price":', allPrices[0]);

// The bug might be elsewhere - let me check if 3520 is hardcoded or calculated
console.log('\n💭 HYPOTHESIS:');
console.log('===============');
console.log('1. OCR gives us prices like 3430, 3420, 3390, etc.');
console.log('2. Code calculates grey zone correctly (3380-3390)');
console.log('3. But then some other logic creates 3520 entry');
console.log('4. 3520 might be coming from:');
console.log('   - Current market price + some calculation');
console.log('   - Stop loss calculation error');
console.log('   - 1:1 RR calculation using wrong base');
console.log('   - Different OCR processing we haven\'t seen');

process.exit(0);
