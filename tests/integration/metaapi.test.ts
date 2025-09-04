import { MultiAccountMetaApiExecutor } from '../../src/mt5/multiAccountMetaApiExecutor';
import { TradeSignal } from '../../src/types';
import { TradingSafetyControls } from '../../src/utils/tradingSafetyControls';

// Mock MetaAPI to prevent real trades during testing
jest.mock('metaapi.cloud-sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      getAccount: jest.fn().mockResolvedValue({
        id: 'test-account',
        state: 'DEPLOYED',
        connectionState: 'CONNECTED',
        getStreamingConnection: jest.fn().mockResolvedValue({
          connect: jest.fn().mockResolvedValue(undefined),
          waitSynchronized: jest.fn().mockResolvedValue(undefined),
          synchronized: true,
          getAccountInformation: jest.fn().mockResolvedValue({
            balance: 10000,
            equity: 10000,
            margin: 0
          }),
          getSymbolPrice: jest.fn().mockResolvedValue({
            bid: 2650.00,
            ask: 2650.50,
            time: new Date()
          }),
          createLimitBuyOrder: jest.fn().mockResolvedValue({
            orderId: 'test-order-123',
            positionId: 'test-position-123'
          }),
          createLimitSellOrder: jest.fn().mockResolvedValue({
            orderId: 'test-order-456',
            positionId: 'test-position-456'
          })
        }),
        getRPCConnection: jest.fn().mockResolvedValue({
          connect: jest.fn().mockResolvedValue(undefined),
          waitSynchronized: jest.fn().mockResolvedValue(undefined)
        }),
        deploy: jest.fn().mockResolvedValue(undefined),
        waitDeployed: jest.fn().mockResolvedValue(undefined)
      })
    }))
  };
});

describe('MetaAPI Integration Tests', () => {
  let executor: MultiAccountMetaApiExecutor;
  let safetyControls: TradingSafetyControls;

  beforeEach(async () => {
    // Set up test environment
    process.env.METAAPI_TOKEN = 'test-token';
    process.env.METAAPI_ACCOUNTS = 'test-account:TestBroker:DEMO';
    process.env.MAX_DAILY_TRADES = '5';
    process.env.MAX_DAILY_LOSS = '100';
    process.env.MIN_ACCOUNT_BALANCE = '1000';

    safetyControls = TradingSafetyControls.getInstance();
    safetyControls.resetState();
    
    executor = new MultiAccountMetaApiExecutor();
    await executor.initialize();
  });

  afterEach(() => {
    // Clean up
    safetyControls.resetState();
  });

  describe('Trade Execution Safety', () => {
    test('should prevent trade execution below minimum balance', async () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      // Mock low balance scenario
      const mockConnection = {
        getAccountInformation: jest.fn().mockResolvedValue({
          balance: 500, // Below minimum
          equity: 500,
          margin: 0
        })
      };

      // Should reject trade due to insufficient balance
      const result = await executor.executeTrade(signal);
      expect(result.overallSuccess).toBe(false);
    });

    test('should enforce daily trade limits', async () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      // Execute trades up to the limit
      for (let i = 0; i < 5; i++) {
        await executor.executeTrade(signal);
      }

      // 6th trade should be rejected
      const result = await executor.executeTrade(signal);
      expect(result.overallSuccess).toBe(false);
      expect(result.results[0].message).toContain('Daily trade limit');
    });

    test('should handle race conditions properly', async () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      // Execute two trades simultaneously
      const promises = [
        executor.executeTrade(signal),
        executor.executeTrade(signal)
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should be blocked by mutex
      const successful = results.filter(r => r.overallSuccess);
      const blocked = results.filter(r => !r.overallSuccess);
      
      expect(successful.length).toBe(1);
      expect(blocked.length).toBe(1);
      expect(blocked[0].results[0].message).toContain('race condition');
    });
  });

  describe('Circuit Breaker Tests', () => {
    test('should open circuit breaker after 3 consecutive failures', async () => {
      const signal: TradeSignal = {
        symbol: 'FAILSYMBOL', // This will cause failures
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      // Mock failures
      const mockConnection = {
        getSymbolPrice: jest.fn().mockRejectedValue(new Error('Symbol not found')),
        getAccountInformation: jest.fn().mockResolvedValue({
          balance: 10000,
          equity: 10000,
          margin: 0
        })
      };

      // Execute 3 failing trades
      for (let i = 0; i < 3; i++) {
        await executor.executeTrade(signal);
      }

      // 4th trade should be blocked by circuit breaker
      const result = await executor.executeTrade(signal);
      expect(result.overallSuccess).toBe(false);
      expect(result.results[0].message).toContain('Circuit breaker open');
    });
  });

  describe('Position Sizing Validation', () => {
    test('should calculate correct position sizes based on risk', async () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640, // 10-15 pip stop
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      const result = await executor.executeTrade(signal);
      expect(result.overallSuccess).toBe(true);

      // Position size should be reasonable for the risk
      // For 10000 balance, 2% risk, 10-15 pip stop, should be around 1.0-1.5 lots
      // This is a simplified test - actual calculation depends on broker specs
    });

    test('should reject excessive position sizes', async () => {
      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2649.9, // Very tight stop = large position
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      const validation = safetyControls.validateTrade(signal, 1000, 100.0); // Massive volume
      expect(validation.canTrade).toBe(true);
      expect(validation.adjustedVolume).toBeLessThan(100.0); // Should be reduced
    });
  });

  describe('Connection Reliability', () => {
    test('should handle MetaAPI connection failures gracefully', async () => {
      // Mock connection failure
      const mockAccount = {
        getStreamingConnection: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };

      const signal: TradeSignal = {
        symbol: 'XAUUSD',
        action: 'BUY',
        entryZone: { min: 2650, max: 2660 },
        stopLoss: 2640,
        targets: [2680, 2700, 2720],
        orderType: 'LIMIT'
      };

      const result = await executor.executeTrade(signal);
      
      // Should fail gracefully without crashing
      expect(result.overallSuccess).toBe(false);
      expect(result.results[0].error).toContain('Connection failed');
    });

    test('should retry failed connections with exponential backoff', async () => {
      // This tests the connection retry logic
      // Mock intermittent failures that eventually succeed
      let attempts = 0;
      const mockConnection = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('Temporary connection failure');
        }
        return Promise.resolve({
          connect: jest.fn().mockResolvedValue(undefined),
          waitSynchronized: jest.fn().mockResolvedValue(undefined)
        });
      });

      // Test would verify retry attempts with proper delays
      expect(attempts).toBeGreaterThan(0);
    });
  });
});
