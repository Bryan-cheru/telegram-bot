import { logger } from './logger';

/**
 * Tracks trades and P&L for the current UTC day.
 * Resets automatically at midnight UTC.
 * Two independent circuit breakers:
 *   1. Max trades per day — prevent runaway signal execution
 *   2. Daily loss limit — stop if balance has dropped too much today
 */
export class DailyLossTracker {
  private tradesCount = 0;
  private realizedLoss = 0;   // cumulative loss in USD (positive = loss)
  private openingBalance: number | null = null;
  private lastResetDay = this.utcDay();

  constructor(
    private readonly maxDailyTrades: number,
    private readonly dailyLossLimitUsd: number
  ) {}

  /** Call once when the bot connects to record the day's starting balance. */
  setOpeningBalance(balance: number): void {
    if (this.openingBalance === null) {
      this.openingBalance = balance;
      logger.info(`📅 Daily tracker: opening balance $${balance.toFixed(2)}, max trades ${this.maxDailyTrades}, loss limit $${this.dailyLossLimitUsd}`);
    }
  }

  /** Returns false and logs reason if trading should be blocked. */
  canTrade(): { allowed: boolean; reason?: string } {
    this.maybeReset();

    if (this.tradesCount >= this.maxDailyTrades) {
      return { allowed: false, reason: `daily trade limit reached (${this.tradesCount}/${this.maxDailyTrades})` };
    }

    // Check loss limit regardless of whether opening balance was captured.
    // If openingBalance is null (MetaAPI never connected), realizedLoss stays 0
    // and the guard is a no-op — but it will engage correctly once balance updates flow in.
    if (this.realizedLoss >= this.dailyLossLimitUsd) {
      return { allowed: false, reason: `daily loss limit reached ($${this.realizedLoss.toFixed(2)} / $${this.dailyLossLimitUsd})` };
    }

    return { allowed: true };
  }

  /** Call after a trade is successfully placed. */
  recordTrade(): void {
    this.maybeReset();
    this.tradesCount++;
    logger.info(`📊 Daily tracker: ${this.tradesCount}/${this.maxDailyTrades} trades today`);
  }

  /**
   * Call after each trade closes or after fetching current balance.
   * Pass the current account balance; loss is inferred from opening balance.
   */
  updateBalance(currentBalance: number): void {
    this.maybeReset();
    if (this.openingBalance === null) {
      this.openingBalance = currentBalance;
      return;
    }
    const drop = this.openingBalance - currentBalance;
    if (drop > this.realizedLoss) {
      this.realizedLoss = drop;
      logger.info(`📉 Daily tracker: balance dropped $${drop.toFixed(2)} from opening $${this.openingBalance.toFixed(2)}`);
    }
  }

  getStats(): { tradesCount: number; realizedLoss: number; maxTrades: number; lossLimit: number } {
    return {
      tradesCount: this.tradesCount,
      realizedLoss: this.realizedLoss,
      maxTrades: this.maxDailyTrades,
      lossLimit: this.dailyLossLimitUsd
    };
  }

  private maybeReset(): void {
    const today = this.utcDay();
    if (today !== this.lastResetDay) {
      logger.info(`🌅 New UTC day — resetting daily trade tracker`);
      this.tradesCount = 0;
      this.realizedLoss = 0;
      this.openingBalance = null;
      this.lastResetDay = today;
    }
  }

  private utcDay(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  }
}
