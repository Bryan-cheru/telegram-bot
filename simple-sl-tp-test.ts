// Simple Advanced Stop Loss & Take Profit Test
// File: simple-sl-tp-test.ts

import { AdvancedStopTakeManager } from './src/utils/advancedStopTakeManagement';
import { TradeSignal } from './src/types';

// Create a simple test without dependencies
console.log('🧪 Testing Advanced Stop Loss & Take Profit System\n');

// Test 1: Gold signal
const goldSignal: TradeSignal = {
  symbol: 'XAUUSD',
  action: 'BUY',
  entryZone: { min: 2650, max: 2655 },
  stopLoss: 2630, // Too risky
  targets: [2680, 2700, 2720]
};

const currentGoldPrice = 2652;
const goldLevels = AdvancedStopTakeManager.calculateOptimalLevels(
  goldSignal, 
  currentGoldPrice, 
  0.002 
);

console.log('🥇 GOLD (XAUUSD) Test Results:');
console.log(`   Current Price: $${currentGoldPrice}`);
console.log(`   Original SL: $${goldSignal.stopLoss} → Optimized: $${goldLevels.stopLoss}`);
console.log(`   Optimized TPs: [$${goldLevels.takeProfits.join(', $')}]`);
console.log(`   Risk:Reward Ratio: ${goldLevels.riskRewardRatio.toFixed(2)}:1`);
console.log(`   Confidence Score: ${goldLevels.confidence}%\n`);

// Test 2: EURUSD with missing stop loss
const eurSignal: TradeSignal = {
  symbol: 'EURUSD',
  action: 'SELL',
  entryZone: { min: 1.0850, max: 1.0860 },
  stopLoss: 0, // Missing
  targets: [1.0820]
};

const currentEurPrice = 1.0855;
const eurLevels = AdvancedStopTakeManager.calculateOptimalLevels(
  eurSignal, 
  currentEurPrice, 
  0.0008 
);

console.log('💶 EURUSD Test Results (Missing SL):');
console.log(`   Current Price: ${currentEurPrice}`);
console.log(`   Generated SL: ${eurLevels.stopLoss}`);
console.log(`   Optimized TPs: [${eurLevels.takeProfits.join(', ')}]`);
console.log(`   Risk:Reward Ratio: ${eurLevels.riskRewardRatio.toFixed(2)}:1`);
console.log(`   Confidence Score: ${eurLevels.confidence}%\n`);

// Test 3: Trailing stop
console.log('📈 Trailing Stop Test:');
const entryPrice = 1.0850;
const originalSL = 1.0820;
const currentProfitPrice = 1.0890; // 40 pips profit

const trailingStop = AdvancedStopTakeManager.calculateTrailingStop(
  currentProfitPrice,
  entryPrice, 
  originalSL,
  'BUY',
  0.0015 // 15 pips trail
);

console.log(`   Entry: ${entryPrice}, Original SL: ${originalSL}`);
console.log(`   Current: ${currentProfitPrice} (40 pips profit)`);
console.log(`   Trailing SL: ${trailingStop}\n`);

console.log('✅ Advanced SL/TP System Tests Complete!');
