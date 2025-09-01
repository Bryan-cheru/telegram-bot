#!/usr/bin/env node

/**
 * FINAL DEBUG: Simulate the exact parsing steps to find where 3520 comes from
 */

require('dotenv').config();

console.log('🎯 FINAL PARSING SIMULATION - FINDING 3520');
console.log('============================================');

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

// Simulate ENHANCED price extraction (as used in visual parsing)
console.log('🔍 ENHANCED PRICE EXTRACTION:');
console.log('==============================');

// Test different patterns
const patterns = [
    { name: 'Current code pattern', pattern: /\b(\d{3}\.\d{2,4})\b/g },
    { name: 'With commas (fixed)', pattern: /(\d{1,3},?\d{3}\.?\d*)/g },
    { name: 'XAUUSD specific', pattern: /3[,]?[0-9]{3}\.?\d*/g },
    { name: 'All numbers with commas', pattern: /\d{1,3},\d{3}\.?\d*/g },
];

patterns.forEach(({ name, pattern }) => {
    console.log(`\n${name}:`);
    const matches = [...ocrText.matchAll(pattern)];
    console.log('  Raw matches:', matches.map(m => m[0]));
    
    // Process like the actual code would
    const processed = matches.map(m => {
        let numStr = m[0].replace(/,/g, ''); // Remove commas
        let num = parseFloat(numStr);
        return { raw: m[0], processed: numStr, value: num };
    }).filter(item => item.value > 0);
    
    console.log('  Processed:', processed);
    
    if (processed.length > 0) {
        const sorted = processed.map(p => p.value).sort((a, b) => b - a);
        console.log('  Sorted desc:', sorted);
        console.log('  "Current price":', sorted[0]);
    }
});

// Now let's see the EXACT sequence that creates entry zone
console.log('\n🎯 ZONE CALCULATION SIMULATION:');
console.log('================================');

// Use the comma-including pattern (most likely)
const commaPattern = /(\d{1,3},?\d{3}\.?\d*)/g;
const commaMatches = [...ocrText.matchAll(commaPattern)];
const processedPrices = commaMatches
    .map(m => parseFloat(m[0].replace(/,/g, '')))
    .filter(p => p > 100) // Filter reasonable XAUUSD prices
    .sort((a, b) => a - b); // Sort ascending

console.log('All extracted prices:', processedPrices);

if (processedPrices.length >= 4) {
    // Zone calculation logic
    const priceCount = processedPrices.length;
    const startIdx = Math.floor(priceCount * 0.3);
    const endIdx = Math.floor(priceCount * 0.7);
    
    console.log(`Price count: ${priceCount}, startIdx: ${startIdx}, endIdx: ${endIdx}`);
    
    const greyZonePrices = processedPrices.slice(startIdx, endIdx);
    console.log('Grey zone prices:', greyZonePrices);
    
    if (greyZonePrices.length >= 2) {
        const greyMin = Math.min(...greyZonePrices);
        const greyMax = Math.max(...greyZonePrices);
        const medianPrice = greyZonePrices[Math.floor(greyZonePrices.length / 2)];
        
        console.log(`\n✅ GREY ZONE CALCULATION:`);
        console.log(`   Min: ${greyMin}`);
        console.log(`   Max: ${greyMax}`);
        console.log(`   Median: ${medianPrice}`);
        
        // Now the buggy "current price" logic
        const sortedDesc = processedPrices.sort((a, b) => b - a);
        const buggyCurrentPrice = sortedDesc[0];
        
        console.log(`\n🚨 BUGGY "CURRENT PRICE" LOGIC:`);
        console.log(`   All prices sorted desc: ${sortedDesc.join(', ')}`);
        console.log(`   Uses as "current": ${buggyCurrentPrice}`);
        
        // Entry zone creation logic
        const entryBuffer = (greyMax - greyMin) * 0.1;
        const tightEntryMin = Math.max(medianPrice - entryBuffer, greyMin);
        const tightEntryMax = Math.min(medianPrice + entryBuffer, greyMax);
        
        console.log(`\n📊 ENTRY ZONE CALCULATION:`);
        console.log(`   Buffer (10% of zone): ${entryBuffer}`);
        console.log(`   Tight entry min: ${tightEntryMin}`);
        console.log(`   Tight entry max: ${tightEntryMax}`);
        console.log(`   Average: ${(tightEntryMin + tightEntryMax) / 2}`);
        
        // Check if this gives us 3520
        const avgEntry = (tightEntryMin + tightEntryMax) / 2;
        console.log(`\n🔍 FINAL RESULT:`);
        console.log(`   Entry zone: ${tightEntryMin} - ${tightEntryMax}`);
        console.log(`   Average entry: ${avgEntry}`);
        
        if (Math.abs(avgEntry - 3520) < 50) {
            console.log(`   ✅ THIS COULD BE THE SOURCE OF 3520!`);
        } else {
            console.log(`   ❌ This doesn't match 3520`);
        }
    }
}

process.exit(0);
