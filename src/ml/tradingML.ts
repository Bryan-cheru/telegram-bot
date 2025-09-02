// Smart Market Override ML for Trading Bot
// Solves "Market is closed" server errors during obvious trading hours

import { logger } from '../utils/logger';

interface MarketOverrideDecision {
  shouldOverride: boolean;
  confidence: number;
  reasoning: string;
  suggestedAction: 'PROCEED' | 'WAIT' | 'ABORT';
}

class SmartMarketOverrideML {
  // Intelligent override for server "Market Closed" errors during trading hours
  static analyzeMarketConflict(
    serverStatus: 'CLOSED' | 'OPEN',
    currentTime: Date,
    symbol: string,
    priceDataAvailable: boolean,
    bidAskSpread?: number
  ): MarketOverrideDecision {
    
    const utcHour = currentTime.getUTCHours();
    const dayOfWeek = currentTime.getUTCDay(); // 0=Sunday, 6=Saturday
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
    
    // Forex market hours: Sunday 21:00 UTC - Friday 21:00 UTC
    const isForexTradingHours = !(dayOfWeek === 6 || (dayOfWeek === 0 && utcHour < 21));
    
    let confidence = 0;
    let reasoning = '';
    let shouldOverride = false;
    
    // CASE 1: Server says CLOSED but all indicators say OPEN
    if (serverStatus === 'CLOSED' && isForexTradingHours && priceDataAvailable) {
      confidence = 0.95;
      shouldOverride = true;
      reasoning = `Server error detected: It's ${dayName} ${utcHour}:${currentTime.getUTCMinutes().toString().padStart(2,'0')} UTC with live price data available. Markets should be OPEN.`;
      
      // Extra confidence if spread is normal (indicates active market)
      if (bidAskSpread && bidAskSpread < 10) {
        confidence = 0.98;
        reasoning += ` Tight spread (${bidAskSpread}) confirms active market.`;
      }
      
      return {
        shouldOverride,
        confidence,
        reasoning,
        suggestedAction: 'PROCEED'
      };
    }
    
    // CASE 2: Actual weekend - don't override
    if (!isForexTradingHours) {
      return {
        shouldOverride: false,
        confidence: 0.99,
        reasoning: `Actual weekend closure: ${dayName} ${utcHour}:${currentTime.getUTCMinutes().toString().padStart(2,'0')} UTC`,
        suggestedAction: 'ABORT'
      };
    }
    
    // CASE 3: Unclear situation
    return {
      shouldOverride: false,
      confidence: 0.5,
      reasoning: `Unclear market status for ${symbol} at ${dayName} ${utcHour}:${currentTime.getUTCMinutes().toString().padStart(2,'0')} UTC`,
      suggestedAction: 'WAIT'
    };
  }
}

export { SmartMarketOverrideML, MarketOverrideDecision };
