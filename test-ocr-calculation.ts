import { SmartMLRouter } from './src/ml/core/SmartMLRouter';

console.log('🧪 TESTING OCR-BASED SL/TP CALCULATION\n');
console.log('============================================================\n');

// Simulate what happens when OCR detects a signal
const testCases = [
  {
    name: 'XAUUSD SELL at 4130',
    symbol: 'XAUUSD',
    direction: 'SELL',
    entryZone: { min: 4130, max: 4130 }
  },
  {
    name: 'XAUUSD BUY at 3600',
    symbol: 'XAUUSD',
    direction: 'BUY',
    entryZone: { min: 3600, max: 3600 }
  },
  {
    name: 'XAGUSD BUY at 50.9207',
    symbol: 'XAGUSD',
    direction: 'BUY',
    entryZone: { min: 50.9207, max: 50.9207 }
  }
];

testCases.forEach(test => {
  console.log(`📝 Test: ${test.name}`);
  console.log('------------------------------------------------------------');
  
  // Access private methods using any type cast (for testing only)
  const router = SmartMLRouter as any;
  
  const stopLoss = router.calculateStopLoss(test.entryZone, test.direction, test.symbol);
  const targets = router.calculateTargets(test.entryZone, test.direction, test.symbol);
  
  const avgEntry = (test.entryZone.min + test.entryZone.max) / 2;
  const slDistance = Math.abs(avgEntry - stopLoss);
  const tpDistance = Math.abs(avgEntry - targets[0]);
  
  console.log(`\n✅ Results:`);
  console.log(`   Entry: ${avgEntry}`);
  console.log(`   Stop Loss: ${stopLoss.toFixed(5)}`);
  console.log(`   Take Profit: ${targets[0].toFixed(5)}`);
  console.log(`   SL Distance: ${slDistance.toFixed(5)}`);
  console.log(`   TP Distance: ${tpDistance.toFixed(5)}`);
  console.log(`   RR Ratio: 1:${(tpDistance / slDistance).toFixed(2)}`);
  console.log('\n');
});

console.log('============================================================');
console.log('✅ Testing complete!\n');
