import { PreTradeGuard } from '../src/trading/preTradeGuard';
import { TradeSignal } from '../src/types';

function signal(over: Partial<TradeSignal> = {}): TradeSignal {
  return {
    symbol: 'XAUUSD',
    action: 'BUY',
    entryZone: { min: 2649, max: 2651 },
    stopLoss: 2640,
    targets: [2670],
    orderType: 'LIMIT',
    ...over
  } as TradeSignal;
}

describe('PreTradeGuard.check', () => {
  it('allows a structurally valid, fresh signal', () => {
    const g = new PreTradeGuard(5, 1000);
    expect(g.check(signal())).toEqual({ allowed: true });
  });

  it('blocks a duplicate of the same setup within the window', () => {
    const g = new PreTradeGuard(5, 1000);
    expect(g.check(signal()).allowed).toBe(true);
    expect(g.check(signal()).allowed).toBe(false);
  });

  it('treats different symbol/action/levels as distinct signals', () => {
    const g = new PreTradeGuard(5, 1000);
    expect(g.check(signal()).allowed).toBe(true);
    expect(g.check(signal({ symbol: 'EURUSD', entryZone: { min: 1.1, max: 1.1002 }, stopLoss: 1.09, targets: [1.12] })).allowed).toBe(true);
  });

  it('rejects an inverted BUY (stop at/above entry)', () => {
    const g = new PreTradeGuard(5, 1000);
    const res = g.check(signal({ stopLoss: 2660 }));
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/inverted/i);
  });

  it('rejects an inverted SELL (stop at/below entry)', () => {
    const g = new PreTradeGuard(5, 1000);
    const res = g.check(signal({ action: 'SELL', stopLoss: 2640, targets: [2620] }));
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/inverted/i);
  });

  it('rejects an invalid action', () => {
    const g = new PreTradeGuard(5, 1000);
    const res = g.check(signal({ action: 'HODL' as any }));
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/action/i);
  });

  it('allows a market order (no entry) without side validation', () => {
    const g = new PreTradeGuard(5, 1000);
    const res = g.check(signal({ entryZone: { min: 0, max: 0 }, orderType: 'MARKET' }));
    expect(res.allowed).toBe(true);
  });

  it('enforces the daily trade limit after recordExecuted()', () => {
    const g = new PreTradeGuard(2, 1000);
    expect(g.check(signal({ symbol: 'EURUSD', entryZone: { min: 1.1, max: 1.1002 }, stopLoss: 1.09, targets: [1.12] })).allowed).toBe(true);
    g.recordExecuted();
    expect(g.check(signal({ symbol: 'GBPUSD', entryZone: { min: 1.3, max: 1.3002 }, stopLoss: 1.29, targets: [1.32] })).allowed).toBe(true);
    g.recordExecuted();
    const blocked = g.check(signal({ symbol: 'AUDUSD', entryZone: { min: 0.65, max: 0.6502 }, stopLoss: 0.64, targets: [0.67] }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/daily trade limit/i);
  });
});
