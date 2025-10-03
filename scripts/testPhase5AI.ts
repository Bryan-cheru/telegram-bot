/**
 * Phase 5 AI Intelligence Test Suite
 * Comprehensive testing of AI-powered signal analysis and market sentiment
 * Part of Phase 5: Advanced Features - AI Intelligence Engine
 */

import { SignalIntelligenceService } from '../src/services/SignalIntelligenceService';
import { MarketSentimentAnalyzer } from '../src/services/MarketSentimentAnalyzer';
import { TradeSignal } from '../src/types/index';

interface TestResult {
  name: string;
  passed: boolean;
  details?: any;
  error?: string;
  duration?: number;
}

async function runPhase5AITests(): Promise<void> {
  const results: TestResult[] = [];
  
  console.log('🚀 PHASE 5 AI INTELLIGENCE TEST SUITE');
  console.log('=====================================');
  console.log('🤖 Testing AI-powered signal analysis and market sentiment...\n');
  
  try {
    // Initialize AI services
    const intelligenceService = SignalIntelligenceService.getInstance();
    const sentimentAnalyzer = MarketSentimentAnalyzer.getInstance();
    
    await intelligenceService.initialize();
    await sentimentAnalyzer.initialize();
    
    console.log('✅ AI Services initialized successfully\n');
    
    // Test 1: Signal Intelligence Analysis
    console.log('🔍 Testing Signal Intelligence Analysis...');
    
    try {
      const startTime = Date.now();
      
      const testSignal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2655 },
        stopLoss: 2640,
        targets: [2665, 2675, 2685],
        confidence: 0.85
      };
      
      const analysis = await intelligenceService.analyzeSignal(testSignal, 'test_channel');
      const duration = Date.now() - startTime;
      
      results.push({
        name: 'AI Signal Analysis',
        passed: analysis.score.overall >= 0 && analysis.score.overall <= 100,
        details: {
          signal: testSignal.symbol,
          overallScore: analysis.score.overall,
          recommendation: analysis.recommendation,
          confidence: analysis.score.confidence,
          technicalScore: analysis.score.technical,
          sentimentScore: analysis.score.sentiment,
          historicalScore: analysis.score.historical,
          riskScore: analysis.score.risk,
          aiInsights: analysis.aiInsights.length,
          riskFactors: analysis.riskFactors.length
        },
        duration
      });
      
      console.log(`  ✅ Analysis complete: ${analysis.recommendation} (Score: ${analysis.score.overall}/100)`);
      console.log(`  🎯 Confidence: ${analysis.score.confidence}%`);
      console.log(`  💡 AI Insights: ${analysis.aiInsights.length} generated`);
      console.log(`  ⚠️  Risk Factors: ${analysis.riskFactors.length} identified`);
      console.log(`  ⏱️  Processing time: ${duration}ms`);
      
    } catch (error) {
      results.push({
        name: 'AI Signal Analysis',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`  ❌ Error: ${error}`);
    }
    
    // Test 2: Batch Signal Analysis
    console.log('\n📊 Testing Batch Signal Analysis...');
    
    try {
      const startTime = Date.now();
      
      const testSignals = [
        {
          signal: {
            symbol: 'EURUSD',
            action: 'SELL' as const,
            entryZone: { min: 1.0850, max: 1.0860 },
            stopLoss: 1.0900,
            targets: [1.0800, 1.0750],
            confidence: 0.75
          },
          channelId: 'test_channel'
        },
        {
          signal: {
            symbol: 'GBPJPY',
            action: 'BUY' as const,
            entryZone: { min: 189.50, max: 190.00 },
            stopLoss: 188.00,
            targets: [191.00, 192.00],
            confidence: 0.65
          },
          channelId: 'test_channel'
        }
      ];
      
      const batchAnalyses = await intelligenceService.analyzeSignalsBatch(testSignals);
      const duration = Date.now() - startTime;
      
      results.push({
        name: 'Batch AI Analysis',
        passed: batchAnalyses.length === testSignals.length,
        details: {
          inputSignals: testSignals.length,
          outputAnalyses: batchAnalyses.length,
          averageScore: Math.round(batchAnalyses.reduce((sum, a) => sum + a.score.overall, 0) / batchAnalyses.length),
          recommendations: batchAnalyses.map(a => a.recommendation)
        },
        duration
      });
      
      console.log(`  ✅ Batch analysis complete: ${batchAnalyses.length} signals processed`);
      console.log(`  📈 Average score: ${Math.round(batchAnalyses.reduce((sum, a) => sum + a.score.overall, 0) / batchAnalyses.length)}/100`);
      console.log(`  ⏱️  Processing time: ${duration}ms`);
      
    } catch (error) {
      results.push({
        name: 'Batch AI Analysis',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`  ❌ Error: ${error}`);
    }
    
    // Test 3: Market Sentiment Analysis
    console.log('\n📊 Testing Market Sentiment Analysis...');
    
    try {
      const startTime = Date.now();
      
      const sentimentData = await sentimentAnalyzer.analyzeSentiment('XAUUSD');
      const duration = Date.now() - startTime;
      
      results.push({
        name: 'Market Sentiment Analysis',
        passed: sentimentData.score >= -100 && sentimentData.score <= 100,
        details: {
          symbol: sentimentData.symbol,
          sentiment: sentimentData.sentiment,
          score: sentimentData.score,
          confidence: sentimentData.confidence,
          sources: sentimentData.sources.length,
          marketFactors: sentimentData.marketFactors.length
        },
        duration
      });
      
      console.log(`  ✅ Sentiment analysis complete: ${sentimentData.sentiment}`);
      console.log(`  📊 Score: ${sentimentData.score}/100 (Confidence: ${sentimentData.confidence}%)`);
      console.log(`  📰 Sources analyzed: ${sentimentData.sources.length}`);
      console.log(`  ⚠️  Market factors: ${sentimentData.marketFactors.length}`);
      console.log(`  ⏱️  Processing time: ${duration}ms`);
      
    } catch (error) {
      results.push({
        name: 'Market Sentiment Analysis',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`  ❌ Error: ${error}`);
    }
    
    // Test 4: Global Market Sentiment
    console.log('\n🌍 Testing Global Market Sentiment...');
    
    try {
      const startTime = Date.now();
      
      const globalSentiment = await sentimentAnalyzer.getGlobalSentiment();
      const duration = Date.now() - startTime;
      
      results.push({
        name: 'Global Market Sentiment',
        passed: !!(globalSentiment.overall && globalSentiment.crypto && globalSentiment.forex && globalSentiment.commodities && globalSentiment.stocks),
        details: {
          overall: globalSentiment.overall.sentiment,
          crypto: globalSentiment.crypto.sentiment,
          forex: globalSentiment.forex.sentiment,
          commodities: globalSentiment.commodities.sentiment,
          stocks: globalSentiment.stocks.sentiment,
          fearGreedIndex: globalSentiment.fearGreedIndex,
          vixLevel: globalSentiment.vixLevel
        },
        duration
      });
      
      console.log(`  ✅ Global sentiment complete: ${globalSentiment.overall.sentiment}`);
      console.log(`  📈 Crypto: ${globalSentiment.crypto.sentiment}`);
      console.log(`  💱 Forex: ${globalSentiment.forex.sentiment}`);
      console.log(`  🏗️  Commodities: ${globalSentiment.commodities.sentiment}`);
      console.log(`  📈 Stocks: ${globalSentiment.stocks.sentiment}`);
      if (globalSentiment.fearGreedIndex) console.log(`  😰 Fear/Greed Index: ${globalSentiment.fearGreedIndex}`);
      if (globalSentiment.vixLevel) console.log(`  📊 VIX Level: ${globalSentiment.vixLevel?.toFixed(1)}`);
      console.log(`  ⏱️  Processing time: ${duration}ms`);
      
    } catch (error) {
      results.push({
        name: 'Global Market Sentiment',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`  ❌ Error: ${error}`);
    }
    
    // Test 5: Personalized Recommendations
    console.log('\n🎯 Testing Personalized AI Recommendations...');
    
    try {
      const startTime = Date.now();
      
      const recommendations = await intelligenceService.getPersonalizedRecommendations('test_user_ai', 5);
      const duration = Date.now() - startTime;
      
      results.push({
        name: 'Personalized AI Recommendations',
        passed: recommendations.length > 0,
        details: {
          userId: 'test_user_ai',
          recommendationCount: recommendations.length,
          recommendations: recommendations
        },
        duration
      });
      
      console.log(`  ✅ Recommendations generated: ${recommendations.length}`);
      recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
      console.log(`  ⏱️  Processing time: ${duration}ms`);
      
    } catch (error) {
      results.push({
        name: 'Personalized AI Recommendations',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`  ❌ Error: ${error}`);
    }
    
  } catch (error) {
    console.error('❌ AI Services initialization failed:', error);
    return;
  }
  
  // Print comprehensive test results
  console.log('\n🧪 PHASE 5 AI TEST RESULTS');
  console.log('===========================');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const successRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0';
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${status} ${result.name}${duration}`);
    
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    if (result.passed && result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2).replace(/\\n/g, '\\n   ')}`);
    }
  });
  
  console.log(`\\n📊 Success Rate: ${successRate}% (${passed}/${total})`);
  
  if (passed === total) {
    console.log('\\n🎉 ALL AI INTELLIGENCE TESTS PASSED!');
    console.log('🚀 Phase 5.1: AI Intelligence Engine is COMPLETE and OPERATIONAL!');
  } else {
    console.log('\\n⚠️  Some AI tests need attention');
  }
  
  // Performance summary
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = total > 0 ? (totalDuration / total).toFixed(1) : '0.0';
  
  console.log(`\\n⚡ Performance Summary:`);
  console.log(`   Total processing time: ${totalDuration}ms`);
  console.log(`   Average per test: ${avgDuration}ms`);
  console.log(`   Tests completed: ${total}`);
}

// Run the AI Intelligence tests
runPhase5AITests().catch(console.error);