// Enhanced Stop Loss & Take Profit Testing
// File: test-advanced-sl-tp.ts

import { AdvancedStopTakeManager } from './src/utils/advancedStopTakeManagement';
import { TradeSignal } from './src/types';

async function testAdvancedStopTakeSystem() {
  console.log('🧪 Testing Advanced Stop Loss & Take Profit System\n');

  // Test 1: Gold (XAUUSD) signal with visual data
  const goldSignal: TradeSignal = {
    symbol: 'XAUUSD',
    action: 'BUY',
    entryZone: { min: 2650, max: 2655 },
    stopLoss: 2630, // Too risky - should be adjusted
    targets: [2680, 2700, 2720]
  };

  const currentGoldPrice = 2652;
  const goldLevels = AdvancedStopTakeManager.calculateOptimalLevels(
    goldSignal, 
    currentGoldPrice, 
    0.002 // 0.2% volatility
  );

  console.log('🥇 GOLD (XAUUSD) Test:');
  console.log(`   Current Price: ${currentGoldPrice}`);
  console.log(`   Original SL: ${goldSignal.stopLoss} -> Optimized: ${goldLevels.stopLoss}`);
  console.log(`   Original TPs: [${goldSignal.targets?.join(', ')}]`);
  console.log(`   Optimized TPs: [${goldLevels.takeProfits.join(', ')}]`);
  console.log(`   Risk:Reward: ${goldLevels.riskRewardRatio.toFixed(2)}:1`);
  console.log(`   Confidence: ${goldLevels.confidence}%\n`);

  // Test 2: EUR/USD signal without stop loss
  const eurSignal: TradeSignal = {
    symbol: 'EURUSD',
    action: 'SELL',
    entryZone: { min: 1.0850, max: 1.0860 },
    stopLoss: 0, // Missing - should be generated
    targets: [1.0820]
  };

  const currentEurPrice = 1.0855;
  const eurLevels = AdvancedStopTakeManager.calculateOptimalLevels(
    eurSignal, 
    currentEurPrice, 
    0.0008 // 8 pips volatility
  );

  console.log('💶 EURUSD Test (Missing SL):');
  console.log(`   Current Price: ${currentEurPrice}`);
  console.log(`   Original SL: undefined -> Generated: ${eurLevels.stopLoss}`);
  console.log(`   Original TPs: [${eurSignal.targets?.join(', ')}]`);
  console.log(`   Optimized TPs: [${eurLevels.takeProfits.join(', ')}]`);
  console.log(`   Risk:Reward: ${eurLevels.riskRewardRatio.toFixed(2)}:1`);
  console.log(`   Confidence: ${eurLevels.confidence}%\n`);

  // Test 3: Silver signal with extreme levels
  const silverSignal: TradeSignal = {
    symbol: 'XAGUSD',
    action: 'BUY',
    entryZone: { min: 30.50, max: 30.60 },
    stopLoss: 25.00, // Too far - should be adjusted  
    targets: [35.00] // Good target
  };

  const currentSilverPrice = 30.55;
  const silverLevels = AdvancedStopTakeManager.calculateOptimalLevels(
    silverSignal, 
    currentSilverPrice, 
    0.003 // 0.3% volatility
  );

  console.log('🥈 SILVER (XAGUSD) Test (Extreme SL):');
  console.log(`   Current Price: ${currentSilverPrice}`);
  console.log(`   Original SL: ${silverSignal.stopLoss} -> Adjusted: ${silverLevels.stopLoss}`);
  console.log(`   Original TPs: [${silverSignal.targets?.join(', ')}]`);
  console.log(`   Optimized TPs: [${silverLevels.takeProfits.join(', ')}]`);
  console.log(`   Risk:Reward: ${silverLevels.riskRewardRatio.toFixed(2)}:1`);
  console.log(`   Confidence: ${silverLevels.confidence}%\n`);

  // Test 4: Trailing stop calculation
  console.log('📈 Trailing Stop Loss Test:');
  const entryPrice = 1.0850;
  const originalSL = 1.0820;
  const currentProfitPrice = 1.0890; // In 40 pips profit

  const trailingStop = AdvancedStopTakeManager.calculateTrailingStop(
    currentProfitPrice,
    entryPrice, 
    originalSL,
    'BUY',
    0.0015 // 15 pips trail distance
  );

  console.log(`   Entry: ${entryPrice}, Original SL: ${originalSL}`);
  console.log(`   Current Price: ${currentProfitPrice} (40 pips profit)`);
  console.log(`   Trailing SL: ${trailingStop}\n`);

  console.log('✅ Advanced Stop Loss & Take Profit System Tests Complete!');
}

// Run the test
testAdvancedStopTakeSystem().catch(console.error);
