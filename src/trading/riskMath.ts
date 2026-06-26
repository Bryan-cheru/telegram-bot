import { logger } from '../utils/logger';

export type TradeDirection = 'BUY' | 'SELL';

export interface FixedDollarRiskConfig {
  lotSize: number;
  riskAmount: number;
  riskRewardRatio: number;
}

export function isForexPair(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.length === 6 && /^[A-Z]{6}$/.test(s);
}

// Crypto bases that, like metals, are 6-letter symbols (BTCUSD, ETHUSD) and would
// otherwise be misclassified as forex by isForexPair — giving a 0.0001 pip size and
// $10/pip value, which overstates per-lot risk ~6,000,000× and collapses risk-based
// sizing to the 0.01 floor. This is a heuristic fallback only; the executor prefers
// the broker's symbol specification (see trading/brokerSpec.ts) when available.
const CRYPTO_BASES = [
  'BTC', 'XBT', 'ETH', 'LTC', 'BCH', 'XRP', 'ADA', 'DOT', 'SOL', 'DOGE',
  'BNB', 'LINK', 'AVAX', 'MATIC', 'UNI', 'ATOM', 'ETC', 'XLM', 'TRX'
];

export function isCrypto(symbol: string): boolean {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  return CRYPTO_BASES.some(base => s.startsWith(base));
}

export function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  // Crypto first — BTCUSD/ETHUSD are 6 letters and would otherwise hit isForexPair.
  // Treat 1.0 price unit as one "pip" (1 lot ≈ 1 coin, so $1 move ≈ $1/lot P&L).
  if (isCrypto(s)) return 1.0;
  if (s.includes('JPY')) return 0.01;
  // Metals must be checked before isForexPair — XAUUSD/XAGUSD are 6-letter symbols
  // and would otherwise fall through to the forex 0.0001 pip size
  if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(s)) return 1.0;
  if (isForexPair(s)) return 0.0001;
  return 1;
}

/**
 * Pip value per 1.0 lot. This is a simplification; for full MetaAPI compliance,
 * you should prefer broker-provided symbol specification (tickValue/tickSize/contractSize).
 */
export function getPipValuePerLot(symbol: string): number {
  const s = symbol.toUpperCase();

  // Crypto first — must precede isForexPair (BTCUSD/ETHUSD are 6 letters).
  // With pipSize 1.0 above, $1 of price move on 1.0 lot ≈ $1 P&L (contractSize ≈ 1).
  if (isCrypto(s)) return 1;

  // Metals must be checked before isForexPair — same reason as getPipSize
  if (['XAUUSD', 'GOLD'].includes(s)) return 100;
  if (['XAGUSD', 'SILVER'].includes(s)) return 5000;

  // Forex
  if (s.includes('JPY')) return 10;
  if (isForexPair(s)) return 10;

  // Indices (fallback)
  return 1;
}

function isSyntheticVolIndex(symbol: string): boolean {
  return /^V\d{1,3}$/i.test(symbol.trim());
}

export function formatPriceForInstrument(price: number, symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return Number(price.toFixed(3));
  // Crypto & metals must precede isForexPair — they are also 6-letter symbols and
  // would otherwise be formatted to 5 decimals, which brokers reject for these
  // instruments (e.g. gold/BTC quote to 2 decimals).
  if (isCrypto(s)) return Number(price.toFixed(2));
  if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(s)) return Number(price.toFixed(2));
  if (isForexPair(s)) return Number(price.toFixed(5));
  if (isSyntheticVolIndex(s)) return Number(price.toFixed(2));
  return Number(price.toFixed(5));
}

export function calculateFixedDollarStopsAndTargets(args: {
  symbol: string;
  entryPrice: number;
  direction: TradeDirection;
  config: FixedDollarRiskConfig;
}): { stopLoss: number; targets: number[] } {
  const { symbol, entryPrice, direction, config } = args;
  const pipValuePerLot = getPipValuePerLot(symbol);
  const pipSize = getPipSize(symbol);

  const stopDistanceInPips = config.riskAmount / (pipValuePerLot * config.lotSize);
  const stopDistance = stopDistanceInPips * pipSize;

  const rewardAmount = config.riskAmount * config.riskRewardRatio;
  const targetDistanceInPips = rewardAmount / (pipValuePerLot * config.lotSize);
  const targetDistance = targetDistanceInPips * pipSize;

  const stopLoss = direction === 'BUY' ? entryPrice - stopDistance : entryPrice + stopDistance;
  const target = direction === 'BUY' ? entryPrice + targetDistance : entryPrice - targetDistance;

  logger.info(`📐 Fixed-$ risk calc (${symbol}):`, {
    entryPrice,
    direction,
    lotSize: config.lotSize,
    riskAmount: config.riskAmount,
    riskRewardRatio: config.riskRewardRatio,
    pipValuePerLot,
    pipSize,
    stopDistanceInPips,
    targetDistanceInPips
  });

  return { stopLoss, targets: [target] };
}

