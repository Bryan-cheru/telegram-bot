// Quick debug script to test signal format
const signal = {
  symbol: 'EURCAD',
  action: 'SELL',
  source: 'VISUAL_ML',
  confidence: 0.7,
  entryPrice: 1.6,
  entryZone: { 
    min: 1.6, 
    max: 1.615 
  },
  targets: [1.59, 1.585, 1.58],
  stopLoss: 1.62
};

console.log('🔍 Testing signal format:');
console.log('Signal:', JSON.stringify(signal, null, 2));
console.log('entryZone.min:', signal.entryZone?.min);
console.log('entryZone.max:', signal.entryZone?.max);
console.log('Has required properties:', {
  hasEntryZone: !!signal.entryZone,
  hasMin: signal.entryZone?.min !== undefined,
  hasMax: signal.entryZone?.max !== undefined,
  hasTargets: Array.isArray(signal.targets) && signal.targets.length > 0,
  hasStopLoss: signal.stopLoss !== undefined
});

// Test what the executor expects
const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
console.log('Calculated entry price:', entryPrice);

console.log('✅ Signal format looks correct!');
