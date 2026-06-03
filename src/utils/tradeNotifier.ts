import { Telegraf } from 'telegraf';
import { logger } from './logger';
import { config } from './config';
import { TradeSignal } from '../types';

export class TradeNotifier {
  private bot: Telegraf;
  private chatId: string;

  constructor(bot: Telegraf) {
    this.bot = bot;
    this.chatId = config.notificationChatId;
  }

  async tradeOpened(signal: TradeSignal, ticket: string | number, brokerName: string, lotSize: number): Promise<void> {
    if (!this.chatId) return;
    const direction = signal.action === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    const entry = signal.entryPrice
      ? signal.entryPrice.toFixed(2)
      : `${signal.entryZone.min.toFixed(2)}–${signal.entryZone.max.toFixed(2)}`;
    const orderType = signal.orderType === 'MARKET' ? 'MARKET' : `LIMIT @ ${entry}`;

    const msg = [
      `✅ *TRADE OPENED*`,
      ``,
      `${direction} *${signal.symbol}*`,
      `📋 Order: ${orderType}`,
      `🛑 SL: ${signal.stopLoss?.toFixed(2) ?? 'N/A'}`,
      `🎯 TP: ${signal.targets?.[0]?.toFixed(2) ?? 'N/A'}`,
      `📦 Volume: ${lotSize} lots`,
      `🏦 ${brokerName} | Ticket: #${ticket}`,
    ].join('\n');

    await this.send(msg);
  }

  async tradeFailed(signal: TradeSignal, reason: string, brokerName: string): Promise<void> {
    if (!this.chatId) return;
    const direction = signal.action === 'BUY' ? '🟢 BUY' : '🔴 SELL';

    const msg = [
      `❌ *TRADE FAILED*`,
      ``,
      `${direction} *${signal.symbol}*`,
      `⚠️ Reason: ${reason}`,
      `🏦 ${brokerName}`,
    ].join('\n');

    await this.send(msg);
  }

  async dailyLimitHit(tradesCount: number, maxTrades: number): Promise<void> {
    if (!this.chatId) return;
    const msg = [
      `🛑 *DAILY TRADE LIMIT REACHED*`,
      ``,
      `Trades today: ${tradesCount}/${maxTrades}`,
      `Trading paused until midnight UTC.`,
      `Signals will still be logged but not executed.`,
    ].join('\n');

    await this.send(msg);
  }

  async dailyLossLimitHit(currentLoss: number, limitUsd: number): Promise<void> {
    if (!this.chatId) return;
    const msg = [
      `🛑 *DAILY LOSS LIMIT REACHED*`,
      ``,
      `Loss today: $${currentLoss.toFixed(2)} / $${limitUsd.toFixed(2)}`,
      `Trading paused until midnight UTC.`,
    ].join('\n');

    await this.send(msg);
  }

  async positionsSummary(positions: any[]): Promise<void> {
    if (!this.chatId) return;
    if (positions.length === 0) {
      await this.send(`📊 *No open positions*`);
      return;
    }

    const lines = [`📊 *Open Positions (${positions.length})*`, ``];
    for (const p of positions) {
      const side = p.type === 'POSITION_TYPE_BUY' ? '🟢 BUY' : '🔴 SELL';
      const pnl = p.unrealizedProfit >= 0
        ? `+$${p.unrealizedProfit.toFixed(2)}`
        : `-$${Math.abs(p.unrealizedProfit).toFixed(2)}`;
      lines.push(`${side} ${p.symbol} | ${p.volume} lots | P&L: ${pnl}`);
      if (p.stopLoss) lines.push(`   SL: ${p.stopLoss} | TP: ${p.takeProfit ?? 'N/A'}`);
    }

    await this.send(lines.join('\n'));
  }

  private async send(text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(this.chatId, text, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.warn('TradeNotifier: failed to send message:', error);
    }
  }
}
