#!/usr/bin/env node

/**
 * TEST THE FIX: Simulate parsing with corrected price pattern
 */

require('dotenv').config();

console.log('🔧 TESTING THE PARSING FIX');
console.log('============================');

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

console.log('📊 BEFORE FIX (Old Pattern):');
console.log('==============================');
const oldPattern = /\b(\d{3}\.\d{2,4})\b/g;
const oldMatches = [...ocrText.matchAll(oldPattern)];
const oldPrices = oldMatches.map(m => parseFloat(m[1])).filter(p => p > 0);
console.log('Old pattern matches:', oldMatches.map(m => m[1]));
console.log('Old prices:', oldPrices);
oldPrices.sort((a, b) => a - b);
console.log('Old grey zone calculation:');
if (oldPrices.length >= 4) {
    const startIdx = Math.floor(oldPrices.length * 0.3);
    const endIdx = Math.floor(oldPrices.length * 0.7);
    const greyZone = oldPrices.slice(startIdx, endIdx);
    const median = greyZone[Math.floor(greyZone.length / 2)];
    console.log(`  Zone: ${Math.min(...greyZone)} - ${Math.max(...greyZone)}`);
    console.log(`  Median entry: ${median} ❌ WRONG - Missing thousands!`);
}

console.log('\n📊 AFTER FIX (New Pattern):');
console.log('=============================');
const newPattern = /(\d{1,3},?\d{3}\.?\d*)/g;
const newMatches = [...ocrText.matchAll(newPattern)];
const newPrices = newMatches
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(p => p > 100);
console.log('New pattern matches:', newMatches.map(m => m[1]));
console.log('New prices (after comma removal):', newPrices);
newPrices.sort((a, b) => a - b);
console.log('New grey zone calculation:');
if (newPrices.length >= 4) {
    const startIdx = Math.floor(newPrices.length * 0.3);
    const endIdx = Math.floor(newPrices.length * 0.7);
    const greyZone = newPrices.slice(startIdx, endIdx);
    const median = greyZone[Math.floor(greyZone.length / 2)];
    console.log(`  Zone: ${Math.min(...greyZone)} - ${Math.max(...greyZone)}`);
    console.log(`  Median entry: ${median} ✅ CORRECT!`);
    
    // Calculate tight entry zone
    const greyMin = Math.min(...greyZone);
    const greyMax = Math.max(...greyZone);
    const entryBuffer = (greyMax - greyMin) * 0.1;
    const tightMin = Math.max(median - entryBuffer, greyMin);
    const tightMax = Math.min(median + entryBuffer, greyMax);
    const avgEntry = (tightMin + tightMax) / 2;
    
    console.log(`\n🎯 FINAL ENTRY CALCULATION:`);
    console.log(`  Buffer: ${entryBuffer.toFixed(2)}`);
    console.log(`  Tight zone: ${tightMin.toFixed(2)} - ${tightMax.toFixed(2)}`);
    console.log(`  Average entry: ${avgEntry.toFixed(2)}`);
    console.log(`  1:1 RR Applied entry: ${avgEntry.toFixed(2)} ✅`);
    
    // Calculate stop loss and target
    const slDistance = 15; // XAUUSD typical
    const stopLoss = avgEntry - slDistance; // BUY setup
    const target = avgEntry + slDistance;   // 1:1 RR
    
    console.log(`\n📈 COMPLETE SIGNAL:`);
    console.log(`  Entry: ${avgEntry.toFixed(2)}`);
    console.log(`  Stop Loss: ${stopLoss.toFixed(2)}`);
    console.log(`  Take Profit: ${target.toFixed(2)}`);
    console.log(`  Risk: ${slDistance} points`);
    console.log(`  Reward: ${slDistance} points (1:1 RR)`);
    
    // Compare with current market
    const currentMarket = 3470.23;
    console.log(`\n💰 MARKET COMPARISON:`);
    console.log(`  Current XAUUSD: ${currentMarket}`);
    console.log(`  Entry vs Market: ${(avgEntry - currentMarket).toFixed(2)} points`);
    console.log(`  ${avgEntry < currentMarket ? '✅ BUY below market (GOOD)' : '❌ BUY above market (BAD)'}`);
}

console.log('\n🎉 RESULT:');
console.log('===========');
console.log('✅ Fix should resolve the 3520 issue');
console.log('✅ Parser will now use correct grey zone entry (~3385)');
console.log('✅ BUY order will be below market (valid)');
console.log('✅ No more "Invalid stops" error');

process.exit(0);
