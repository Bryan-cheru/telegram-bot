import { TradeSignal } from '../types';
import { logger } from '../utils/logger';

export class TradeParser {
  parseTradeSignal(text: string): TradeSignal | null {
    try {
      logger.info('Parsing trade signal from text');
      logger.debug('Input text for parsing:', text);
      
      // Clean up the text for better parsing
      const cleanText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      logger.debug('Cleaned text:', cleanText);
      
      // Extract symbol - more flexible patterns
      let symbolMatch = cleanText.match(/#([A-Z]+(?:USD)?)\s*(?:\([^)]*\))?\s*(Buy|Sell)\s*Setup/i);
      if (!symbolMatch) {
        // Try alternative patterns
        symbolMatch = cleanText.match(/([A-Z]+(?:USD)?)\s*(?:\([^)]*\))?\s*(Buy|Sell)/i);
      }
      if (!symbolMatch) {
        logger.warn('No symbol found in text');
        logger.debug('Attempted to match symbol patterns in:', cleanText);
        return null;
      }
      
      const symbol = symbolMatch[1].toUpperCase();
      const action = symbolMatch[2].toUpperCase() as 'BUY' | 'SELL';
      logger.info(`Found symbol: ${symbol}, action: ${action}`);
      
      // Extract entry zone - more flexible patterns
      let entryZoneMatch = cleanText.match(/(?:Selling|Buying)\s*Zone[:\s]*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
      if (!entryZoneMatch) {
        // Try alternative patterns
        entryZoneMatch = cleanText.match(/(?:Entry|Zone)[:\s]*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
      }
      if (!entryZoneMatch) {
        logger.warn('No entry zone found in text');
        logger.debug('Attempted to match entry zone patterns in:', cleanText);
        return null;
      }
      
      const entryZone = {
        min: parseFloat(entryZoneMatch[1]),
        max: parseFloat(entryZoneMatch[2])
      };
      logger.info(`Found entry zone: ${entryZone.min} - ${entryZone.max}`);
      
      // Extract stop loss - more flexible patterns
      let stopLossMatch = cleanText.match(/Stop\s*Loss[:\s]*(\d+(?:\.\d+)?)/i);
      if (!stopLossMatch) {
        stopLossMatch = cleanText.match(/SL[:\s]*(\d+(?:\.\d+)?)/i);
      }
      if (!stopLossMatch) {
        logger.warn('No stop loss found in text');
        logger.debug('Attempted to match stop loss patterns in:', cleanText);
        return null;
      }
      
      const stopLoss = parseFloat(stopLossMatch[1]);
      logger.info(`Found stop loss: ${stopLoss}`);
      
      // Extract targets - more flexible patterns
      const targetMatches = cleanText.match(/(?:Target\s*\d+|Final\s*Target)[:\s]*(\d+(?:\.\d+)?)/gi);
      const targets: number[] = [];
      
      if (targetMatches) {
        targetMatches.forEach(match => {
          // Extract the price value after the colon or space
          const targetValue = match.match(/[:\s](\d+(?:\.\d+)?)/);
          if (targetValue) {
            targets.push(parseFloat(targetValue[1]));
          }
        });
      }
      
      if (targets.length === 0) {
        logger.warn('No targets found in text');
        logger.debug('Attempted to match target patterns in:', cleanText);
        return null;
      }
      
      logger.info(`Found ${targets.length} targets:`, targets);
      
      // Extract reason
      const reasonMatch = cleanText.match(/Reason[:\s]*([^.]+)/i);
      const reason = reasonMatch ? reasonMatch[1].trim() : undefined;
      
      // Extract plan
      const planMatch = cleanText.match(/Plan[:\s]*([^.]+)/i);
      const plan = planMatch ? planMatch[1].trim() : undefined;
      
      const tradeSignal: TradeSignal = {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets,
        reason,
        plan
      };
      
      logger.info('Trade signal parsed successfully:', tradeSignal);
      return tradeSignal;
      
    } catch (error) {
      logger.error('Error parsing trade signal:', error);
      return null;
    }
  }
  
  validateTradeSignal(signal: TradeSignal): boolean {
    // Basic validation
    if (!signal.symbol || !signal.action) {
      return false;
    }
    
    if (signal.entryZone.min >= signal.entryZone.max) {
      return false;
    }
    
    if (signal.targets.length === 0) {
      return false;
    }
    
    // Validate stop loss positioning
    if (signal.action === 'BUY') {
      if (signal.stopLoss >= signal.entryZone.min) {
        return false;
      }
    } else {
      if (signal.stopLoss <= signal.entryZone.max) {
        return false;
      }
    }
    
    return true;
  }
}
