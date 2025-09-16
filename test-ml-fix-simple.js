/**
 * Test the USDJPY ML filtering fix
 * Verify that chart scale artifacts (7, 2, 13) are rejected
 */

const { ChartColorAnalysisML } = require('./src/ml/colorAnalysisML.ts');

async function testUSGDJPYFiltering() {
  console.log('🧪 Testing USDJPY ML filtering fix...\n');

  // Simulate OCR text with chart scale artifacts
  const mockOCRText = `
    USDJPY Analysis
    Current levels:
    Entry: 7
    Stop: 2  
    Target: 13
    
    Some other text with:
    146.50
    147.25
    145.80
    148.00
  `;

  console.log('📝 Mock OCR Text:');
  console.log(mockOCRText);
  console.log('\n' + '='.repeat(50) + '\n');

  try {
    // Run the ML analysis
    const result = ChartColorAnalysisML.analyzeChartColors(mockOCRText, 'USDJPY');
    
    console.log('🎯 ML Analysis Result:');
    console.log('Grey Entry:', result.greyEntry);
    console.log('Green Targets:', result.greenTargets);
    console.log('Red Stops:', result.redStops);
    console.log('Recommendation:', result.recommendation);
    
    // Check if the fix worked
    const allPrices = [
      ...(result.greyEntry ? [result.greyEntry.min, result.greyEntry.max] : []),
      ...result.greenTargets,
      ...result.redStops
    ];
    
    console.log('\n📊 All extracted prices:', allPrices);
    
    // Validation
    const hasChartArtifacts = allPrices.some(price => price < 50);
    const hasReasonablePrices = allPrices.some(price => price >= 145 && price <= 150);
    
    console.log('\n✅ Validation Results:');
    console.log(`Chart artifacts (< 50): ${hasChartArtifacts ? '❌ FOUND' : '✅ NONE'}`);
    console.log(`Reasonable prices (145-150): ${hasReasonablePrices ? '✅ FOUND' : '❌ NONE'}`);
    
    if (!hasChartArtifacts && hasReasonablePrices) {
      console.log('\n🎉 SUCCESS: Fix is working! Chart scale artifacts rejected, reasonable prices extracted.');
    } else {
      console.log('\n❌ ISSUE: Fix may not be working properly.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testUSGDJPYFiltering();
