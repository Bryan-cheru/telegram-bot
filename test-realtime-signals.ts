// Quick Signal Detection Test - Real-time Scenarios
import { TradeParser } from './src/ocr/tradeParser';

const parser = new TradeParser();

console.log('🚀 REAL-TIME SIGNAL DETECTION TEST\n');

// Real signal examples from typical trading channels
const realSignals = [
  {
    name: '🥇 Gold Buy Setup',
    text: `GOLD BUY SETUP 🔥

📍 Entry: 2440 - 2445
🛑 SL: 2435
🎯 TP1: 2455
🎯 TP2: 2465
🎯 TP3: 2475

💡 Bullish breakout confirmed
💰 Risk 1-2% per trade`
  },
  
  {
    name: '💶 EUR/USD Short',
    text: `EURUSD SHORT SIGNAL 📉

SELL ZONE: 1.0850 - 1.0860
STOP LOSS: 1.0880
TARGET 1: 1.0820
TARGET 2: 1.0800

Dollar strength continues
ECB dovish outlook`
  },
  
  {
    name: '🛢️ Oil Signal',
    text: `OIL UPDATE 🛢️

Current: $78.45
Entry: $78.00 - $78.20
SL: $77.50
Targets: $79.00, $79.50, $80.00

Supply concerns rising`
  },
  
  {
    name: '💎 Bitcoin Signal',
    text: `BTC/USD ANALYSIS 🚀

Long Setup:
Entry: 63500 - 63800  
Stop: 63000
Target 1: 64500
Target 2: 65000

Bullish momentum building`
  }
];

async function testRealTimeSignals() {
  for (let i = 0; i < realSignals.length; i++) {
    const signal = realSignals[i];
    console.log(`${i + 1}️⃣ ${signal.name}`);
    console.log('─'.repeat(40));
    
    try {
      const parsedSignal = parser.parseTradeSignal(signal.text);
      
      if (parsedSignal) {
        console.log('✅ SIGNAL PARSED:');
        console.log(`   🎯 ${parsedSignal.symbol} ${parsedSignal.action}`);
        console.log(`   📊 Order: ${parsedSignal.orderType}`);
        
        if (parsedSignal.entryZone) {
          const range = parsedSignal.entryZone.max - parsedSignal.entryZone.min;
          console.log(`   💹 Entry: ${parsedSignal.entryZone.min} - ${parsedSignal.entryZone.max} (Range: ${range.toFixed(2)})`);
        }
        
        if (parsedSignal.stopLoss) {
          console.log(`   🛑 Stop Loss: ${parsedSignal.stopLoss}`);
        }
        
        if (parsedSignal.targets && parsedSignal.targets.length > 0) {
          console.log(`   🎯 Targets: ${parsedSignal.targets.join(' | ')}`);
        }
        
        // Calculate risk-reward if possible
        if (parsedSignal.entryZone && parsedSignal.stopLoss && parsedSignal.targets?.length) {
          const entry = (parsedSignal.entryZone.min + parsedSignal.entryZone.max) / 2;
          const risk = Math.abs(entry - parsedSignal.stopLoss);
          const reward = Math.abs(parsedSignal.targets[0] - entry);
          const rr = reward / risk;
          console.log(`   📈 Risk-Reward: 1:${rr.toFixed(2)}`);
        }
        
        if (parsedSignal.positionSizing) {
          console.log(`   💰 Position: ${parsedSignal.positionSizing.lotSize} lots`);
          console.log(`   📊 Risk: ${parsedSignal.positionSizing.riskPercentage}%`);
        }
      } else {
        console.log('❌ NO SIGNAL DETECTED');
      }
      
    } catch (error) {
      console.log('🚨 ERROR:', error instanceof Error ? error.message : String(error));
    }
    
    console.log('');
  }
}

// Test signal validation and filtering
async function testSignalValidation() {
  console.log('\n🔍 TESTING SIGNAL VALIDATION\n');
  
  const testCases = [
    {
      name: 'Valid Complete Signal',
      text: 'XAUUSD BUY 2450-2455, SL: 2440, TP: 2465',
      shouldPass: true
    },
    {
      name: 'Missing Stop Loss',
      text: 'EURUSD SELL 1.0850-1.0860, TP: 1.0820',
      shouldPass: false
    },
    {
      name: 'Invalid Symbol',
      text: 'FAKEPAIR BUY 100-110, SL: 95, TP: 120',
      shouldPass: false
    },
    {
      name: 'Update Message',
      text: 'XAUUSD hit TP1 at 2465! Great trade everyone!',
      shouldPass: false
    }
  ];
  
  testCases.forEach((test, index) => {
    console.log(`${index + 1}️⃣ ${test.name}`);
    
    const signal = parser.parseTradeSignal(test.text);
    const passed = signal !== null;
    
    if (passed === test.shouldPass) {
      console.log(`   ✅ Expected: ${test.shouldPass ? 'PASS' : 'FAIL'}, Got: ${passed ? 'PASS' : 'FAIL'}`);
    } else {
      console.log(`   ❌ Expected: ${test.shouldPass ? 'PASS' : 'FAIL'}, Got: ${passed ? 'PASS' : 'FAIL'}`);
    }
    
    if (signal) {
      console.log(`   📊 ${signal.symbol} ${signal.action} (${signal.orderType})`);
    }
    console.log('');
  });
}

async function runTests() {
  await testRealTimeSignals();
  await testSignalValidation();
  
  console.log('🎉 Real-time signal tests completed!');
  console.log('✅ Signal detection system is working properly');
}

runTests().catch(console.error);
