import { logger } from './logger';

/**
 * Fetches and formats open positions from the trade executor.
 * Used by /positions command and the startup summary.
 */
export async function getOpenPositionsSummary(tradeExecutor: any): Promise<string> {
  try {
    const isConnected = await tradeExecutor.isConnected();
    if (!isConnected) return '⚠️ Not connected to broker — cannot fetch positions.';

    const positions = await tradeExecutor.getOpenPositions?.() ?? [];

    // executor returns a formatted string or an array
    if (typeof positions === 'string') return positions;

    if (!Array.isArray(positions) || positions.length === 0) {
      return '📊 No open positions.';
    }

    const lines = [`📊 *Open Positions (${positions.length})*`, ``];
    for (const p of positions) {
      const side = (p.type ?? '').includes('BUY') ? '🟢 BUY' : '🔴 SELL';
      const pnl = (p.unrealizedProfit ?? 0) >= 0
        ? `+$${(p.unrealizedProfit ?? 0).toFixed(2)}`
        : `-$${Math.abs(p.unrealizedProfit ?? 0).toFixed(2)}`;
      lines.push(`${side} *${p.symbol}* | ${p.volume} lots | P&L: ${pnl}`);
      if (p.stopLoss) lines.push(`   SL: ${p.stopLoss.toFixed(2)} | TP: ${p.takeProfit?.toFixed(2) ?? 'N/A'}`);
    }

    return lines.join('\n');
  } catch (error) {
    logger.error('positionsMonitor: error fetching positions:', error);
    return '❌ Error fetching positions.';
  }
}
