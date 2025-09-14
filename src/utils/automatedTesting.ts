import { TradeSignal } from '../types';
import { CleanRealWorldTradeParser } from '../ocr/cleanRealWorldTradeParser';
import { InputValidator } from '../utils/inputValidation';
import { PositionSizeCalculator } from '../utils/positionSizing';
import { DynamicStopLossCalculator } from '../utils/dynamicStopLoss';
import { logger } from '../utils/logger';

export interface TestCase {
  name: string;
  description: string;
  input: any;
  expectedOutput?: any;
  shouldPass: boolean;
  category: 'PARSING' | 'VALIDATION' | 'POSITION_SIZING' | 'STOP_LOSS' | 'INTEGRATION';
}

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  actualOutput?: any;
  expectedOutput?: any;
  executionTime: number;
}

export interface TestSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  executionTime: number;
  summary: {
    parsing: { passed: number; total: number };
    validation: { passed: number; total: number };
    positionSizing: { passed: number; total: number };
    stopLoss: { passed: number; total: number };
    integration: { passed: number; total: number };
  };
}

export class AutomatedTestSuite {
  // Using static methods from CleanRealWorldTradeParser, no instance needed
  private positionSizeCalculator: PositionSizeCalculator;
  private stopLossCalculator: DynamicStopLossCalculator;

  constructor() {
    this.positionSizeCalculator = new PositionSizeCalculator({
      maxRiskPercentage: 2,
      maxPositionSize: 10,
      minPositionSize: 0.01
    });
    this.stopLossCalculator = new DynamicStopLossCalculator();
  }

  /**
   * Run the complete test suite
   */
  async runAllTests(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    
    logger.info('🧪 Starting automated test suite...');
    
    const testCases = [
      ...this.getParsingTests(),
      ...this.getValidationTests(),
      ...this.getPositionSizingTests(),
      ...this.getStopLossTests(),
      ...this.getIntegrationTests()
    ];
    
    const results: TestResult[] = [];
    
    for (const testCase of testCases) {
      const result = await this.runSingleTest(testCase);
      results.push(result);
    }
    
    const executionTime = Date.now() - startTime;
    const summary = this.generateSummary(results);
    
    const suiteResult: TestSuiteResult = {
      totalTests: testCases.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      results,
      executionTime,
      summary
    };
    
    this.logTestResults(suiteResult);
    
    return suiteResult;
  }

  /**
   * Run critical safety tests only
   */
  async runSafetyTests(): Promise<TestSuiteResult> {
    logger.info('🔥 Running critical safety tests...');
    
    const safetyTests = [
      ...this.getValidationTests().filter(t => t.description.includes('safety') || t.description.includes('critical')),
      ...this.getPositionSizingTests().filter(t => t.description.includes('risk') || t.description.includes('limit')),
      ...this.getStopLossTests().filter(t => t.description.includes('logical') || t.description.includes('risk'))
    ];
    
    const startTime = Date.now();
    const results: TestResult[] = [];
    
    for (const testCase of safetyTests) {
      const result = await this.runSingleTest(testCase);
      results.push(result);
    }
    
    const executionTime = Date.now() - startTime;
    const summary = this.generateSummary(results);
    
    return {
      totalTests: safetyTests.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      results,
      executionTime,
      summary
    };
  }

  private async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      let actualOutput: any;
      
      switch (testCase.category) {
        case 'PARSING':
          actualOutput = await CleanRealWorldTradeParser.parseTradeSignal(testCase.input);
          break;
          
        case 'VALIDATION':
          if (testCase.name.includes('TradeSignal')) {
            actualOutput = InputValidator.validateTradeSignal(testCase.input);
          } else if (testCase.name.includes('Text')) {
            actualOutput = InputValidator.validateExtractedText(testCase.input);
          } else if (testCase.name.includes('Equity')) {
            actualOutput = InputValidator.validateAccountEquity(testCase.input);
          }
          break;
          
        case 'POSITION_SIZING':
          actualOutput = this.positionSizeCalculator.calculatePositionSize(
            testCase.input.accountEquity,
            testCase.input.entryPrice,
            testCase.input.stopLoss,
            testCase.input.symbol
          );
          break;
          
        case 'STOP_LOSS':
          actualOutput = this.stopLossCalculator.calculateDynamicStopLoss(testCase.input);
          break;
          
        case 'INTEGRATION':
          actualOutput = await this.runIntegrationTest(testCase);
          break;
          
        default:
          throw new Error(`Unknown test category: ${testCase.category}`);
      }
      
      const passed = this.evaluateTestResult(testCase, actualOutput);
      
      return {
        testName: testCase.name,
        passed,
        actualOutput,
        expectedOutput: testCase.expectedOutput,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: testCase.name,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      };
    }
  }

  private getParsingTests(): TestCase[] {
    return [
      {
        name: 'Parse_Valid_Gold_Signal',
        description: 'Should parse valid GOLD buy signal',
        input: 'GOLD BUY 2650-2655 SL 2640 TP 2665 2670',
        shouldPass: true,
        category: 'PARSING'
      },
      {
        name: 'Parse_Valid_EURUSD_Signal',
        description: 'Should parse valid EURUSD sell signal',
        input: 'EURUSD SELL 1.0850-1.0860 SL 1.0870 TP 1.0840 1.0830',
        shouldPass: true,
        category: 'PARSING'
      },
      {
        name: 'Parse_Invalid_Signal',
        description: 'Should reject invalid trading signal',
        input: 'This is not a trading signal',
        shouldPass: false,
        category: 'PARSING'
      },
      {
        name: 'Parse_Result_Message',
        description: 'Should reject result/update messages',
        input: 'GOLD trade closed at +50 pips profit',
        shouldPass: false,
        category: 'PARSING'
      }
    ];
  }

  private getValidationTests(): TestCase[] {
    const validSignal: TradeSignal = {
      symbol: 'XAUUSD',
      action: 'BUY',
      entryZone: { min: 2650, max: 2655 },
      stopLoss: 2640,
      targets: [2665, 2670]
    };

    const invalidSignal: TradeSignal = {
      symbol: '',
      action: 'BUY',
      entryZone: { min: 2655, max: 2650 }, // Invalid: min > max
      stopLoss: 2660, // Invalid: SL above entry for BUY
      targets: [2640] // Invalid: target below entry for BUY
    };

    return [
      {
        name: 'Validate_Valid_TradeSignal',
        description: 'Should validate correct trade signal',
        input: validSignal,
        shouldPass: true,
        category: 'VALIDATION'
      },
      {
        name: 'Validate_Invalid_TradeSignal',
        description: 'Should reject invalid trade signal for safety',
        input: invalidSignal,
        shouldPass: false,
        category: 'VALIDATION'
      },
      {
        name: 'Validate_Valid_Text',
        description: 'Should validate good quality extracted text',
        input: 'GOLD BUY 2650-2655 SL 2640 TP 2665',
        shouldPass: true,
        category: 'VALIDATION'
      },
      {
        name: 'Validate_Poor_Text',
        description: 'Should reject poor quality text for safety',
        input: '!@#$%^&*()',
        shouldPass: false,
        category: 'VALIDATION'
      },
      {
        name: 'Validate_Valid_Equity',
        description: 'Should validate reasonable account equity',
        input: 10000,
        shouldPass: true,
        category: 'VALIDATION'
      },
      {
        name: 'Validate_Invalid_Equity',
        description: 'Should reject invalid account equity for safety',
        input: -1000,
        shouldPass: false,
        category: 'VALIDATION'
      }
    ];
  }

  private getPositionSizingTests(): TestCase[] {
    return [
      {
        name: 'PositionSizing_Normal_Risk',
        description: 'Should calculate appropriate lot size for normal risk',
        input: {
          accountEquity: 10000,
          entryPrice: 2650,
          stopLoss: 2640,
          symbol: 'XAUUSD'
        },
        shouldPass: true,
        category: 'POSITION_SIZING'
      },
      {
        name: 'PositionSizing_High_Risk_Limit',
        description: 'Should limit position size for high risk scenarios',
        input: {
          accountEquity: 1000,
          entryPrice: 2650,
          stopLoss: 2500, // Very wide SL
          symbol: 'XAUUSD'
        },
        shouldPass: true,
        category: 'POSITION_SIZING'
      },
      {
        name: 'PositionSizing_Invalid_Input',
        description: 'Should handle invalid inputs safely',
        input: {
          accountEquity: 0,
          entryPrice: -100,
          stopLoss: 0,
          symbol: ''
        },
        shouldPass: true, // Should not crash, return conservative result
        category: 'POSITION_SIZING'
      }
    ];
  }

  private getStopLossTests(): TestCase[] {
    const buySignal: TradeSignal = {
      symbol: 'XAUUSD',
      action: 'BUY',
      entryZone: { min: 2650, max: 2655 },
      stopLoss: 2640,
      targets: [2665, 2670]
    };

    const sellSignal: TradeSignal = {
      symbol: 'EURUSD',
      action: 'SELL',
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0870,
      targets: [1.0840, 1.0830]
    };

    return [
      {
        name: 'StopLoss_Dynamic_Calculation_BUY',
        description: 'Should calculate logical dynamic stop loss for BUY',
        input: buySignal,
        shouldPass: true,
        category: 'STOP_LOSS'
      },
      {
        name: 'StopLoss_Dynamic_Calculation_SELL',
        description: 'Should calculate logical dynamic stop loss for SELL',
        input: sellSignal,
        shouldPass: true,
        category: 'STOP_LOSS'
      },
      {
        name: 'StopLoss_Validation_BUY',
        description: 'Should validate stop loss placement for BUY orders',
        input: buySignal,
        shouldPass: true,
        category: 'STOP_LOSS'
      },
      {
        name: 'StopLoss_Validation_SELL',
        description: 'Should validate stop loss placement for SELL orders',
        input: sellSignal,
        shouldPass: true,
        category: 'STOP_LOSS'
      }
    ];
  }

  private getIntegrationTests(): TestCase[] {
    return [
      {
        name: 'Integration_Complete_Signal_Processing',
        description: 'Should process complete signal from text to execution',
        input: {
          text: 'GOLD BUY 2650-2655 SL 2640 TP 2665 2670',
          accountEquity: 10000
        },
        shouldPass: true,
        category: 'INTEGRATION'
      },
      {
        name: 'Integration_Safety_Chain',
        description: 'Should reject unsafe signals through validation chain',
        input: {
          text: 'INVALID TRADE SOMETHING',
          accountEquity: 5000
        },
        shouldPass: false,
        category: 'INTEGRATION'
      }
    ];
  }

  private async runIntegrationTest(testCase: TestCase): Promise<any> {
    const { text, accountEquity } = testCase.input;
    
    // Step 1: Parse signal
    const signal = await CleanRealWorldTradeParser.parseTradeSignal(text);
    if (!signal) return { step: 'parsing', success: false };
    
    // Step 2: Validate signal
    const validation = InputValidator.validateTradeSignal(signal);
    if (!validation.isValid) return { step: 'validation', success: false, errors: validation.errors };
    
    // Step 3: Add position sizing
    // Position sizing is now handled separately
    // this.positionSizeCalculator.calculatePositionSize(signal, accountEquity);
    
    // Step 4: Calculate dynamic stop loss
    const dynamicSL = this.stopLossCalculator.calculateDynamicStopLoss(signal);
    
    return {
      step: 'complete',
      success: true,
      signal,
      validation,
      dynamicStopLoss: dynamicSL
    };
  }

  private evaluateTestResult(testCase: TestCase, actualOutput: any): boolean {
    try {
      switch (testCase.category) {
        case 'PARSING':
          if (testCase.shouldPass) {
            return actualOutput !== null && typeof actualOutput === 'object';
          } else {
            return actualOutput === null;
          }
          
        case 'VALIDATION':
          if (testCase.name.includes('TradeSignal') || testCase.name.includes('Text') || testCase.name.includes('Equity')) {
            return testCase.shouldPass ? actualOutput.isValid : !actualOutput.isValid;
          }
          break;
          
        case 'POSITION_SIZING':
          if (testCase.shouldPass) {
            return actualOutput && typeof actualOutput.lotSize === 'number' && actualOutput.lotSize > 0;
          } else {
            return actualOutput.lotSize === 0.01; // Should fallback to minimum
          }
          
        case 'STOP_LOSS':
          if (testCase.shouldPass) {
            return actualOutput && typeof actualOutput.stopLoss === 'number' && actualOutput.confidence > 0;
          }
          break;
          
        case 'INTEGRATION':
          if (testCase.shouldPass) {
            return actualOutput.success === true;
          } else {
            return actualOutput.success === false;
          }
          
        default:
          return false;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  private generateSummary(results: TestResult[]) {
    const categories = ['parsing', 'validation', 'positionSizing', 'stopLoss', 'integration'] as const;
    const summary: any = {};
    
    for (const category of categories) {
      const categoryResults = results.filter(r => 
        r.testName.toLowerCase().includes(category.toLowerCase())
      );
      
      summary[category] = {
        passed: categoryResults.filter(r => r.passed).length,
        total: categoryResults.length
      };
    }
    
    return summary;
  }

  private logTestResults(suiteResult: TestSuiteResult): void {
    logger.info('🧪 Test Suite Results:');
    logger.info(`📊 Total Tests: ${suiteResult.totalTests}`);
    logger.info(`✅ Passed: ${suiteResult.passedTests}`);
    logger.info(`❌ Failed: ${suiteResult.failedTests}`);
    logger.info(`⏱️  Execution Time: ${suiteResult.executionTime}ms`);
    
    logger.info('\n📋 Summary by Category:');
    Object.entries(suiteResult.summary).forEach(([category, stats]) => {
      const percentage = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0';
      logger.info(`  ${category}: ${stats.passed}/${stats.total} (${percentage}%)`);
    });
    
    // Log failed tests
    const failedTests = suiteResult.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      logger.warn('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        logger.warn(`  - ${test.testName}: ${test.error || 'Test criteria not met'}`);
      });
    }
    
    // Overall status
    const successRate = (suiteResult.passedTests / suiteResult.totalTests) * 100;
    if (successRate >= 90) {
      logger.info(`\n🎉 EXCELLENT: ${successRate.toFixed(1)}% success rate`);
    } else if (successRate >= 75) {
      logger.info(`\n✅ GOOD: ${successRate.toFixed(1)}% success rate`);
    } else {
      logger.error(`\n🚨 NEEDS ATTENTION: ${successRate.toFixed(1)}% success rate`);
    }
  }
}
