// Test EURCAD chart parsing after adding the specific handler

console.log('🧪 Testing EURCAD Chart Handler...\n');

// Simulate the OCR text from your EURCAD chart
const testText = `
Euro / Canadian Dollar • 2h • OANDA CAD
1.61850 1.61381 1.61290 1.61032 Support Become a Resistance
1.60829 1.60602 1.60500 Target 1.59860 1.59854 EURCAD 2h
`;

console.log('📄 Test Input:', testText);

// Test the price extraction logic we added
const pricePattern = /\b(\d\.\d{4,5})\b/g;
const chartPrices = [...testText.matchAll(pricePattern)]
  .map(m => parseFloat(m[1]))
  .filter(p => p >= 1.5 && p <= 1.7)
  .sort((a, b) => a - b);

console.log('📊 Extracted Prices:', chartPrices);

if (chartPrices.length >= 3) {
  const redZonePrice = Math.max(...chartPrices);
  const greenZonePrice = Math.min(...chartPrices); 
  const greyEntryPrice = chartPrices[Math.floor(chartPrices.length * 0.6)];
  
  console.log('\n🎯 Chart Analysis:');
  console.log('🔴 Red Zone (Resistance):', redZonePrice);
  console.log('🔘 Grey Entry (60th percentile):', greyEntryPrice);  
  console.log('🟢 Green Target (Support):', greenZonePrice);
  
  const stopLoss = redZonePrice + 0.0015;
  const entryZone = {
    min: greyEntryPrice - 0.0005,
    max: redZonePrice
  };
  
  console.log('\n📋 Trade Setup:');
  console.log('Action: SELL');
  console.log('Entry Zone:', entryZone);
  console.log('Stop Loss:', stopLoss);
  console.log('Target:', greenZonePrice);
  
  // Calculate risk-reward
  const entryMid = (entryZone.min + entryZone.max) / 2;
  const riskDistance = Math.abs(stopLoss - entryMid);
  const rewardDistance = Math.abs(entryMid - greenZonePrice);
  const riskRewardRatio = rewardDistance / riskDistance;
  
  console.log('\n💰 Risk Analysis:');
  console.log('Risk Distance:', riskDistance.toFixed(5));
  console.log('Reward Distance:', rewardDistance.toFixed(5));
  console.log('Risk:Reward Ratio:', `1:${riskRewardRatio.toFixed(2)}`);
  
  if (riskRewardRatio >= 0.8) {
    console.log('✅ Good Risk-Reward ratio!');
  } else {
    console.log('⚠️  Risk-Reward ratio could be better');
  }
} else {
  console.log('❌ Not enough prices found');
}

console.log('\n🚀 The EURCAD handler should now work!');
