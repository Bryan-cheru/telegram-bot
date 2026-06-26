/**
 * Broker-authoritative symbol specification, read from a MetaAPI streaming
 * connection's terminalState. This is the correct source for lot sizing and
 * volume rounding — far more reliable than the heuristic pip model in riskMath.ts,
 * which can only guess from the symbol string (and historically misclassified
 * BTCUSD as forex, collapsing risk-based sizing to the 0.01 floor).
 *
 * Returns null for RPC connections, or when the symbol has not yet synchronized —
 * callers must then fall back to the riskMath heuristic.
 */
import { logger } from '../utils/logger';

export interface BrokerSymbolSpec {
  tickSize: number;
  /** Account-currency value of one adverse tick for 1.0 lot (NaN if price not synced). */
  tickValue: number;
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  digits: number;
}

export function getBrokerSymbolSpec(connection: any, symbol: string): BrokerSymbolSpec | null {
  try {
    const ts = connection?.terminalState;
    if (!ts || typeof ts.specification !== 'function') return null;

    const spec = ts.specification(symbol);
    if (!spec || !isFinite(spec.tickSize) || spec.tickSize <= 0) return null;

    // Tick value lives on the price object, not the spec. lossTickValue is the
    // value of one adverse tick per 1.0 lot — the conservative choice for risk.
    const price = typeof ts.price === 'function' ? ts.price(symbol) : undefined;
    const tickValue =
      price && isFinite(price.lossTickValue) && price.lossTickValue > 0
        ? price.lossTickValue
        : NaN;

    return {
      tickSize: spec.tickSize,
      tickValue,
      contractSize: isFinite(spec.contractSize) ? spec.contractSize : NaN,
      minVolume: isFinite(spec.minVolume) && spec.minVolume > 0 ? spec.minVolume : 0.01,
      maxVolume: isFinite(spec.maxVolume) && spec.maxVolume > 0 ? spec.maxVolume : Number.POSITIVE_INFINITY,
      volumeStep: isFinite(spec.volumeStep) && spec.volumeStep > 0 ? spec.volumeStep : 0.01,
      digits: isFinite(spec.digits) ? spec.digits : 2
    };
  } catch (e: any) {
    logger.warn(`⚠️ Could not read broker spec for ${symbol}: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Snap a desired volume to the broker's volume step, then clamp to [min, max].
 * Rounds to the nearest step and corrects float drift (e.g. 0.30000000000000004).
 */
export function normalizeVolume(
  volume: number,
  spec: { minVolume: number; maxVolume: number; volumeStep: number }
): number {
  const step = spec.volumeStep > 0 ? spec.volumeStep : 0.01;
  let v = Math.round(volume / step) * step;
  v = Math.round(v * 1e8) / 1e8; // kill binary-float dust
  v = Math.max(spec.minVolume, Math.min(v, spec.maxVolume));
  return v;
}
