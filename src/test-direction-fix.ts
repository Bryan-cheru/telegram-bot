import { ChartColorAnalysisML } from './ml/colorAnalysisML';

// Test EURAUD scenario: green target (1.7810) above grey entry (1.7780) 
const euraudText = `
EURAUD H4 Chart
Best buying area: 1.7780 - 1.7790
Green targets: 1.7810, 1.7820
Red stop: 1.7760
Support at 1.7780
1.7850 1.7840 1.7830 1.7820 1.7810 1.7800 1.7790 1.7780 1.7770 1.7760 1.7750
`;

console.log('🧪 Testing EURAUD direction detection...');
const result = ChartColorAnalysisML.analyzeChartColors(euraudText, 'EURAUD');

if (result && result.recommendation && result.recommendation.confidence !== undefined) {
  console.log(`Result: ${result.recommendation.action} (confidence: ${result.recommendation.confidence.toFixed(2)})`);
  console.log(`Reason: ${result.recommendation.reason}`);

  // Should be BUY since target (1.7810) is above entry (1.7780)
  if (result.recommendation.action === 'BUY') {
    console.log('✅ CORRECT: Direction detection fixed!');
  } else {
    console.log('❌ STILL WRONG: Direction detection needs more work');
  }
} else {
  console.log('❌ Analysis failed or returned invalid result');
  console.log('Result:', result);
}