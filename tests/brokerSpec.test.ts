import { getBrokerSymbolSpec, normalizeVolume } from '../src/trading/brokerSpec';

/** Minimal fake of a MetaAPI streaming connection's terminalState. */
function fakeConnection(spec: any, price: any) {
  return {
    terminalState: {
      specification: (_s: string) => spec,
      price: (_s: string) => price
    }
  };
}

describe('getBrokerSymbolSpec', () => {
  it('reads spec fields and lossTickValue from the connection', () => {
    const conn = fakeConnection(
      { tickSize: 0.01, contractSize: 1, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, digits: 2 },
      { bid: 60000, ask: 60001, profitTickValue: 0.01, lossTickValue: 0.01 }
    );
    const spec = getBrokerSymbolSpec(conn, 'BTCUSD');
    expect(spec).not.toBeNull();
    expect(spec!.tickSize).toBe(0.01);
    expect(spec!.tickValue).toBe(0.01);
    expect(spec!.volumeStep).toBe(0.01);
    expect(spec!.maxVolume).toBe(50);
  });

  it('returns null for an RPC connection with no terminalState', () => {
    expect(getBrokerSymbolSpec({}, 'BTCUSD')).toBeNull();
    expect(getBrokerSymbolSpec(null, 'BTCUSD')).toBeNull();
  });

  it('returns null when tickSize is missing/invalid', () => {
    const conn = fakeConnection({ tickSize: 0 }, { lossTickValue: 1 });
    expect(getBrokerSymbolSpec(conn, 'BTCUSD')).toBeNull();
  });

  it('falls back to NaN tickValue when price is not yet synced', () => {
    const conn = fakeConnection(
      { tickSize: 0.0001, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, digits: 5 },
      undefined
    );
    const spec = getBrokerSymbolSpec(conn, 'EURUSD');
    expect(spec).not.toBeNull();
    expect(Number.isNaN(spec!.tickValue)).toBe(true);
  });
});

describe('normalizeVolume', () => {
  const spec = { minVolume: 0.01, maxVolume: 10, volumeStep: 0.01 };

  it('snaps to the volume step and kills float dust', () => {
    expect(normalizeVolume(0.123, spec)).toBe(0.12);
    expect(normalizeVolume(0.3, { minVolume: 0.1, maxVolume: 10, volumeStep: 0.1 })).toBe(0.3);
  });

  it('clamps below minVolume up to the minimum', () => {
    expect(normalizeVolume(0.0001, spec)).toBe(0.01);
  });

  it('clamps above maxVolume down to the maximum', () => {
    expect(normalizeVolume(999, spec)).toBe(10);
  });

  it('respects a coarser volume step', () => {
    const coarse = { minVolume: 0.1, maxVolume: 100, volumeStep: 0.1 };
    expect(normalizeVolume(1.64, coarse)).toBe(1.6);
    expect(normalizeVolume(1.66, coarse)).toBe(1.7);
  });
});
