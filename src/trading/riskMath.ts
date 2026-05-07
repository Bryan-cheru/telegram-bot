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

export function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return 0.01;
  if (isForexPair(s)) return 0.0001;
  // Metals/indices/crypto: treat “pip” as 1 point/dollar unless broker specs are used
  return 1;
}

/**
 * Pip value per 1.0 lot. This is a simplification; for full MetaAPI compliance,
 * you should prefer broker-provided symbol specification (tickValue/tickSize/contractSize).
 */
export function getPipValuePerLot(symbol: string): number {
  const s = symbol.toUpperCase();

  // Forex
  if (s.includes('JPY')) return 10;
  if (isForexPair(s)) return 10;

  // Metals
  if (['XAUUSD', 'GOLD'].includes(s)) return 100;
  if (['XAGUSD', 'SILVER'].includes(s)) return 5000;

  // Indices / crypto (fallback)
  return 1;
}

export function formatPriceForInstrument(price: number, symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return Number(price.toFixed(3));
  if (isForexPair(s)) return Number(price.toFixed(5));
  if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(s)) return Number(price.toFixed(2));
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

