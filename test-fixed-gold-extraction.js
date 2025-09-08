// Test the fixed Gold target extraction
const fs = require('fs');
const path = require('path');

async function testFixedExtraction() {
  console.log('🧪 TESTING FIXED GOLD TARGET EXTRACTION');
  console.log('======================================');

  // Import the fixed class
  const { VisualChartAnalysisML } = await import('./src/ml/visualChartAnalysisML.js');
  const analyzer = new VisualChartAnalysisML();
  
  const testOCR = `Gold Spot / U.S. Dollar - 30 - Phillip Nova = uso ~
Stop Loss (3604) en rn
| i ~~ selling Area: (3592 - 3596)
ik ) 3,590.000
[ I Target 1 Eee
I | 3,570.000
J |
i Hed Target2 | ili
fF Pid Cu 3,540.000
| | JET ...`;

  console.log('📄 Test OCR Text:');
  console.log(testOCR);
  
  console.log('\n🔍 Testing price extraction...');
  
  // Call the private method via reflection
  const prices = analyzer.extractPricesFromText(testOCR);
  
  console.log('\n📊 EXTRACTED PRICES:');
  console.log('Raw prices:', prices);
  
  const goldPrices = prices.filter(p => p >= 3000 && p <= 4000);
  console.log('Gold prices (3000-4000):', goldPrices);
  
  const expectedTargets = [3590, 3570, 3540];
  const foundTargets = expectedTargets.filter(target => goldPrices.includes(target));
  
  console.log('\n✅ VERIFICATION:');
  console.log('Expected targets:', expectedTargets);
  console.log('Found targets:', foundTargets);
  console.log(`Success rate: ${foundTargets.length}/${expectedTargets.length} (${((foundTargets.length/expectedTargets.length)*100).toFixed(0)}%)`);
  
  if (foundTargets.length === expectedTargets.length) {
    console.log('🎉 FIX SUCCESSFUL! All Gold targets extracted correctly.');
  } else {
    console.log('❌ Fix incomplete. Some targets still missing.');
  }
}

testFixedExtraction().catch(console.error);
