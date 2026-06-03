import { logger } from './logger';

/**
 * Prevents the same signal from executing twice within a time window.
 *
 * The same Telegram message can arrive via two paths simultaneously:
 *   1. channel_post event (bot is admin of the channel)
 *   2. message event with forward_from_chat (message forwarded to a group/DM)
 *
 * We hash the normalised signal text and reject duplicates seen within
 * WINDOW_MS (default 2 minutes).
 */
export class SignalDeduplicator {
  private readonly seen = new Map<string, number>(); // hash → first-seen timestamp
  private readonly windowMs: number;

  constructor(windowMs = 2 * 60 * 1000) {
    this.windowMs = windowMs;
    // Purge expired entries every 5 minutes so the map doesn't grow unbounded
    setInterval(() => this.purge(), 5 * 60 * 1000).unref();
  }

  /**
   * Returns true if this text was already seen within the dedup window.
   * Records the text on first call so subsequent calls are blocked.
   */
  isDuplicate(text: string): boolean {
    const key = this.normalise(text);
    const now = Date.now();
    const firstSeen = this.seen.get(key);

    if (firstSeen !== undefined && now - firstSeen < this.windowMs) {
      logger.warn(`🔁 Duplicate signal blocked (seen ${Math.round((now - firstSeen) / 1000)}s ago)`);
      return true;
    }

    this.seen.set(key, now);
    return false;
  }

  private normalise(text: string): string {
    // Collapse whitespace, strip emoji/punctuation variation, lowercase
    return text
      .toLowerCase()
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // strip emoji
      .replace(/[^\w\s.,()\-]/g, '')           // strip punctuation noise
      .replace(/\s+/g, ' ')
      .trim();
  }

  private purge(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(key);
    }
  }
}
