// Test the Gold trading signal parsing
const { RealWorldTradeParser } = require('./src/ocr/realWorldTradeParser');
const { EnhancedRiskManager } = require('./src/utils/enhancedRiskManager');
const { OCRFallbackSystem } = require('./src/ocr/ocrFallbackSystem');

async function testGoldSignal() {
  console.log('🧪 Testing Gold Signal Processing...\n');
  
  const signalText = `#XAUUSD Second Scenario 📊🔥

Gold recently faced resistance around 3592 – 3596 (Selling Area). After a strong bullish rally, price has entered an overbought zone and is showing rejection candles.

From this zone, selling pressure is expected with targets:
🎯 Target 1: 3578
🏹 Target 2: 3562
⛔️ Stop Loss: 3604

Reason for Selling:`;

  console.log('📝 Signal Text:');
  console.log(signalText);
  console.log('\n' + '='.repeat(60));
  
  try {
    // Test the parser directly
    console.log('\n🔍 Step 1: Testing RealWorldTradeParser...');
    const parser = new RealWorldTradeParser();
    const signal = await parser.parseSignal(signalText);
    
    if (signal) {
      console.log('✅ Signal parsed successfully!');
      console.log('📊 Parsed Signal Details:');
      console.log(`   Symbol: ${signal.symbol}`);
      console.log(`   Action: ${signal.action}`);
      console.log(`   Entry Zone: ${signal.entryZone?.min} - ${signal.entryZone?.max}`);
      console.log(`   Stop Loss: ${signal.stopLoss}`);
      console.log(`   Targets: ${signal.targets?.join(', ')}`);
      console.log(`   Confidence: ${signal.confidence}`);
      
      // Test risk management
      console.log('\n🛡️ Step 2: Testing Enhanced Risk Management...');
      const riskManager = EnhancedRiskManager.getInstance();
      const accountBalance = 10000; // $10k test balance
      
      const riskAssessment = riskManager.assessTradeRisk(signal, accountBalance);
      
      console.log('📈 Risk Assessment Results:');
      console.log(`   Can Trade: ${riskAssessment.canTrade ? '✅ YES' : '❌ NO'}`);
      console.log(`   Risk Level: ${riskAssessment.riskLevel}`);
      console.log(`   Adjusted Risk: ${riskAssessment.adjustedRiskPercentage.toFixed(2)}%`);
      console.log(`   Position Size: ${riskAssessment.adjustedPositionSize} lots`);
      console.log(`   Adjustments: ${riskAssessment.reasonsForAdjustment.length}`);
      console.log(`   Fallbacks Used: ${riskAssessment.fallbacksUsed.length}`);
      
      if (riskAssessment.reasonsForAdjustment.length > 0) {
        console.log('\n📋 Risk Adjustments:');
        riskAssessment.reasonsForAdjustment.forEach((reason, i) => {
          console.log(`   ${i + 1}. ${reason}`);
        });
      }
      
      if (riskAssessment.fallbacksUsed.length > 0) {
        console.log('\n🔄 Fallbacks Applied:');
        riskAssessment.fallbacksUsed.forEach((fallback, i) => {
          console.log(`   ${i + 1}. ${fallback}`);
        });
      }
      
      console.log('\n🎯 Final Trade Parameters:');
      console.log(`   Symbol: ${signal.symbol}`);
      console.log(`   Action: ${signal.action}`);
      console.log(`   Entry: ${signal.entryZone?.min} - ${signal.entryZone?.max}`);
      console.log(`   Volume: ${riskAssessment.adjustedPositionSize} lots`);
      console.log(`   Risk: ${riskAssessment.adjustedRiskPercentage.toFixed(2)}%`);
      console.log(`   Stop Loss: ${signal.stopLoss}`);
      console.log(`   Target 1: ${signal.targets?.[0]}`);
      console.log(`   Target 2: ${signal.targets?.[1]}`);
      
    } else {
      console.log('❌ Signal parsing failed');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Test completed!');
}

testGoldSignal();
