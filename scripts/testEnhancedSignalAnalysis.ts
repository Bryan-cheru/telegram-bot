/**
 * Test Enhanced Signal Analysis with Real Example
 * Tests the AI analysis on the XAUUSD signal format provided by the user
 */

import { EnhancedSignalParser } from '../src/services/EnhancedSignalParser';
import { SignalIntelligenceService } from '../src/services/SignalIntelligenceService';

// Your actual XAUUSD signal
const xauusdSignal = `
#XAUUSD (Updates)...!!
On the GOLD (30m) chart, the overall market structure remains bullish. Price is retracing into the highlighted Good Buying Area (3864 – 3854) after a strong impulsive move with multiple Break of Structures (BOS).

🔺Buying Reason:

- Market structure is bullish
- Strong demand zone at 3864 – 3854
- High probability for price to target the weak high (3905) and Final Target (3924) ✔️

This is a safe and high-probability buying setup.
`;

async function testEnhancedSignalAnalysis() {
  console.log('🔥 TESTING ENHANCED AI SIGNAL ANALYSIS');
  console.log('=====================================');
  console.log('📋 Original Signal:');
  console.log(xauusdSignal);
  console.log('\n🤖 AI ANALYSIS BREAKDOWN:\n');

  try {
    // Step 1: Parse the signal using enhanced parser
    console.log('📝 STEP 1: Enhanced Signal Parsing');
    console.log('----------------------------------');
    
    const parsedSignal = EnhancedSignalParser.parseEnhancedSignal(xauusdSignal);
    
    if (!parsedSignal) {
      console.log('❌ Failed to parse signal');
      return;
    }

    console.log(`✅ Symbol: ${parsedSignal.symbol}`);
    console.log(`✅ Action: ${parsedSignal.action}`);
    console.log(`✅ Entry Zone: ${parsedSignal.entryZone?.min} - ${parsedSignal.entryZone?.max}`);
    console.log(`✅ Targets: ${parsedSignal.targets.join(', ')}`);
    console.log(`✅ Stop Loss: ${parsedSignal.stopLoss || 'Not specified'}`);
    console.log(`✅ Timeframe: ${parsedSignal.timeframe || 'Detected: 30m'}`);
    console.log(`✅ Confidence: ${parsedSignal.confidence}%`);
    console.log(`✅ Reasoning Points:`);
    parsedSignal.reasoning.forEach((reason, i) => {
      console.log(`   ${i + 1}. ${reason}`);
    });
    console.log(`✅ Market Context: ${parsedSignal.marketContext}`);

    // Step 2: Convert to TradeSignal format
    console.log('\n🔄 STEP 2: Converting to AI Analysis Format');
    console.log('-------------------------------------------');
    
    const tradeSignal = EnhancedSignalParser.toTradeSignal(parsedSignal);
    console.log('✅ Converted to TradeSignal format for AI analysis');

    // Step 3: AI Intelligence Analysis
    console.log('\n🧠 STEP 3: AI Intelligence Analysis');
    console.log('-----------------------------------');
    
    const intelligenceService = SignalIntelligenceService.getInstance();
    await intelligenceService.initialize();
    
    const aiAnalysis = await intelligenceService.analyzeSignal(tradeSignal, 'demo_channel');

    // Display AI Results
    console.log('\n🎯 AI ANALYSIS RESULTS:');
    console.log('=======================');
    console.log(`🏆 Overall Score: ${aiAnalysis.score.overall}/100`);
    console.log(`📊 Technical Score: ${aiAnalysis.score.technical}/100`);
    console.log(`📈 Sentiment Score: ${aiAnalysis.score.sentiment}/100`);
    console.log(`📋 Historical Score: ${aiAnalysis.score.historical}/100`);
    console.log(`🛡️  Risk Score: ${aiAnalysis.score.risk}/100`);
    console.log(`🎯 AI Confidence: ${aiAnalysis.score.confidence}/100`);
    console.log(`\n🤖 Recommendation: ${aiAnalysis.recommendation}`);
    
    console.log('\n💡 AI Insights:');
    aiAnalysis.aiInsights.forEach((insight, i) => {
      console.log(`   ${i + 1}. ${insight}`);
    });

    console.log('\n📊 Market Context:');
    console.log(`   Trend: ${aiAnalysis.marketContext.trend}`);
    console.log(`   Volatility: ${aiAnalysis.marketContext.volatility}`);
    console.log(`   Volume: ${aiAnalysis.marketContext.volume}`);
    console.log(`   Support: ${aiAnalysis.marketContext.support}`);
    console.log(`   Resistance: ${aiAnalysis.marketContext.resistance}`);

    console.log('\n⚠️  Risk Factors:');
    if (aiAnalysis.riskFactors.length === 0) {
      console.log('   ✅ No major risk factors identified');
    } else {
      aiAnalysis.riskFactors.forEach((risk, i) => {
        console.log(`   ${i + 1}. ${risk}`);
      });
    }

    console.log('\n🎯 Expected Outcome:');
    console.log(`   Success Probability: ${aiAnalysis.expectedOutcome.successProbability}%`);
    console.log(`   Expected Return: ${aiAnalysis.expectedOutcome.expectedReturn}%`);
    console.log(`   Best Case: ${aiAnalysis.expectedOutcome.bestCase}%`);
    console.log(`   Worst Case: ${aiAnalysis.expectedOutcome.worstCase}%`);

    console.log('\n🔍 Score Reasoning:');
    aiAnalysis.score.reasons.forEach((reason, i) => {
      console.log(`   ${i + 1}. ${reason}`);
    });

    // Step 4: Trading Decision
    console.log('\n💼 STEP 4: AI Trading Decision');
    console.log('------------------------------');
    
    if (aiAnalysis.score.overall >= 70) {
      console.log('✅ AI RECOMMENDS: EXECUTE TRADE');
      console.log('   Reasoning: High-quality signal with good confluence');
      if (aiAnalysis.score.overall >= 80) {
        console.log('   🚀 Consider increasing position size by 20%');
      }
    } else if (aiAnalysis.score.overall >= 50) {
      console.log('⚠️  AI RECOMMENDS: TRADE WITH CAUTION');
      console.log('   Reasoning: Moderate quality signal, standard position size');
    } else {
      console.log('❌ AI RECOMMENDS: AVOID TRADE');
      console.log('   Reasoning: Low quality signal with significant risk factors');
    }

    console.log('\n🎉 ANALYSIS COMPLETE!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
console.log('🧪 Starting Enhanced Signal Analysis Test...\n');
testEnhancedSignalAnalysis().then(() => {
  console.log('\n✅ Test completed successfully!');
}).catch(error => {
  console.error('\n❌ Test failed:', error);
});

export { testEnhancedSignalAnalysis };