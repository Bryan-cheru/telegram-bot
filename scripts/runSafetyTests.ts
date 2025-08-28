#!/usr/bin/env node

import { AutomatedTestSuite } from '../src/utils/automatedTesting';
import { logger } from '../src/utils/logger';

async function runTests() {
  logger.info('🔥 CRITICAL SAFETY TEST RUNNER');
  logger.info('================================');
  
  const testSuite = new AutomatedTestSuite();
  
  try {
    // Run all tests
    const fullResults = await testSuite.runAllTests();
    
    // Run safety-critical tests
    logger.info('\n🚨 Running Safety-Critical Tests...\n');
    const safetyResults = await testSuite.runSafetyTests();
    
    // Evaluate results
    const overallSuccessRate = (fullResults.passedTests / fullResults.totalTests) * 100;
    const safetySuccessRate = (safetyResults.passedTests / safetyResults.totalTests) * 100;
    
    logger.info('\n🏆 FINAL ASSESSMENT:');
    logger.info('====================');
    logger.info(`Overall Success Rate: ${overallSuccessRate.toFixed(1)}%`);
    logger.info(`Safety Tests Success Rate: ${safetySuccessRate.toFixed(1)}%`);
    
    // Safety assessment
    if (safetySuccessRate === 100) {
      logger.info('🟢 SYSTEM READY FOR LIVE TRADING');
      logger.info('All critical safety tests passed');
    } else if (safetySuccessRate >= 90) {
      logger.warn('🟡 SYSTEM NEEDS MINOR FIXES');
      logger.warn('Some safety tests failed - review required');
    } else {
      logger.error('🔴 SYSTEM NOT SAFE FOR LIVE TRADING');
      logger.error('Critical safety failures detected');
    }
    
    process.exit(safetySuccessRate === 100 ? 0 : 1);
    
  } catch (error) {
    logger.error('🚨 Test execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

export { runTests };
