import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { logger } from '../utils/logger';
import { TradeSignal } from '../types';
import { SymbolParser } from '../shared/SymbolParser';
import { calculateFixedDollarStopsAndTargets } from '../trading/riskMath';
import { config } from '../utils/config';

// Compressed image dimensions sent to Claude — balances accuracy vs API latency/cost.
// Claude vision charges per 1600-token tile; keeping width ≤ 1024 fits in one tile.
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 82;

// Tight timeout for Hostinger → Anthropic API (EU → US).
// Haiku typically responds in 1–2.5 s; 15 s leaves headroom for slow links.
const API_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a professional forex/commodities trading signal parser.

Analyze the message text and/or chart image and extract the trade parameters.

Respond ONLY with a single JSON object — no markdown fences, no prose:

If a valid trade entry signal is present:
{"symbol":"XAUUSD","action":"BUY","entry":2345.50,"entryMin":2340.00,"entryMax":2350.00,"stopLoss":2320.00,"targets":[2380.00,2410.00],"orderType":"LIMIT","confidence":0.9,"reasoning":"one-line reason"}

If this is commentary, news, a closed-trade result, or not a new entry signal:
{"signal":false}

Rules:
- symbol: valid MT5 symbol (EURUSD, XAUUSD, GBPJPY, NAS100, BTCUSD…). Use XAUUSD not GOLD, XAGUSD not SILVER.
- action: "BUY" or "SELL" only.
- BUY invariant: stopLoss < entry < targets[0].
- SELL invariant: stopLoss > entry > targets[0].
- entry / entryMin / entryMax: omit (or null) for a market order.
- Chart colour semantics: green zone at support = BUY entry; red zone below = BUY stop; green zone above current price = BUY target.
- Text keywords take priority: "support", "demand zone", "buy zone", "bullish" → BUY; "resistance", "supply zone", "sell zone", "bearish" → SELL.
- Only output fields you are confident about; omit uncertain ones rather than guessing.`;

export class ClaudeSignalParser {
  private static _client: Anthropic | null = null;

  private static getClient(): Anthropic {
    if (!this._client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured — add it to your .env file');
      }
      this._client = new Anthropic({ apiKey, timeout: API_TIMEOUT_MS });
    }
    return this._client;
  }

  /**
   * Main entry point.  Returns a TradeSignal or null (never throws).
   */
  static async parse(
    text: string,
    caption: string | undefined,
    imageBuffer: Buffer | undefined
  ): Promise<TradeSignal | null> {
    const fullText = [text, caption].filter(Boolean).join('\n').trim();

    try {
      return await this.callWithRetry(fullText, imageBuffer);
    } catch (err: any) {
      logger.error('❌ ClaudeSignalParser: all attempts failed —', err?.message ?? err);
      return null;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private static async callWithRetry(
    text: string,
    imageBuffer?: Buffer
  ): Promise<TradeSignal | null> {
    const MAX_ATTEMPTS = 2;
    let lastErr: any;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.callClaude(text, imageBuffer);
      } catch (err: any) {
        lastErr = err;
        const status: number = err?.status ?? 0;
        const isRetryable =
          status >= 500 ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'UND_ERR_CONNECT_TIMEOUT';

        if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;

        logger.warn(`⚠️ Claude API attempt ${attempt} failed (${err?.message}), retrying in 2 s…`);
        await new Promise(r => setTimeout(r, 2_000));
      }
    }

    throw lastErr;
  }

  private static async callClaude(
    text: string,
    imageBuffer?: Buffer
  ): Promise<TradeSignal | null> {
    const content: Anthropic.MessageParam['content'] = [];

    if (imageBuffer) {
      const compressed = await this.compressImage(imageBuffer);
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: compressed.toString('base64')
        }
      });
    }

    content.push({
      type: 'text',
      text: text
        ? `Signal text:\n${text}\n\nExtract the trade signal.`
        : 'Extract the trade signal from the chart image above.'
    });

    const t0 = Date.now();
    const response = await this.getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 450,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }]
    });

    const elapsed = Date.now() - t0;
    const { input_tokens, output_tokens } = response.usage;
    logger.info(
      `🤖 Claude AI: ${elapsed}ms | ${input_tokens} in / ${output_tokens} out tokens` +
      ` (~$${((input_tokens * 0.0008 + output_tokens * 0.004) / 1000).toFixed(4)})`
    );

    const block = response.content[0];
    if (block.type !== 'text') return null;

    return this.parseResponse(block.text.trim());
  }

  private static async compressImage(buf: Buffer): Promise<Buffer> {
    const meta = await sharp(buf).metadata();
    const needsResize = meta.width && meta.width > MAX_IMAGE_WIDTH;
    return sharp(buf)
      .resize(needsResize ? { width: MAX_IMAGE_WIDTH } : undefined)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  }

  private static parseResponse(raw: string): TradeSignal | null {
    // Strip markdown code fences if Claude wraps the JSON despite instructions
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('⚠️ Claude returned no JSON:', raw.slice(0, 200));
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      logger.warn('⚠️ Claude JSON parse error on:', jsonMatch[0].slice(0, 200));
      return null;
    }

    if (parsed.signal === false || !parsed.symbol || !parsed.action) {
      logger.info('ℹ️ Claude: no valid trade signal in this message');
      return null;
    }

    return this.buildSignal(parsed);
  }

  private static buildSignal(p: any): TradeSignal | null {
    const symbol = SymbolParser.normalizeSymbol(String(p.symbol));
    if (!symbol || symbol.length < 3) {
      logger.warn(`⚠️ Claude returned unrecognised symbol: ${p.symbol}`);
      return null;
    }

    const action: 'BUY' | 'SELL' =
      String(p.action).toUpperCase() === 'SELL' ? 'SELL' : 'BUY';

    // ── Entry zone ────────────────────────────────────────────────────────
    let entryZone: { min: number; max: number };
    const eMin = parseFloat(p.entryMin);
    const eMax = parseFloat(p.entryMax);
    const eMid = parseFloat(p.entry);

    if (!isNaN(eMin) && !isNaN(eMax) && eMin > 0 && eMin < eMax) {
      entryZone = { min: eMin, max: eMax };
    } else if (!isNaN(eMid) && eMid > 0) {
      // Tiny zone around the exact price so the executor places a LIMIT order
      const half = eMid * 0.0002;
      entryZone = { min: eMid - half, max: eMid + half };
    } else {
      // No price info → market order (executor treats min===max===0 as MARKET)
      entryZone = { min: 0, max: 0 };
    }

    const isMarket = entryZone.min === 0 && entryZone.max === 0;
    const entryMidPrice = isMarket
      ? 0
      : (entryZone.min + entryZone.max) / 2;

    // ── SL / TP ───────────────────────────────────────────────────────────
    let stopLoss = parseFloat(p.stopLoss);
    let targets: number[] = Array.isArray(p.targets)
      ? (p.targets as any[]).map(t => parseFloat(t)).filter(t => !isNaN(t) && t > 0)
      : [];

    // Fall back to risk-based calculation when Claude omits levels
    const needsCalc =
      (!stopLoss || isNaN(stopLoss) || targets.length === 0) && entryMidPrice > 0;

    if (needsCalc) {
      const lotSize    = config.trading.fixedLotSize;
      const riskAmount = config.trading.fixedRiskAmount;
      const rr         = parseFloat(process.env.RISK_REWARD_RATIO ?? '1.5');

      const calc = calculateFixedDollarStopsAndTargets({
        symbol,
        entryPrice: entryMidPrice,
        direction: action,
        config: { lotSize, riskAmount, riskRewardRatio: rr }
      });

      if (isNaN(stopLoss) || !stopLoss) stopLoss = calc.stopLoss;
      if (targets.length === 0) targets = calc.targets;
    }

    logger.info(
      `✅ Claude parsed: ${action} ${symbol} | entry ${entryMidPrice || 'MARKET'} | SL ${stopLoss} | TP ${targets[0]}`
    );

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets,
      orderType: isMarket ? 'MARKET' : (p.orderType ?? 'LIMIT'),
      reason: `Claude AI: ${p.reasoning ?? 'chart/text analysis'}`,
      plan: 'Claude Haiku vision + text analysis',
      confidence: parseFloat(p.confidence) || 0.85
    };
  }
}
