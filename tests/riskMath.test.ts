import {
  isForexPair,
  isCrypto,
  getPipSize,
  getPipValuePerLot,
  calculateFixedDollarStopsAndTargets,
  formatPriceForInstrument
} from '../src/trading/riskMath';

describe('symbol classification', () => {
  it('treats BTCUSD/ETHUSD as crypto, not forex (regression: 0.01-lot bug)', () => {
    expect(isCrypto('BTCUSD')).toBe(true);
    expect(isCrypto('ETHUSD')).toBe(true);
    expect(isCrypto('SOLUSD')).toBe(true);
    // 6 uppercase letters means isForexPair is still technically true for BTCUSD,
    // so the crypto carve-out MUST be checked first in the pip helpers.
    expect(getPipSize('BTCUSD')).toBe(1.0);
    expect(getPipValuePerLot('BTCUSD')).toBe(1);
  });

  it('keeps real forex pairs classified as forex', () => {
    expect(isCrypto('EURUSD')).toBe(false);
    expect(isForexPair('EURUSD')).toBe(true);
    expect(getPipSize('EURUSD')).toBeCloseTo(0.0001);
    expect(getPipValuePerLot('EURUSD')).toBe(10);
  });

  it('keeps JPY pairs at 0.01 pip size', () => {
    expect(getPipSize('USDJPY')).toBeCloseTo(0.01);
    expect(getPipValuePerLot('USDJPY')).toBe(10);
  });

  it('keeps metals on their own scale', () => {
    expect(getPipSize('XAUUSD')).toBe(1.0);
    expect(getPipValuePerLot('XAUUSD')).toBe(100);
    expect(getPipValuePerLot('XAGUSD')).toBe(5000);
  });
});

describe('calculateFixedDollarStopsAndTargets', () => {
  it('BUY: stopLoss < entry < target', () => {
    const { stopLoss, targets } = calculateFixedDollarStopsAndTargets({
      symbol: 'XAUUSD',
      entryPrice: 2650,
      direction: 'BUY',
      config: { lotSize: 0.1, riskAmount: 50, riskRewardRatio: 2 }
    });
    expect(stopLoss).toBeLessThan(2650);
    expect(targets[0]).toBeGreaterThan(2650);
    // RR honoured: reward distance ≈ 2× risk distance
    expect(targets[0] - 2650).toBeCloseTo((2650 - stopLoss) * 2, 5);
  });

  it('SELL: stopLoss > entry > target', () => {
    const { stopLoss, targets } = calculateFixedDollarStopsAndTargets({
      symbol: 'EURUSD',
      entryPrice: 1.1,
      direction: 'SELL',
      config: { lotSize: 0.1, riskAmount: 50, riskRewardRatio: 1.5 }
    });
    expect(stopLoss).toBeGreaterThan(1.1);
    expect(targets[0]).toBeLessThan(1.1);
  });

  it('BTCUSD produces a meaningful stop distance, not a sub-dollar one', () => {
    // Pre-fix, BTCUSD was treated as forex and the stop landed ~$0.01 from entry.
    const entry = 60000;
    const { stopLoss } = calculateFixedDollarStopsAndTargets({
      symbol: 'BTCUSD',
      entryPrice: entry,
      direction: 'BUY',
      config: { lotSize: 0.75, riskAmount: 1000, riskRewardRatio: 3 }
    });
    const stopDistance = entry - stopLoss;
    expect(stopDistance).toBeGreaterThan(100); // not a rounding-error stop
    expect(stopLoss).toBeLessThan(entry);
  });
});

describe('formatPriceForInstrument', () => {
  it('rounds to instrument precision', () => {
    expect(formatPriceForInstrument(1.123456789, 'EURUSD')).toBe(1.12346);
    expect(formatPriceForInstrument(2650.126, 'XAUUSD')).toBe(2650.13);
    expect(formatPriceForInstrument(145.1239, 'USDJPY')).toBe(145.124);
    expect(formatPriceForInstrument(60123.456, 'BTCUSD')).toBe(60123.46);
  });
});
