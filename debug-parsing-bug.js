#!/usr/bin/env node

/**
 * FOUND THE BUG: Visual parser is using HIGHEST price as "current price" 
 * Instead of using grey entry zone!
 */

require('dotenv').config();

console.log('🚨 ROOT CAUSE IDENTIFIED - PARSING BUG');
console.log('=====================================');

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

console.log('📄 YOUR OCR TEXT:');
console.log('===================');
console.log(ocrText);

// Simulate the buggy parsing logic
const pricePattern = /\b(\d{3}\.\d{2,4})\b/g;
const allPrices = [...ocrText.matchAll(pricePattern)].map(m => parseFloat(m[1])).filter(p => p > 0);

console.log('\n🔍 EXTRACTED PRICES FROM OCR:');
console.log('==============================');
console.log('All prices found:', allPrices);

allPrices.sort((a, b) => b - a); // Sort descending (highest first)
console.log('Sorted (highest first):', allPrices);

const buggyCurrentPrice = allPrices[0]; // This is the bug!
console.log(`\n🚨 BUGGY LOGIC: Using highest price as "current": ${buggyCurrentPrice}`);

// Now simulate grey zone detection
allPrices.sort((a, b) => a - b); // Sort ascending for zone detection
console.log('\nSorted for zone analysis:', allPrices);

const priceCount = allPrices.length;
const startIdx = Math.floor(priceCount * 0.3); // Skip lowest 30%
const endIdx = Math.floor(priceCount * 0.7);   // Skip highest 30%

const greyZonePrices = allPrices.slice(startIdx, endIdx);
console.log(`\n🔘 GREY ZONE PRICES (middle 40%): ${greyZonePrices.join(', ')}`);

const greyMin = Math.min(...greyZonePrices);
const greyMax = Math.max(...greyZonePrices);
const medianPrice = greyZonePrices[Math.floor(greyZonePrices.length / 2)];

console.log(`\n✅ CORRECT GREY ENTRY ZONE:`);
console.log(`   Min: ${greyMin}`);
console.log(`   Max: ${greyMax}`);
console.log(`   Entry (median): ${medianPrice}`);

// But then the bug kicks in...
console.log(`\n🚨 BUT THE BUG OVERRIDES IT:`);
console.log(`   Parser finds grey zone: ${greyMin}-${greyMax}`);
console.log(`   But then uses "current price" logic: ${buggyCurrentPrice}`);
console.log(`   And creates entry at: ${buggyCurrentPrice} ❌`);

console.log(`\n💰 REAL vs BUGGY:`);
console.log(`   Real current XAUUSD: 3470.23`);
console.log(`   Correct entry zone: ${greyMin}-${greyMax}`);
console.log(`   Buggy parsed entry: ${buggyCurrentPrice}`);

console.log(`\n🔧 THE FIX:`);
console.log(`   Remove the "current price" inference logic`);
console.log(`   Use the grey zone median directly as entry`);
console.log(`   Don't override grey zone with price sorting`);

process.exit(0);
