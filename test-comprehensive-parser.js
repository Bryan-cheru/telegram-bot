#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST - Real World Parser Integration
 */

require('dotenv').config();

console.log('🎯 COMPREHENSIVE REAL-WORLD PARSER TEST');
console.log('=======================================');

// Test the built JavaScript version
try {
  const { RealWorldTradeParser } = require('./dist/ocr/realWorldTradeParser');
  
  console.log('✅ Successfully imported RealWorldTradeParser from dist/');
  
  // Your actual signal
  const realSignal = `#XAUUSD (Update)...!! 🔼

Gold is approaching the highlighted demand zone (3526 – 3521). This area is marked as an instant buy zone where price may take support and push higher towards the targets. However, this is a scalping setup and carries some risk, so proper money management and strict stop loss are highly recommended. Trade safe and with discipline..!! ⚡️`;

  console.log('\n📨 Testing with your actual signal:');
  console.log(realSignal);
  console.log('\n' + '='.repeat(50) + '\n');

  const parser = new RealWorldTradeParser();
  const parsedSignal = parser.parseTradeSignal(realSignal);
  
  if (parsedSignal) {
    console.log('✅ SIGNAL SUCCESSFULLY PARSED:');
    console.log('===============================');
    console.log(`🎯 Symbol: ${parsedSignal.symbol}`);
    console.log(`📈 Action: ${parsedSignal.action}`);
    console.log(`🎪 Entry Zone: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max}`);
    console.log(`🛑 Stop Loss: ${parsedSignal.stopLoss}`);
    console.log(`🎯 Targets: ${parsedSignal.targets.join(', ')}`);
    console.log(`📋 Order Type: ${parsedSignal.orderType}`);
    console.log(`💡 Reason: ${parsedSignal.reason}`);
    
    // Test validation
    const isValid = parser.validateTradeSignal(parsedSignal);
    console.log(`\n✅ Signal Validation: ${isValid ? 'PASSED' : 'FAILED'}`);
    
    if (isValid) {
      console.log('\n🚀 READY FOR LIVE TRADING!');
      console.log('✅ This signal would be executed by your bot');
      console.log('✅ All validation checks passed');
      console.log('✅ Risk management levels calculated');
      
      // Show calculated levels
      const entryMid = (parsedSignal.entryZone.min + parsedSignal.entryZone.max) / 2;
      const riskDistance = Math.abs(entryMid - parsedSignal.stopLoss);
      const rewardDistance = Math.abs(parsedSignal.targets[0] - entryMid);
      const rrRatio = (rewardDistance / riskDistance).toFixed(2);
      
      console.log('\n📊 RISK ANALYSIS:');
      console.log(`   Entry Mid-Point: ${entryMid}`);
      console.log(`   Risk Distance: ${riskDistance.toFixed(2)} points`);
      console.log(`   Reward Distance: ${rewardDistance.toFixed(2)} points`);
      console.log(`   Risk:Reward Ratio: 1:${rrRatio}`);
      
    } else {
      console.log('\n❌ VALIDATION FAILED');
      console.log('Signal would NOT be executed');
    }
    
  } else {
    console.log('❌ FAILED TO PARSE SIGNAL');
    console.log('Parser could not extract trading information');
  }
  
} catch (error) {
  console.log('❌ ERROR:', error.message);
  console.log('\nPossible issues:');
  console.log('1. Build failed - run "npm run build" first');
  console.log('2. Missing dependencies - run "npm install"');
  console.log('3. TypeScript compilation errors');
}

console.log('\n' + '='.repeat(50));

// Test additional signal formats
console.log('🎯 Testing Additional Signal Formats...\n');

const additionalSignals = [
  {
    name: 'EURUSD Sell Signal',
    text: `#EURUSD 🔽 Sell Setup: Price approaching supply zone (1.0850 - 1.0875) This is a high probability sell zone. Watch for rejection.`
  },
  {
    name: 'GBPUSD Buy Signal', 
    text: `#GBPUSD Update!! Buy zone activated: (1.2650 - 1.2680) Bullish momentum building. Target higher levels.`
  },
  {
    name: 'Gold Instant Signal',
    text: `#XAUUSD instant buy zone (3545 - 3550) ⚡ Quick scalp opportunity. Tight stops required!`
  }
];

try {
  const { RealWorldTradeParser } = require('./dist/ocr/realWorldTradeParser');
  
  additionalSignals.forEach((test, index) => {
    console.log(`📨 ${test.name}:`);
    console.log(test.text);
    
    try {
      const parser = new RealWorldTradeParser();
      const parsed = parser.parseTradeSignal(test.text);
      
      if (parsed && parser.validateTradeSignal(parsed)) {
        console.log(`✅ VALID - ${parsed.symbol} ${parsed.action} (${parsed.entryZone.min}-${parsed.entryZone.max})`);
      } else {
        console.log(`❌ INVALID or failed to parse`);
      }
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
    }
    
    console.log('');
  });
  
} catch (error) {
  console.log('❌ Additional tests skipped due to import error');
}

console.log('🎯 Comprehensive testing complete!');
console.log('\n🚀 NEXT STEPS:');
console.log('1. Your bot now uses the clean RealWorldTradeParser');
console.log('2. Test with actual Telegram messages');
console.log('3. Monitor parsing accuracy');
console.log('4. Clean up the old bloated files when ready');
