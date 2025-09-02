import { tradingConfig } from '../../src/utils/tradingConfig';
import { TradingSafetyControls } from '../../src/utils/tradingSafetyControls';
import { TradeSignal } from '../../src/types';

// Mock process.env to avoid interference
process.env.MAX_DAILY_TRADES = '10';
process.env.MAX_DAILY_LOSS = '500';
process.env.MIN_ACCOUNT_BALANCE = '1000';

describe('Trading Safety Controls', () => {
  let safetyControls: TradingSafetyControls;
  
  beforeEach(() => {
    // Get fresh instance and reset state
    safetyControls = TradingSafetyControls.getInstance();
    // Reset state for clean testing
    safetyControls.resetState();
  });

  describe('Position Size Validation', () => {
    test('should reject trade when account balance is below minimum', () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720]
      };

      const result = safetyControls.validateTrade(signal, 500, 0.01); // Below minimum balance
      
      expect(result.canTrade).toBe(false);
      expect(result.reason).toContain('below minimum required');
    });

    test('should adjust position size when risk is too high', () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720]
      };

      const result = safetyControls.validateTrade(signal, 10000, 10.0); // Very high volume
      
      expect(result.canTrade).toBe(true);
      expect(result.adjustedVolume).toBeLessThan(10.0);
      expect(result.adjustedVolume).toBeGreaterThanOrEqual(0.01);
    });

    test('should reject trade when daily trade limit is exceeded', () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720]
      };

      // Record maximum daily trades
      const config = tradingConfig.getConfig();
      for (let i = 0; i < config.maxDailyTrades; i++) {
        safetyControls.recordTrade(0.01);
      }

      const result = safetyControls.validateTrade(signal, 10000, 0.01);
      
      expect(result.canTrade).toBe(false);
      expect(result.reason).toContain('Daily trade limit exceeded');
    });
  });

  describe('Risk Management', () => {
    test('should validate trade with reasonable parameters', () => {
      const signal: TradeSignal = {
        symbol: 'EURUSD',
        action: 'BUY',
        entryZone: { min: 1.1000, max: 1.1010 },
        stopLoss: 1.0950,
        targets: [1.1050, 1.1100]
      };

      const result = safetyControls.validateTrade(signal, 10000, 0.1); // Reasonable volume
      
      expect(result.canTrade).toBe(true);
      expect(result.adjustedVolume).toBeDefined();
      expect(result.adjustedVolume).toBeGreaterThan(0);
    });

    test('should track daily P&L correctly', () => {
      // Reset state to be sure
      safetyControls.resetState();
      
      safetyControls.recordTrade(0.01, -100); // Loss
      safetyControls.recordTrade(0.01, 50);   // Profit

      const state = safetyControls.getTradingState();
      
      expect(state.dailyLoss).toBe(-50); // Net loss
      expect(state.dailyTrades).toBe(2);
    });
  });

  describe('Emergency Controls', () => {
    test('should stop trading on emergency', () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680]
      };

      safetyControls.emergencyStop('Test emergency');
      
      const result = safetyControls.validateTrade(signal, 10000, 0.01);
      
      expect(result.canTrade).toBe(false);
    });
  });
});

describe('Trading Configuration', () => {
  test('should load configuration with valid defaults', () => {
    const config = tradingConfig.getConfig();
    
    expect(config.minLotSize).toBeGreaterThan(0);
    expect(config.maxLotSize).toBeGreaterThanOrEqual(config.minLotSize);
    expect(config.defaultRiskPercentage).toBeGreaterThan(0);
    expect(config.defaultRiskPercentage).toBeLessThanOrEqual(100);
    expect(config.minOcrConfidence).toBeGreaterThan(0);
    expect(config.minOcrConfidence).toBeLessThanOrEqual(1);
  });

  test('should validate price ranges for symbols', () => {
    const xauRange = tradingConfig.getPriceRange('XAUUSD');
    const eurRange = tradingConfig.getPriceRange('EURUSD');
    
    expect(xauRange.min).toBeGreaterThan(1000);
    expect(xauRange.max).toBeGreaterThan(xauRange.min);
    expect(eurRange.min).toBeGreaterThan(0.5);
    expect(eurRange.max).toBeLessThan(2.0);
  });

  test('should calculate maximum volume correctly', () => {
    const maxVolume = tradingConfig.calculateMaxVolume(10000, 2650, 2640);
    
    expect(maxVolume).toBeGreaterThan(0);
    expect(maxVolume).toBeLessThanOrEqual(tradingConfig.getConfig().maxLotSize);
    expect(maxVolume).toBeGreaterThanOrEqual(tradingConfig.getConfig().minLotSize);
  });
});
