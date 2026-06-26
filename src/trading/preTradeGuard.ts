/**
 * Single source of truth for pre-trade safety checks.
 *
 * Previously these guards lived only in the bot's text-signal path, so the
 * image/Claude path, manual commands, and the dashboard /api/mt5/manual-trade
 * endpoint could all place trades with NO dedup and NO daily-loss limit. This
 * class is owned by the executor and invoked inside executeTradeSignal — the one
 * chokepoint every entry path funnels through — so the limits cannot be bypassed.
 */
import { TradeSignal } from '../types';
import { SignalDeduplicator } from '../utils/signalDeduplicator';
import { DailyLossTracker } from '../utils/dailyLossTracker';

export interface GuardDecision {
  allowed: boolean;
  reason?: string;
}

export class PreTradeGuard {
  private readonly dedup = new SignalDeduplicator();
  /** Exposed so the bot/dashboard can read stats and feed balance updates into the same instance. */
  public readonly daily: DailyLossTracker;

  constructor(maxDailyTrades: number, dailyLossLimitUsd: number) {
    this.daily = new DailyLossTracker(maxDailyTrades, dailyLossLimitUsd);
  }

  /**
   * Run all non-mutating pre-trade checks. Order matters: cheapest/structural
   * first, then daily limits, then dedup (which records the signal as seen).
   * Call recordExecuted() only after a trade actually places.
   */
  check(signal: TradeSignal): GuardDecision {
    const structural = this.validateStructure(signal);
    if (!structural.allowed) return structural;

    const daily = this.daily.canTrade();
    if (!daily.allowed) return { allowed: false, reason: daily.reason };

    if (this.dedup.isDuplicate(this.signalKey(signal))) {
      return { allowed: false, reason: 'duplicate signal (same symbol/action/levels within dedup window)' };
    }

    return { allowed: true };
  }

  /** Record a successfully placed trade against the daily counter. */
  recordExecuted(): void {
    this.daily.recordTrade();
  }

  /**
   * Reject structurally impossible signals before they reach the broker.
   * Note: SL/TP may legitimately be absent here (the executor derives them from
   * risk config downstream), so we only reject when present-and-inverted —
   * e.g. a BUY whose stop sits above entry, which would be a catastrophic flip.
   */
  private validateStructure(signal: TradeSignal): GuardDecision {
    if (!signal.symbol || signal.symbol.length < 3) {
      return { allowed: false, reason: `invalid symbol "${signal.symbol}"` };
    }
    if (signal.action !== 'BUY' && signal.action !== 'SELL') {
      return { allowed: false, reason: `invalid action "${signal.action}"` };
    }

    const entry = this.entryPrice(signal);
    const sl = typeof signal.stopLoss === 'number' && signal.stopLoss > 0 ? signal.stopLoss : undefined;
    const tp = Array.isArray(signal.targets) && signal.targets.length > 0 && signal.targets[0] > 0
      ? signal.targets[0]
      : undefined;

    // Only validate sides when we actually have an entry price to compare against.
    if (entry > 0) {
      if (sl !== undefined) {
        if (signal.action === 'BUY' && sl >= entry) {
          return { allowed: false, reason: `BUY stop ${sl} is at/above entry ${entry} (inverted)` };
        }
        if (signal.action === 'SELL' && sl <= entry) {
          return { allowed: false, reason: `SELL stop ${sl} is at/below entry ${entry} (inverted)` };
        }
      }
      if (tp !== undefined) {
        if (signal.action === 'BUY' && tp <= entry) {
          return { allowed: false, reason: `BUY target ${tp} is at/below entry ${entry} (inverted)` };
        }
        if (signal.action === 'SELL' && tp >= entry) {
          return { allowed: false, reason: `SELL target ${tp} is at/above entry ${entry} (inverted)` };
        }
      }
    }

    return { allowed: true };
  }

  private entryPrice(signal: TradeSignal): number {
    const z = signal.entryZone;
    if (z && z.min > 0 && z.max > 0) return (z.min + z.max) / 2;
    return 0; // market order — no fixed entry to validate against
  }

  /** Identity used for cross-path dedup: same setup from image + text + manual = one trade. */
  private signalKey(signal: TradeSignal): string {
    const entry = this.entryPrice(signal);
    const sl = typeof signal.stopLoss === 'number' ? signal.stopLoss : 0;
    return `${signal.symbol}|${signal.action}|${entry}|${sl}`;
  }
}
