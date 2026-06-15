import { logger } from '../../utils/logger';
import { TradeSignal } from '../../types';
import { ClaudeSignalParser } from '../claudeSignalParser';

/**
 * ML integration layer — now powered by Claude AI vision.
 *
 * Previously used a custom pixel-scanner (VisualChartAnalysisML + Tesseract OCR).
 * Replaced with Claude Haiku which understands chart images and signal text natively,
 * removing ~1 500 lines of brittle computer-vision heuristics.
 */
export class CleanMLIntegration {

  /**
   * Parse a signal that the text-first deterministic parser could not handle.
   * Typically called when there is a chart image with no explicit price numbers in the text.
   */
  static async parseWithML(
    text: string,
    caption?: string,
    hasChartImage?: boolean,
    imageBuffer?: Buffer
  ): Promise<TradeSignal | null> {
    logger.info('🤖 CleanMLIntegration → Claude AI');

    // Guard: Claude without an image or text cannot do much
    const hasContent = (text?.trim().length ?? 0) > 5 || (caption?.trim().length ?? 0) > 5;
    if (!hasContent && !hasChartImage) {
      logger.debug('❌ Skipping Claude — no meaningful content to analyse');
      return null;
    }

    return ClaudeSignalParser.parse(text ?? '', caption, imageBuffer);
  }

  static getPerformanceStats() {
    return {
      enabled: true,
      engine: 'Claude Haiku (claude-haiku-4-5-20251001)',
      avgLatency: '1.5–3 s (Hostinger EU → Anthropic US)',
      costPerSignal: '~$0.002',
      features: ['Vision', 'Natural-language text', 'Structured JSON output']
    };
  }
}
