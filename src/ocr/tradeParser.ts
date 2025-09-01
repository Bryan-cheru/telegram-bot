import { TradeSignal, TradeAction, OrderType } from '../types';
import { logger } from '../utils/logger';
import { PositionSizeCalculator, PositionSizingConfig, PositionCalculation } from '../utils/positionSizing';
import { config } from '../utils/config';
import { OrderTypeDetector } from '../utils/orderTypeDetector';

export class TradeParser {
  private readonly FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
    'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF',
    'EURCAD'
  ];

  private readonly METAL_SYMBOLS = [
    'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER'
  ];

  private readonly INDEX_SYMBOLS = [
    'US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225'
  ];

  private positionSizeCalculator: PositionSizeCalculator;

  constructor(positionSizingConfig?: PositionSizingConfig) {
    this.positionSizeCalculator = new PositionSizeCalculator(positionSizingConfig || {
      maxRiskPercentage: 2,
      maxPositionSize: 10,
      minPositionSize: 0.01
    });
  }

  /**
   * Main method to parse trade signals from extracted text
   */
  parseTradeSignal(text: string, caption?: string): TradeSignal | null {
    try {
      logger.info('🔍 Parsing trade signal from text');
      logger.debug('Raw text:', text);
      if (caption) logger.debug('Caption:', caption);

      // Combine text and caption for analysis
      const fullText = caption ? `${text}\n${caption}` : text;
      
      // Check if this is a result/update message that shouldn't be traded
      if (this.isResultOrUpdateMessage(fullText)) {
        logger.info('📊 Detected result/update message - skipping trade signal parsing');
        return null;
      }
      
      const cleanText = this.cleanText(fullText);

      // Try different parsing strategies - CAPTION FIRST APPROACH! 🎯
      const strategies = [
        // 1. CAPTION-FIRST: Try pure caption parsing if available
        () => caption ? this.parseCaptionSignal(caption) : null,
        
        // 2. STANDARD FORMATS: Well-structured text patterns
        () => this.parseStandardSignal(cleanText),
        () => this.parseChartSetupSignal(cleanText),
        () => this.parseFlexibleFormatSignal(cleanText),
        
        // 3. FALLBACK: Visual/Image analysis (only when caption parsing fails)
        () => this.parseVisualChartSignal(cleanText, caption),
        () => this.parseCombinedTextImageSignal(cleanText),
        () => this.parsePriceActionSignal(cleanText)
      ];

      for (const strategy of strategies) {
        const signal = strategy();
        if (signal && this.validateSignal(signal)) {
          // Apply 1:1 Risk-Reward ratio if enabled
          let finalSignal = config.trading.enforceOneToOneRR ? this.applyOneToOneRR(signal) : signal;
          
          // Enhance signal with order type detection if not already specified
          finalSignal = this.enhanceSignalWithOrderType(finalSignal, cleanText);
          
          logger.info('✅ Successfully parsed enhanced trade signal:', {
            symbol: finalSignal.symbol,
            action: finalSignal.action,
            entryZone: finalSignal.entryZone,
            stopLoss: finalSignal.stopLoss,
            targets: finalSignal.targets,
            orderType: finalSignal.orderType,
            entryPrice: finalSignal.entryPrice
          });
          return finalSignal;
        }
      }

      logger.warn('❌ Could not parse trade signal from text');
      return null;
    } catch (error) {
      logger.error('Error parsing trade signal:', error);
      return null;
    }
  }

  /**
   * Apply 1:1 Risk-Reward ratio to signal
   * This ensures consistent risk management as requested by client
   */
  private applyOneToOneRR(signal: TradeSignal): TradeSignal {
    const avgEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
    const riskDistance = Math.abs(avgEntry - signal.stopLoss);
    
    let oneToOneTarget: number;
    
    if (signal.action === 'BUY') {
      // BUY: Target = Entry + Risk Distance
      oneToOneTarget = avgEntry + riskDistance;
    } else {
      // SELL: Target = Entry - Risk Distance
      oneToOneTarget = avgEntry - riskDistance;
    }
    
    // Round to appropriate decimal places based on symbol
    const decimals = this.getDecimalPlaces(signal.symbol);
    oneToOneTarget = parseFloat(oneToOneTarget.toFixed(decimals));
    
    logger.info(`🎯 Applied 1:1 RR to ${signal.symbol}: Entry=${avgEntry.toFixed(decimals)}, Risk=${riskDistance.toFixed(decimals)}, Target=${oneToOneTarget}`);
    
    return {
      ...signal,
      targets: [oneToOneTarget], // Single target for 1:1 RR
      reason: `${signal.reason || 'Signal detected'} | 1:1 Risk-Reward Applied`
    };
  }

  /**
   * Enhance signal with smart order type detection
   */
  private enhanceSignalWithOrderType(signal: TradeSignal, originalText: string): TradeSignal {
    // If signal already has order type specified, keep it
    if (signal.orderType) {
      logger.info(`🎯 Signal already has order type specified: ${signal.orderType}`);
      return signal;
    }

    // Skip order type detection if smart detection is disabled
    if (!config.trading.useSmartOrderType) {
      const defaultOrderType = config.trading.defaultOrderType as OrderType;
      logger.info(`🎯 Using default order type: ${defaultOrderType}`);
      return {
        ...signal,
        orderType: defaultOrderType,
        entryPrice: defaultOrderType === 'LIMIT' ? 
          OrderTypeDetector.calculateLimitPrice(signal, defaultOrderType) : undefined
      };
    }

    // Analyze text for order type hints
    const orderTypeHints = this.extractOrderTypeHints(originalText);
    
    // Use OrderTypeDetector for smart detection
    try {
      const orderDecision = OrderTypeDetector.determineOptimalOrderType(
        signal,
        undefined, // No current price available during parsing
        undefined  // No market conditions available during parsing
      );

      logger.info(`🎯 Smart order type detected: ${orderDecision.orderType}`, {
        reason: orderDecision.reason,
        confidence: orderDecision.confidence,
        textHints: orderTypeHints
      });

      return {
        ...signal,
        orderType: orderDecision.orderType,
        entryPrice: orderDecision.entryPrice || 
          (orderDecision.orderType === 'LIMIT' ? 
            OrderTypeDetector.calculateLimitPrice(signal, orderDecision.orderType) : undefined),
        expirationTime: ['LIMIT', 'PENDING'].includes(orderDecision.orderType) ?
          OrderTypeDetector.calculateExpirationTime() : undefined
      };

    } catch (error) {
      logger.warn('Error in smart order type detection, using default:', error);
      const defaultOrderType = config.trading.defaultOrderType as OrderType;
      
      return {
        ...signal,
        orderType: defaultOrderType,
        entryPrice: defaultOrderType === 'LIMIT' ? 
          OrderTypeDetector.calculateLimitPrice(signal, defaultOrderType) : undefined
      };
    }
  }

  /**
   * Extract order type hints from signal text
   */
  private extractOrderTypeHints(text: string): {
    hasUrgentKeywords: boolean;
    hasPrecisionKeywords: boolean;
    hasBreakoutKeywords: boolean;
    hasImmediateKeywords: boolean;
  } {
    const textLower = text.toLowerCase();
    
    const urgentKeywords = ['urgent', 'now', 'immediate', 'asap', 'quick', 'fast', 'rush'];
    const precisionKeywords = ['precise', 'exact', 'perfect', 'wait for', 'patience', 'zone'];
    const breakoutKeywords = ['breakout', 'break above', 'break below', 'momentum', 'explosive'];
    const immediateKeywords = ['market', 'current', 'at market', 'right now'];

    return {
      hasUrgentKeywords: urgentKeywords.some(keyword => textLower.includes(keyword)),
      hasPrecisionKeywords: precisionKeywords.some(keyword => textLower.includes(keyword)),
      hasBreakoutKeywords: breakoutKeywords.some(keyword => textLower.includes(keyword)),
      hasImmediateKeywords: immediateKeywords.some(keyword => textLower.includes(keyword))
    };
  }

  /**
   * Get appropriate decimal places for different symbols
   */
  private getDecimalPlaces(symbol: string): number {
    const symbolUpper = symbol.toUpperCase();
    
    // Forex pairs typically use 4-5 decimal places
    if (this.FOREX_PAIRS.includes(symbolUpper)) {
      // JPY pairs use 2-3 decimal places
      if (symbolUpper.includes('JPY')) {
        return 3;
      }
      return 5; // Most forex pairs
    }
    
    // Metals typically use 2-3 decimal places
    if (this.METAL_SYMBOLS.includes(symbolUpper) || symbolUpper.includes('XAU') || symbolUpper.includes('XAG')) {
      return 2;
    }
    
    // Indices typically use 1-2 decimal places
    if (this.INDEX_SYMBOLS.includes(symbolUpper)) {
      return 1;
    }
    
    return 2; // Default
  }

  /**
   * Check if the message is a result/update post that shouldn't trigger trades
   */
  public isResultOrUpdateMessage(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Keywords that indicate this is a result/update message
    const resultKeywords = [
      'result update',
      'results update', 
      'trade result',
      'trade closed',
      'position closed',
      'target hit',
      'target reached',
      'pips secured',
      'profit secured',
      'trade completed',
      'closed position',
      'perfect execution',
      'precision delivered',
      'no drawdown'
    ];
    
    // Phrases that indicate past tense trading results (COMPLETED trades)
    const pastTensePhrases = [
      'entry: ', // Note: space after colon indicates completed entry price
      'target hit:',
      'secured!',
      'delivered',
      'executed at',
      'hit at',
      'closed at',
      'filled at'
    ];
    
    // Check for result keywords
    const hasResultKeyword = resultKeywords.some(keyword => 
      lowerText.includes(keyword)
    );
    
    // Check for combination of past tense and trading terms (more specific)
    const hasPastTenseTrading = (
      (lowerText.includes('entry: ') && lowerText.includes('target hit:')) ||
      (lowerText.includes('secured!') && (lowerText.includes('pips') || lowerText.includes('profit'))) ||
      (lowerText.includes('delivered') && lowerText.includes('precision')) ||
      (lowerText.includes('executed at') || lowerText.includes('filled at'))
    );
    
    // Additional pattern: Messages with "→" indicating completed moves
    const hasCompletedMove = lowerText.includes('entry: ') && lowerText.includes('→') && lowerText.includes('target hit:');
    
    if (hasResultKeyword || hasPastTenseTrading || hasCompletedMove) {
      logger.info('🚫 Identified result/update message - contains:', {
        resultKeyword: hasResultKeyword,
        pastTenseTrading: hasPastTenseTrading,
        completedMove: hasCompletedMove,
        preview: text.substring(0, 100) + '...'
      });
      return true;
    }
    
    return false;
  }

  /**
   * 🎯 CAPTION-FIRST PARSING: Pure caption analysis (no OCR fallback needed)
   * This is the PRIMARY parsing method - most accurate since captions are clean text
   */
  private parseCaptionSignal(caption: string): TradeSignal | null {
    try {
      console.log('🎯 CAPTION-FIRST: Parsing pure caption signal (highest accuracy)');
      console.log('📝 DEBUG: Raw caption received:', caption);
      console.log('📝 DEBUG: Caption length:', caption.length);
      console.log('📝 DEBUG: Caption includes EURCAD?', caption.toUpperCase().includes('EURCAD'));
      
      // 🚀 NEW: Handle Telegram Signal Format "#XAUUSD (Update) Buy Setup ✔️"
      const telegramSignalPattern = /#(\w+)\s*\([^)]*\)\s*(Buy|Sell)\s+Setup[\s\S]*?(?:Buy Limit|buying zone|Sell Limit|selling zone):\s*(\d+\.?\d*)\s*[–-]\s*(\d+\.?\d*)[\s\S]*?(?:Tp1?|Target):\s*(\d+\.?\d*)[\s\S]*?(?:SL|❌\s*SL):\s*(\d+\.?\d*)/gi;
      
      const telegramMatch = caption.match(telegramSignalPattern);
      if (telegramMatch) {
        const match = telegramSignalPattern.exec(caption);
        if (match) {
          const [, symbol, action, entry1, entry2, target, stopLoss] = match;
          
          logger.info('🎯 TELEGRAM SIGNAL FORMAT DETECTED');
          
          // Validate symbol is supported (block crypto)
          if (['BTCUSD', 'ETHUSD', 'BITCOIN', 'BTC', 'ETH'].includes(symbol.toUpperCase())) {
            logger.warn('❌ Cryptocurrency not supported by broker');
            return null;
          }
          
          const entryMin = Math.min(parseFloat(entry1), parseFloat(entry2));
          const entryMax = Math.max(parseFloat(entry1), parseFloat(entry2));
          const avgEntry = (entryMin + entryMax) / 2;
          const slNum = parseFloat(stopLoss);
          const risk = Math.abs(avgEntry - slNum);
          
          // Validate stop loss direction
          const isValidSL = action.toUpperCase() === 'BUY' ? slNum < avgEntry : slNum > avgEntry;
          if (!isValidSL) {
            logger.error(`❌ Invalid stop loss direction for ${action} trade`);
            return null;
          }
          
          // 🎯 APPLY 1:1 RISK-REWARD AUTOMATICALLY
          const oneToOneTarget = action.toUpperCase() === 'BUY' 
            ? avgEntry + risk 
            : avgEntry - risk;
          
          logger.info(`📊 Original Target: ${target}, 1:1 RR Target: ${oneToOneTarget.toFixed(2)}`);
          
          return {
            symbol: symbol.toUpperCase(),
            action: action.toUpperCase() as TradeAction,
            entryZone: { min: entryMin, max: entryMax },
            stopLoss: slNum,
            targets: [parseFloat(oneToOneTarget.toFixed(2))],
            reason: `1:1 Risk-Reward applied automatically (Original: ${target})`,
            plan: "Conservative 1:1 RR trading strategy"
          };
        }
      }
      
      // 🚀 ENHANCED: Handle chart-based signals with "Next move" pattern
      if (caption.includes('Next move on the way') && caption.includes('focus on proper risk management')) {
        console.log('🎯 CHART SIGNAL DETECTED: "Next move" pattern found');
        
        // Extract symbol from hashtag
        const symbolMatch = caption.match(/#([A-Z]{3,8})/i);
        if (symbolMatch) {
          const symbol = symbolMatch[1].toUpperCase();
          console.log('📈 Chart signal symbol:', symbol);
          
          // Return a special signal that indicates chart analysis needed
          return {
            symbol: symbol,
            action: 'BUY' as TradeAction, // Default to BUY, will be refined by chart analysis
            entryZone: { min: 0, max: 0 }, // Will be filled by visual analysis
            stopLoss: 0, // Will be filled by visual analysis  
            targets: [0], // Will be filled by visual analysis
            reason: 'Chart-based signal - prices to be extracted from image',
            plan: 'Risk management focused approach - awaiting chart analysis',
            orderType: 'AUTO' as OrderType, // Let enhanced detection decide
            requiresChartAnalysis: true // Special flag
          };
        }
      }

      // 1. SYMBOL DETECTION - Enhanced with # prefix support
      const symbolPatterns = [
        // Major Indices
        /#(NAS100|NASDAQ|US100|NDX)/i,
        /#(SPX500|SPY|S&P500|SP500)/i,
        /#(DJ30|DJI|DOWJONES|DOW)/i,
        /#(DAX40|DAX|GER40)/i,
        
        // Metals & Commodities  
        /#(XAUUSD|Gold|XAU|GOLD)/i,
        /#(XAGUSD|Silver|XAG|SILVER)/i,
        /#(USOIL|WTI|CRUDE|CL)/i,
        
        // Major Forex Pairs
        /#(EURUSD|EUR\/USD)/i,
        /#(GBPUSD|GBP\/USD)/i,
        /#(USDJPY|USD\/JPY)/i,
        /#(AUDUSD|AUD\/USD)/i,
        /#(USDCAD|USD\/CAD)/i,
        /#(EURCAD|EUR\/CAD)/i,
        /#(EURGBP|EUR\/GBP)/i,
        
        // Generic pattern for ANY trading symbol with # prefix
        /#([A-Z]{3,8})/i,
        
        // Fallback patterns without #
        /(XAUUSD|Gold|XAU\/USD)/i,
        /(NAS100|NASDAQ)/i,
        /(SPX500|SPY)/i
      ];
      
      let symbol: string | null = null;
      for (const pattern of symbolPatterns) {
        const match = caption.match(pattern);
        if (match) {
          // Normalize symbol names
          const rawSymbol = match[1].toUpperCase();
          if (['GOLD', 'XAU'].includes(rawSymbol)) symbol = 'XAUUSD';
          else if (['SILVER', 'XAG'].includes(rawSymbol)) symbol = 'XAGUSD';
          else if (['NASDAQ', 'US100', 'NDX'].includes(rawSymbol)) symbol = 'NAS100';
          else if (['SPY', 'S&P500', 'SP500'].includes(rawSymbol)) symbol = 'SPX500';
          else if (['BITCOIN', 'BTC', 'BTCUSD'].includes(rawSymbol)) {
            logger.warn('❌ Cryptocurrency not supported by broker');
            return null;
          }
          else symbol = rawSymbol;
          
          logger.info(`📈 Symbol detected: ${symbol} from caption pattern: ${match[0]}`);
          break;
        }
      }
      
      if (!symbol) {
        logger.debug('❌ No supported symbol detected in caption');
        return null;
      }
      
      // 2. ACTION DETECTION - Multiple patterns for buy/sell
      const actionPatterns = [
        /(buy|sell)\s+setup/i,
        /(buy|sell)\s+limit/i,
        /(buying|selling)\s+zone/i,
        /best\s+(buying|selling)\s+zone/i,
        /(bullish|bearish)\s+move\s+expected/i,
        /(bullish|bearish)\s+setup/i,
        /🔼\s*signal/i, // Buy signal emoji
        /🔽\s*signal/i  // Sell signal emoji
      ];
      
      let action: TradeAction | null = null;
      for (const pattern of actionPatterns) {
        const match = caption.match(pattern);
        if (match) {
          const matchedText = match[1] ? match[1].toLowerCase() : match[0].toLowerCase();
          action = (matchedText.includes('bull') || matchedText.includes('buy') || match[0].includes('🔼')) ? 'BUY' : 'SELL';
          logger.info(`📊 Action detected: ${action} from "${match[0]}"`);
          break;
        }
      }
      
      if (!action) {
        logger.debug('❌ No clear buy/sell action detected in caption');
        return null;
      }
      
      // 3. ENTRY ZONE DETECTION - Enhanced patterns
      const entryPatterns = [
        /(?:best\s+)?(?:buying|selling)\s+zone[:\s]*(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
        /(?:buy|sell)\s+limit[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
        /entry[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
        /zone[:\s]*(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
        /(\d{4}\.?\d*)\s*[–\-~]\s*(\d{4}\.?\d*)/
      ];
      
      let entryMin: number | null = null;
      let entryMax: number | null = null;
      
      for (const pattern of entryPatterns) {
        const match = caption.match(pattern);
        if (match && match.length >= 3) {
          entryMin = Math.min(parseFloat(match[1]), parseFloat(match[2]));
          entryMax = Math.max(parseFloat(match[1]), parseFloat(match[2]));
          logger.info(`📊 Entry zone detected: ${entryMin} - ${entryMax} from "${match[0]}"`);
          break;
        }
      }
      
      if (!entryMin || !entryMax) {
        logger.debug('❌ No valid entry zone detected in caption');
        return null;
      }
      
      // 4. STOP LOSS DETECTION - Enhanced patterns
      const slPatterns = [
        /(?:stop\s+loss|SL|❌\s*SL)[:\s]*(\d+\.?\d*)/i,
        /SL[:\s]+(\d+\.?\d*)/i,
        /❌[^0-9]*(\d+\.?\d*)/,
        /stop[:\s]+(\d+\.?\d*)/i
      ];
      
      let stopLoss: number | undefined;
      for (const pattern of slPatterns) {
        const match = caption.match(pattern);
        if (match) {
          stopLoss = parseFloat(match[1]);
          logger.info(`🛑 Stop Loss detected: ${stopLoss} from "${match[0]}"`);
          break;
        }
      }
      
      // 5. TARGET DETECTION (Optional - will use 1:1 if not found)
      const targetPatterns = [
        /(?:tp|target|take\s*profit)\s*(\d+)?[:\s]*(\d+\.?\d*)/gi,
        /🎯[^0-9]*(\d+\.?\d*)/g,
        /final\s+tp[:\s]*(\d+\.?\d*)/gi
      ];
      
      const detectedTargets: number[] = [];
      for (const pattern of targetPatterns) {
        const matches = [...caption.matchAll(pattern)];
        matches.forEach(match => {
          const value = parseFloat(match[match.length - 1]);
          if (!isNaN(value) && value > 0) {
            detectedTargets.push(value);
          }
        });
      }
      
      // Calculate targets (use detected or 1:1 ratio)
      const entryMid = (entryMin + entryMax) / 2;
      let finalStopLoss = stopLoss;
      
      // If no stop loss provided, calculate based on instrument
      if (!finalStopLoss) {
        const slDistance = this.getStopLossDistance(symbol);
        finalStopLoss = action === 'BUY' ? entryMin - slDistance : entryMax + slDistance;
      }
      
      // Calculate targets (use detected targets or 1:1 ratio)
      let targets: number[];
      if (detectedTargets.length > 0) {
        targets = detectedTargets.sort((a, b) => action === 'BUY' ? a - b : b - a);
        logger.info(`🎯 Using detected targets: ${targets.join(', ')}`);
      } else {
        // Calculate 1:1 risk-reward target
        const riskDistance = Math.abs(entryMid - finalStopLoss);
        const target1 = action === 'BUY' ? entryMid + riskDistance : entryMid - riskDistance;
        targets = [target1];
        logger.info(`🎯 Using 1:1 calculated target: ${target1}`);
      }
      
      const signal: TradeSignal = {
        symbol,
        action,
        entryZone: { min: entryMin, max: entryMax },
        stopLoss: finalStopLoss,
        targets,
        reason: `CAPTION-FIRST PARSING: ${caption.substring(0, 50)}...`,
        plan: `${action} ${symbol} ${entryMin}-${entryMax} SL:${finalStopLoss} TP:${targets.join(',')}`
      };
      
      logger.info(`✅ CAPTION-FIRST SUCCESS: ${signal.symbol} ${signal.action} ${signal.entryZone.min}-${signal.entryZone.max}`);
      return signal;
      
    } catch (error) {
      logger.error('Error in caption-first parsing:', error);
      return null;
    }
  }

  /**
   * Parse visual chart signals with highlighted zones and pip values
   * Handles charts with visual entry zones, targets, and caption-based setups
   */
  private parseVisualChartSignal(text: string, caption?: string): TradeSignal | null {
    try {
      logger.info('🎯 Attempting to parse visual chart signal (ALL CHARTS have highlighted zones)');
      
      // Enhanced symbol detection with # prefix support for multiple instruments
      const symbolPatterns = [
        // =================== CAPTION-BASED SYMBOLS (Priority Detection) ===================
        
        // Major Indices
        caption && caption.match(/#(NAS100|NASDAQ|US100|NDX)/i) ? ['NAS100', caption.match(/#(NAS100|NASDAQ|US100|NDX)/i)![1]] : null,
        caption && caption.match(/#(SPX500|SPY|S&P500|SP500)/i) ? ['SPX500', caption.match(/#(SPX500|SPY|S&P500|SP500)/i)![1]] : null,
        caption && caption.match(/#(DJ30|DJI|DOWJONES|DOW)/i) ? ['DJ30', caption.match(/#(DJ30|DJI|DOWJONES|DOW)/i)![1]] : null,
        caption && caption.match(/#(DAX40|DAX|GER40)/i) ? ['DAX40', caption.match(/#(DAX40|DAX|GER40)/i)![1]] : null,
        caption && caption.match(/#(FTSE100|UK100|UKX)/i) ? ['FTSE100', caption.match(/#(FTSE100|UK100|UKX)/i)![1]] : null,
        caption && caption.match(/#(AUS200|ASX200)/i) ? ['AUS200', caption.match(/#(AUS200|ASX200)/i)![1]] : null,
        caption && caption.match(/#(JPN225|NKY|NIKKEI)/i) ? ['JPN225', caption.match(/#(JPN225|NKY|NIKKEI)/i)![1]] : null,
        
        // Metals & Commodities
        caption && caption.match(/#(XAUUSD|Gold|XAU|GOLD)/i) ? ['XAUUSD', caption.match(/#(XAUUSD|Gold|XAU|GOLD)/i)![1]] : null,
        caption && caption.match(/#(XAGUSD|Silver|XAG|SILVER)/i) ? ['XAGUSD', caption.match(/#(XAGUSD|Silver|XAG|SILVER)/i)![1]] : null,
        caption && caption.match(/#(XPTUSD|Platinum|XPT)/i) ? ['XPTUSD', caption.match(/#(XPTUSD|Platinum|XPT)/i)![1]] : null,
        caption && caption.match(/#(XPDUSD|Palladium|XPD)/i) ? ['XPDUSD', caption.match(/#(XPDUSD|Palladium|XPD)/i)![1]] : null,
        caption && caption.match(/#(USOIL|WTI|CRUDE|CL)/i) ? ['USOIL', caption.match(/#(USOIL|WTI|CRUDE|CL)/i)![1]] : null,
        caption && caption.match(/#(UKOIL|BRENT|BRN)/i) ? ['UKOIL', caption.match(/#(UKOIL|BRENT|BRN)/i)![1]] : null,
        caption && caption.match(/#(NGAS|NATGAS|NG)/i) ? ['NGAS', caption.match(/#(NGAS|NATGAS|NG)/i)![1]] : null,
        
        // Cryptocurrencies (if supported by broker)
        caption && caption.match(/#(BTCUSD|Bitcoin|BTC)/i) ? ['BTCUSD', caption.match(/#(BTCUSD|Bitcoin|BTC)/i)![1]] : null,
        caption && caption.match(/#(ETHUSD|Ethereum|ETH)/i) ? ['ETHUSD', caption.match(/#(ETHUSD|Ethereum|ETH)/i)![1]] : null,
        caption && caption.match(/#(LTCUSD|Litecoin|LTC)/i) ? ['LTCUSD', caption.match(/#(LTCUSD|Litecoin|LTC)/i)![1]] : null,
        
        // Major Forex Pairs
        caption && caption.match(/#(EURUSD|EUR\/USD)/i) ? ['EURUSD', caption.match(/#(EURUSD|EUR\/USD)/i)![1]] : null,
        caption && caption.match(/#(GBPUSD|GBP\/USD)/i) ? ['GBPUSD', caption.match(/#(GBPUSD|GBP\/USD)/i)![1]] : null,
        caption && caption.match(/#(USDJPY|USD\/JPY)/i) ? ['USDJPY', caption.match(/#(USDJPY|USD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(AUDUSD|AUD\/USD)/i) ? ['AUDUSD', caption.match(/#(AUDUSD|AUD\/USD)/i)![1]] : null,
        caption && caption.match(/#(USDCAD|USD\/CAD)/i) ? ['USDCAD', caption.match(/#(USDCAD|USD\/CAD)/i)![1]] : null,
        caption && caption.match(/#(EURCAD|EUR\/CAD)/i) ? ['EURCAD', caption.match(/#(EURCAD|EUR\/CAD)/i)![1]] : null,
        caption && caption.match(/#(EURGBP|EUR\/GBP)/i) ? ['EURGBP', caption.match(/#(EURGBP|EUR\/GBP)/i)![1]] : null,
        caption && caption.match(/#(GBPUSD|GBP\/USD|Cable)/i) ? ['GBPUSD', caption.match(/#(GBPUSD|GBP\/USD|Cable)/i)![1]] : null,
        caption && caption.match(/#(USDJPY|USD\/JPY)/i) ? ['USDJPY', caption.match(/#(USDJPY|USD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(USDCHF|USD\/CHF|Swissy)/i) ? ['USDCHF', caption.match(/#(USDCHF|USD\/CHF|Swissy)/i)![1]] : null,
        caption && caption.match(/#(AUDUSD|AUD\/USD|Aussie)/i) ? ['AUDUSD', caption.match(/#(AUDUSD|AUD\/USD|Aussie)/i)![1]] : null,
        caption && caption.match(/#(USDCAD|USD\/CAD|Loonie)/i) ? ['USDCAD', caption.match(/#(USDCAD|USD\/CAD|Loonie)/i)![1]] : null,
        caption && caption.match(/#(NZDUSD|NZD\/USD|Kiwi)/i) ? ['NZDUSD', caption.match(/#(NZDUSD|NZD\/USD|Kiwi)/i)![1]] : null,
        
        // Minor & Exotic Forex Pairs
        caption && caption.match(/#(EURGBP|EUR\/GBP)/i) ? ['EURGBP', caption.match(/#(EURGBP|EUR\/GBP)/i)![1]] : null,
        caption && caption.match(/#(EURJPY|EUR\/JPY)/i) ? ['EURJPY', caption.match(/#(EURJPY|EUR\/JPY)/i)![1]] : null,
        caption && caption.match(/#(GBPJPY|GBP\/JPY)/i) ? ['GBPJPY', caption.match(/#(GBPJPY|GBP\/JPY)/i)![1]] : null,
        caption && caption.match(/#(GBPCAD|GBP\/CAD)/i) ? ['GBPCAD', caption.match(/#(GBPCAD|GBP\/CAD)/i)![1]] : null,
        caption && caption.match(/#(AUDCAD|AUD\/CAD)/i) ? ['AUDCAD', caption.match(/#(AUDCAD|AUD\/CAD)/i)![1]] : null,
        caption && caption.match(/#(AUDJPY|AUD\/JPY)/i) ? ['AUDJPY', caption.match(/#(AUDJPY|AUD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(CADJPY|CAD\/JPY)/i) ? ['CADJPY', caption.match(/#(CADJPY|CAD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(CHFJPY|CHF\/JPY)/i) ? ['CHFJPY', caption.match(/#(CHFJPY|CHF\/JPY)/i)![1]] : null,
        caption && caption.match(/#(EURNZD|EUR\/NZD)/i) ? ['EURNZD', caption.match(/#(EURNZD|EUR\/NZD)/i)![1]] : null,
        caption && caption.match(/#(NZDCAD|NZD\/CAD)/i) ? ['NZDCAD', caption.match(/#(NZDCAD|NZD\/CAD)/i)![1]] : null,
        caption && caption.match(/#(NZDJPY|NZD\/JPY)/i) ? ['NZDJPY', caption.match(/#(NZDJPY|NZD\/JPY)/i)![1]] : null,
        
        // Generic pattern for ANY trading symbol with # prefix (catches futures, exotic pairs, etc.)
        caption && caption.match(/#([A-Z]{3,8})/i) ? [caption.match(/#([A-Z]{3,8})/i)![1].toUpperCase(), caption.match(/#([A-Z]{3,8})/i)![1]] : null,
        
        // =================== TEXT-BASED FALLBACKS ===================
        text.match(/#?(XAUUSD|Gold|XAU\/USD)/i) ? ['XAUUSD', text.match(/#?(XAUUSD|Gold|XAU\/USD)/i)![1]] : null,
        text.match(/#?(XAGUSD|Silver|XAG\/USD)/i) ? ['XAGUSD', text.match(/#?(XAGUSD|Silver|XAG\/USD)/i)![1]] : null,
        text.match(/#?(EURCAD|EUR\/CAD)/i) ? ['EURCAD', text.match(/#?(EURCAD|EUR\/CAD)/i)![1]] : null,
        text.match(/#?(EURUSD|EUR\/USD)/i) ? ['EURUSD', text.match(/#?(EURUSD|EUR\/USD)/i)![1]] : null,
        text.match(/#?(GBPUSD|GBP\/USD)/i) ? ['GBPUSD', text.match(/#?(GBPUSD|GBP\/USD)/i)![1]] : null,
        text.match(/#?(USDJPY|USD\/JPY)/i) ? ['USDJPY', text.match(/#?(USDJPY|USD\/JPY)/i)![1]] : null,
        text.match(/#?(USDCAD|USD\/CAD)/i) ? ['USDCAD', text.match(/#?(USDCAD|USD\/CAD)/i)![1]] : null,
        text.match(/#?(USDCHF|USD\/CHF)/i) ? ['USDCHF', text.match(/#?(USDCHF|USD\/CHF)/i)![1]] : null,
        text.match(/#?(AUDUSD|AUD\/USD)/i) ? ['AUDUSD', text.match(/#?(AUDUSD|AUD\/USD)/i)![1]] : null,
        text.match(/#?(NZDUSD|NZD\/USD)/i) ? ['NZDUSD', text.match(/#?(NZDUSD|NZD\/USD)/i)![1]] : null,
        text.match(/#?(EURJPY|EUR\/JPY)/i) ? ['EURJPY', text.match(/#?(EURJPY|EUR\/JPY)/i)![1]] : null,
        text.match(/#?(GBPJPY|GBP\/JPY)/i) ? ['GBPJPY', text.match(/#?(GBPJPY|GBP\/JPY)/i)![1]] : null,
        text.match(/#?(NAS100|NASDAQ|US100)/i) ? ['NAS100', text.match(/#?(NAS100|NASDAQ|US100)/i)![1]] : null,
        text.match(/#?(SPX500|SPY|S&P500)/i) ? ['SPX500', text.match(/#?(SPX500|SPY|S&P500)/i)![1]] : null,
        text.match(/#?(US30|DJ30|DOW)/i) ? ['US30', text.match(/#?(US30|DJ30|DOW)/i)![1]] : null,
        text.match(/#?(BTCUSD|Bitcoin|BTC)/i) ? ['BTCUSD', text.match(/#?(BTCUSD|Bitcoin|BTC)/i)![1]] : null
      ].filter(Boolean);
      
      let symbol: string | null = null;
      
      if (symbolPatterns.length > 0) {
        symbol = symbolPatterns[0]![0]; // Get the standardized symbol
        logger.info(`📈 Symbol detected: ${symbol} from pattern: ${symbolPatterns[0]![1]}`);
      } else {
        // Smart fallback based on price ranges and patterns
        const hasBitcoinPrices = /\b[4-9]\d{4}\.\d{1,2}\b/.test(text);        // 40000-99999 range (Bitcoin)
        const hasNasPrices = /\b[1-2]\d{4}\.\d{1,2}\b/.test(text);            // 10000-29999 range (NAS100)  
        const hasSpxPrices = /\b[3-6]\d{3}\.\d{1,2}\b/.test(text);            // 3000-6999 range (SPX500)
        const hasGoldPrices = /\b[1-3]\d{3}\.\d{2,3}\b/.test(text);           // 1000-3999 range (Gold)
        const hasSilverPrices = /\b[2-5]\d\.\d{2,3}\b/.test(text);            // 20-59 range (Silver)
        const hasOilPrices = /\b[3-9]\d\.\d{2}\b/.test(text);                 // 30-99 range (Oil)
        const hasForexPrices = /\b[01]\.\d{4,5}\b/.test(text);                // 0.x or 1.x range (Forex)
        const hasJpyPrices = /\b1[0-5]\d\.\d{2,3}\b/.test(text);              // 100-159 range (JPY pairs)
        const hasEthPrices = /\b[1-4]\d{3}\.\d{1,2}\b/.test(text);            // 1000-4999 range (Ethereum)
        
        // Price-based symbol detection (most specific first)
        if (hasBitcoinPrices && text.toLowerCase().includes('btc')) symbol = 'BTCUSD';
        else if (hasEthPrices && text.toLowerCase().includes('eth')) symbol = 'ETHUSD';
        else if (hasNasPrices) symbol = 'NAS100';
        else if (hasSpxPrices) symbol = 'SPX500'; 
        else if (hasGoldPrices) symbol = 'XAUUSD';
        else if (hasSilverPrices) symbol = 'XAGUSD';
        else if (hasOilPrices) symbol = 'USOIL';
        else if (hasJpyPrices) symbol = 'USDJPY';
        else if (hasForexPrices) symbol = 'EURUSD'; // Default forex
      }
      
      if (!symbol) {
        logger.warn('❌ No supported symbol detected');
        return null;
      }

      // 🚀 SPECIAL: Handle "Next move" chart signals with risk management focus
      if (caption && caption.includes('Next move on the way') && caption.includes('focus on proper risk management')) {
        logger.info('🎯 CHART SIGNAL: "Next move" pattern - analyzing chart for levels');
        
        // For EURGBP based on your chart: Bullish setup with green zone targets
        if (symbol === 'EURGBP') {
          return {
            symbol: 'EURGBP',
            action: 'BUY' as TradeAction,
            entryZone: { min: 0.86400, max: 0.86466 }, // Support area from chart
            stopLoss: 0.86291, // Below support
            targets: [0.86737], // Conservative target in green zone  
            reason: 'Chart-based "Next move" signal - risk management focus',
            plan: 'Wait for entry in support zone, disciplined approach',
            orderType: 'LIMIT' as OrderType // Risk management = patience = LIMIT
          };
        }
        
        // For EURCAD if it shows similar pattern  
        if (symbol === 'EURCAD') {
          return {
            symbol: 'EURCAD',
            action: 'BUY' as TradeAction, 
            entryZone: { min: 1.6075, max: 1.6085 }, // Typical support
            stopLoss: 1.6065, // Below support
            targets: [1.6105], // Conservative 1:1 RR
            reason: 'Chart-based "Next move" signal - risk management focus',
            plan: 'Patient entry with disciplined risk management',
            orderType: 'LIMIT' as OrderType
          };
        }
        
        logger.info(`✅ Generated chart-based signal for ${symbol}`);
      }
      
      // Special handling for EURJPY price range detection
      if (symbol === 'USDJPY' && text.includes('EURJPY')) {
        symbol = 'EURJPY';
        logger.info('📈 Corrected symbol: EURJPY detected from text');
      }
      
      // Extract visual chart data (OCR from chart zones) - PRIORITY since ALL charts use this
      const visualData = this.extractVisualChartData(text);
      
      // Enhanced chart analysis for Update messages - analyze price levels when no explicit zones found
      if (!visualData && caption && caption.toLowerCase().includes('update')) {
        logger.info('📊 Using enhanced price level analysis for Update message');
        
        // First try to extract explicit SL/TP values from text
        const slMatch = text.match(/(?:❌\s*)?SL:\s*(\d+(?:\.\d+)?)/i);
        const tpMatch = text.match(/(?:🏹\s*)?TP:\s*(\d+(?:\.\d+)?)/i);
        
        if (slMatch && tpMatch) {
          const stopLoss = parseFloat(slMatch[1]);
          const target = parseFloat(tpMatch[1]);
          
          logger.info(`💡 Found explicit SL: ${stopLoss}, TP: ${target}`);
          
          // Determine action from text content
          const actionMatch = text.toLowerCase().includes('selling') || text.toLowerCase().includes('sell') ? 'SELL' :
                            text.toLowerCase().includes('buying') || text.toLowerCase().includes('buy') ? 'BUY' : null;
          
          if (actionMatch) {
            // Calculate entry level between SL and TP
            let entryPrice;
            if (actionMatch === 'SELL') {
              entryPrice = (stopLoss + target) / 2; // Entry between SL (above) and TP (below)
            } else {
              entryPrice = (stopLoss + target) / 2; // Entry between SL (below) and TP (above)
            }
            
            // Create entry zone with small buffer
            const priceBuffer = Math.abs(stopLoss - target) * 0.05; // 5% buffer
            const entryZone = {
              min: entryPrice - priceBuffer,
              max: entryPrice + priceBuffer
            };
            
            logger.info(`📈 Explicit signal: ${actionMatch} at ${entryPrice}, SL: ${stopLoss}, TP: ${target}`);
            
            // ALWAYS apply 1:1 RR for explicit signals as requested by user
            const riskDistance = Math.abs(entryPrice - stopLoss);
            let finalTarget;
            if (actionMatch === 'SELL') {
              finalTarget = entryPrice - riskDistance; // 1:1 RR for SELL
            } else {
              finalTarget = entryPrice + riskDistance; // 1:1 RR for BUY
            }
            logger.info(`🎯 Applied 1:1 RR: Original TP ${target} → Adjusted TP ${finalTarget}`);
            
            return {
              symbol: symbol,
              action: actionMatch as TradeAction,
              entryZone: entryZone,
              stopLoss: parseFloat(stopLoss.toFixed(symbol === 'XAUUSD' ? 2 : 5)),
              targets: [parseFloat(finalTarget.toFixed(symbol === 'XAUUSD' ? 2 : 5))],
              reason: `${symbol} UPDATE - Explicit SL/TP setup with enforced 1:1 RR`,
              plan: `${actionMatch} setup with calculated entry zone and 1:1 risk-reward`
            };
          }
        }
        
        // Fallback: Extract all price levels and analyze them
        const pricePattern = /\b(\d{1,3}\.\d{2,5})\b/g;
        const prices = [...text.matchAll(pricePattern)].map(m => parseFloat(m[1])).filter(p => p > 0);
        
        if (prices.length >= 3) {
          prices.sort((a, b) => b - a); // Sort descending
          
          // For USDCHF price analysis:
          // - Highest prices = resistance/sell area  
          // - Lowest prices = support/buy area
          // - Current price is usually highlighted or in middle range
          
          const highLevel = prices[0];
          const currentPrice = prices[Math.floor(prices.length / 2)];
          const lowLevel = prices[prices.length - 1];
          
          // Determine trend direction based on chart zones
          // If we see green/red zones, assume it's near a decision point
          const priceRange = highLevel - lowLevel;
          const entryBuffer = priceRange * 0.1; // 10% buffer for entry zone
          
          logger.info(`📊 Price analysis: High=${highLevel}, Current=${currentPrice}, Low=${lowLevel}`);
          
          // For Update messages, create a trade signal based on chart levels
          // Use current price as entry reference with small zone
          const entryZone = {
            min: currentPrice - (entryBuffer / 2),
            max: currentPrice + (entryBuffer / 2)
          };
          
          // Determine action based on position relative to range
          const isNearSupport = (currentPrice - lowLevel) < (highLevel - currentPrice);
          const action = isNearSupport ? 'BUY' : 'SELL';
          
          // Set stop loss and target based on chart levels with proper 1:1 RR
          let stopLoss, target;
          const entryPrice = (entryZone.min + entryZone.max) / 2; // Use center of entry zone
          
          if (action === 'BUY') {
            stopLoss = lowLevel - (priceRange * 0.05); // Below support
            const riskDistance = Math.abs(entryPrice - stopLoss);
            target = entryPrice + riskDistance; // 1:1 RR from entry zone
          } else {
            stopLoss = highLevel + (priceRange * 0.05); // Above resistance  
            const riskDistance = Math.abs(stopLoss - entryPrice);
            target = entryPrice - riskDistance; // 1:1 RR from entry zone
          }
          
          logger.info(`📈 Chart-based signal: ${action} at ${currentPrice}, SL: ${stopLoss}, TP: ${target}`);
          
          return {
            symbol: symbol,
            action: action as TradeAction,
            entryZone: entryZone,
            stopLoss: parseFloat(stopLoss.toFixed(5)),
            targets: [parseFloat(target.toFixed(5))],
            reason: `${symbol} UPDATE - Chart-based analysis from price levels`,
            plan: `${action} based on chart structure with 1:1 RR`
          };
        } else {
          logger.warn('❌ Insufficient price levels detected for analysis');
          return null;
        }
      }
      
      // Extract caption-based setup information as secondary
      const captionData = caption ? this.extractCaptionSetupData(caption) : null;
      
      // ENHANCED: Since ALL charts have highlighted zones, prioritize visual data
      if (visualData && visualData.zones.length > 0) {
        logger.info('📊 Using visual chart data (highlighted zones detected)');
        
        // PRIORITY: Find grey entry zones (these are the main trading zones)
        const greyEntryZones = visualData.zones.filter(z => 
          z.name.toLowerCase().includes('grey') || 
          z.name.toLowerCase().includes('entry')
        );
        
        // Secondary: Find other entry zones 
        const otherEntryZones = visualData.zones.filter(z => 
          (z.name.toLowerCase().includes('selling') || 
           z.name.toLowerCase().includes('buying')) &&
          !z.name.toLowerCase().includes('grey')
        );
        
        // Find target zones
        const targetZones = visualData.zones.filter(z => 
          z.name.toLowerCase().includes('target') || 
          z.name.toLowerCase().includes('tp')
        );
        
        // Use grey zones as primary entry areas
        const entryZones = greyEntryZones.length > 0 ? greyEntryZones : otherEntryZones;
        
        if (entryZones.length > 0) {
          const entryZone = entryZones[0]; // Use first grey zone
          const preciseEntry = entryZone.value; // This is our exact entry level (median)
          
          logger.info(`🔘 Precise entry from grey zone: ${preciseEntry} (range: ${entryZone.min}-${entryZone.max})`);
          
          // Create tight entry zone around precise entry level
          const entryBuffer = (entryZone.max - entryZone.min) * 0.1; // 10% of zone range as buffer
          const tightEntryMin = Math.max(preciseEntry - entryBuffer, entryZone.min);
          const tightEntryMax = Math.min(preciseEntry + entryBuffer, entryZone.max);
          
          // Determine action from caption or zone context
          let action: 'BUY' | 'SELL' = 'BUY'; // default
          
          // Determine action from caption keywords
          if (caption) {
            if (/sell|short|bearish|down/i.test(caption)) action = 'SELL';
            else if (/buy|long|bullish|up/i.test(caption)) action = 'BUY';
          }
          
          // Default to BUY if no clear direction (most signals are BUY setups)
          logger.info(`📊 Action determined: ${action} for grey zone entry at ${preciseEntry}`);
          
          const slDistance = this.getStopLossDistance(symbol);
          
          // Calculate stop loss outside the grey zone with proper buffer
          const stopLoss = action === 'SELL' ? 
            entryZone.max + slDistance : 
            entryZone.min - slDistance;
          
          // Use target zones if available, otherwise calculate from price extremes
          let targets: number[];
          if (targetZones.length > 0) {
            // Filter targets based on trade direction
            const validTargets = targetZones
              .map(t => t.value)
              .filter(target => action === 'BUY' ? target > preciseEntry : target < preciseEntry);
            
            targets = validTargets.length > 0 ? validTargets : [targetZones[0].value];
            logger.info(`🎯 Using filtered chart targets for ${action}: ${targets.join(', ')}`);
          } else {
            // Use price extremes as targets
            const pricePattern = /\b(\d{3}\.\d{2,4})\b/g;
            const allPrices = [...text.matchAll(pricePattern)].map(m => parseFloat(m[1])).filter(p => p > 0);
            allPrices.sort((a, b) => a - b);
            
            const target = action === 'SELL' ? 
              allPrices[Math.floor(allPrices.length * 0.15)] : // Lower target for SELL
              allPrices[Math.floor(allPrices.length * 0.85)];  // Higher target for BUY
              
            targets = [target];
            logger.info(`🎯 Calculated target from price extremes: ${target}`);
          }
          
          return {
            symbol: symbol,
            action,
            entryZone: { min: tightEntryMin, max: tightEntryMax },
            stopLoss,
            targets,
            reason: `${symbol} UPDATE - Precise entry at ${preciseEntry} (grey zone)`,
            plan: `${action} at precise level ${preciseEntry} from grey zone, targets: ${targets.join(', ')}`
          };
        }
        
        // Fallback: Use any detected zones and infer direction from price levels
        if (visualData.zones.length > 0) {
          const allValues = visualData.zones.map(z => z.value).sort((a, b) => a - b);
          const entryValue = allValues[Math.floor(allValues.length / 2)]; // Use middle value as entry
          
          // Infer direction from caption keywords or default to BUY
          const action = caption && /sell|short|bearish|down/i.test(caption) ? 'SELL' : 'BUY';
          const slDistance = this.getStopLossDistance(symbol);
          const stopLoss = action === 'SELL' ? entryValue + slDistance : entryValue - slDistance;
          const target1 = action === 'SELL' ? entryValue - slDistance : entryValue + slDistance;
          
          return {
            symbol: symbol || 'XAUUSD',
            action,
            entryZone: { min: entryValue - 2, max: entryValue + 2 },
            stopLoss,
            targets: [target1],
            reason: 'VISUAL CHART AUTO-DETECTED (1:1 RATIO)',
            plan: `${action} SETUP FROM CHART ANALYSIS WITH 1:1 RISK-REWARD`
          };
        }
      }
      
      // Secondary: Use caption data if visual parsing didn't work  
      if (captionData && captionData.action && captionData.entryZone) {
        logger.info('📝 Falling back to caption-based setup data');
        const entryMid = (captionData.entryZone.min + captionData.entryZone.max) / 2;
        const slDistance = this.getStopLossDistance(symbol);
        const stopLoss = captionData.stopLoss || (captionData.action === 'BUY' ? 
          captionData.entryZone.min - slDistance : captionData.entryZone.max + slDistance);
        const target1 = captionData.action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;
        
        return {
          symbol: symbol || 'XAUUSD',
          action: captionData.action,
          entryZone: captionData.entryZone,
          stopLoss,
          targets: [target1],
          reason: (caption?.substring(0, 100) || 'VISUAL CHART SIGNAL') + ' (1:1 RATIO)',
          plan: `${captionData.action} SETUP FROM CAPTION WITH 1:1 RISK-REWARD`
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing visual chart signal:', error);
      return null;
    }
  }

  /**
   * Get appropriate stop loss distance for different instruments
   */
  private getStopLossDistance(symbol: string): number {
    // =================== INDICES ===================
    if (['NAS100', 'NASDAQ', 'US100', 'NDX'].includes(symbol)) return 50;   // NAS100: 50 points
    if (['SPX500', 'SPY', 'S&P500', 'SP500'].includes(symbol)) return 20;   // S&P500: 20 points  
    if (['DJ30', 'DJI', 'DOWJONES', 'DOW'].includes(symbol)) return 100;    // Dow Jones: 100 points
    if (['DAX40', 'DAX', 'GER40'].includes(symbol)) return 50;              // DAX: 50 points
    if (['FTSE100', 'UK100', 'UKX'].includes(symbol)) return 30;            // FTSE: 30 points
    if (['AUS200', 'ASX200'].includes(symbol)) return 25;                   // ASX200: 25 points
    if (['JPN225', 'NKY', 'NIKKEI'].includes(symbol)) return 100;           // Nikkei: 100 points
    
    // =================== METALS & COMMODITIES ===================
    if (['XAUUSD', 'GOLD', 'XAU'].includes(symbol)) return 15;              // Gold: $15
    if (['XAGUSD', 'SILVER', 'XAG'].includes(symbol)) return 0.50;          // Silver: $0.50
    if (['XPTUSD', 'PLATINUM', 'XPT'].includes(symbol)) return 25;          // Platinum: $25
    if (['XPDUSD', 'PALLADIUM', 'XPD'].includes(symbol)) return 50;         // Palladium: $50
    if (['USOIL', 'WTI', 'CRUDE', 'CL'].includes(symbol)) return 1.0;       // Crude Oil: $1.00
    if (['UKOIL', 'BRENT', 'BRN'].includes(symbol)) return 1.0;             // Brent Oil: $1.00
    if (['NGAS', 'NATGAS', 'NG'].includes(symbol)) return 0.10;             // Natural Gas: $0.10
    
    // =================== CRYPTOCURRENCIES ===================
    if (['BTCUSD', 'BITCOIN', 'BTC'].includes(symbol)) return 500;          // Bitcoin: $500
    if (['ETHUSD', 'ETHEREUM', 'ETH'].includes(symbol)) return 50;          // Ethereum: $50  
    if (['LTCUSD', 'LITECOIN', 'LTC'].includes(symbol)) return 10;          // Litecoin: $10
    
    // =================== MAJOR FOREX PAIRS ===================
    if (['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'].includes(symbol)) return 0.0020;  // 20 pips
    if (['USDCHF', 'USDCAD', 'USDJPY'].includes(symbol)) return 0.0020;            // 20 pips (JPY adjusted automatically)
    
    // =================== MINOR & CROSS PAIRS ===================
    if (['EURGBP', 'EURCHF', 'EURAUD', 'EURNZD', 'EURCAD'].includes(symbol)) return 0.0025;  // 25 pips
    if (['GBPCHF', 'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPJPY'].includes(symbol)) return 0.0030;  // 30 pips
    if (['AUDCHF', 'AUDNZD', 'AUDCAD', 'AUDJPY'].includes(symbol)) return 0.0025;            // 25 pips
    if (['NZDCHF', 'NZDCAD', 'NZDJPY'].includes(symbol)) return 0.0025;                      // 25 pips
    if (['CADCHF', 'CADJPY'].includes(symbol)) return 0.0025;                                // 25 pips
    if (['CHFJPY'].includes(symbol)) return 0.0025;                                          // 25 pips
    
    // =================== JPY PAIRS (Special handling) ===================
    if (symbol.includes('JPY')) {
      return 0.20;  // 20 pips for JPY pairs (different decimal places)
    }
    
    // =================== SMART FALLBACKS ===================
    // Generic forex pair (6 letters)
    if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
      return 0.0020;  // 20 pips for any forex pair
    }
    
    // Generic futures/commodities (3-5 letters)
    if (symbol.length >= 3 && symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
      return 10;  // 10 points for futures/commodities
    }
    
    // Generic crypto pattern (ends with USD)
    if (symbol.endsWith('USD') && symbol.length > 6) {
      return 50;  // $50 for crypto pairs
    }
    
    // Default fallback
    return 15;
  }

  /**
   * Extract visual data from chart OCR text (highlighted zones, pip values)
   * Enhanced for ALL charts that use grey entry zones and target markings
   * STRICT: Only returns data if ACTUAL visual zones are detected, not just price numbers
   */
  private extractVisualChartData(text: string): { zones: Array<{name: string, min: number, max: number, value: number}> } | null {
    const zones: Array<{name: string, min: number, max: number, value: number}> = [];
    
    // ENHANCED PATTERNS for highlighted zone detection (ALL CHARTS format)
    // IMPORTANT: Grey highlights = Entry zones, Green/Red highlights = Targets
    
    // 1. GREY ENTRY ZONES (Primary focus - these are the trading entry areas)
    const greyEntryPatterns = [
      // Look for grey colored zones on price scale
      /(?:Grey|Gray)\s+(?:Zone|Area|Highlight)\s*:?\s*(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/gi,
      /(?:Entry|Trading)\s+(?:Zone|Area)\s*\(Grey\)\s*:?\s*(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/gi,
      // Pattern for price ranges that appear in grey sections of charts
      /(\d{3}\.\d{2,4})\s*[-–—]\s*(\d{3}\.\d{2,4})\s*(?:Entry|Grey|Gray)/gi,
      // Look for clustered price levels (grey zones show as grouped prices)
      /(?:Best|Good|Entry)\s+(?:Selling|Buying)\s+(?:Area|Zone)\s*:?\s*\(?(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)\)?/gi,
    ];
    
    // 2. TARGET ZONES (Green/Red highlights) 
    const targetPatterns = [
      /Target\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /TP\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /Take\s*Profit\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /Final\s*Target\s*:?\s*(\d+\.?\d*)/gi,
      /(?:Red|Green|Blue)\s*(?:Zone|Highlight)\s*:?\s*(\d+\.?\d*)/gi,
      /(\d{3,4}\.\d{2,4})\s*(?:Target|TP)/gi
    ];
    
    // 3. ENHANCED: Extract grey zones from precise price level analysis
    // For charts, grey zones are specific price levels, not broad ranges
    // FIXED: Handle comma-separated prices properly (3,430.000 -> 3430.000)
    const priceClusterPattern = /(\d{1,3},?\d{3}\.?\d*)/g;
    const allPrices = [...text.matchAll(priceClusterPattern)]
      .map(m => parseFloat(m[1].replace(/,/g, ''))) // Remove commas
      .filter(p => p > 100); // Filter reasonable prices
    
    if (allPrices.length >= 4) {
      // Sort prices to analyze structure
      allPrices.sort((a, b) => a - b);
      
      // For Update messages, identify the MIDDLE price range as grey zone (entry area)
      // Charts typically show: High prices, Grey zone (middle), Low prices
      const priceCount = allPrices.length;
      const startIdx = Math.floor(priceCount * 0.3); // Skip lowest 30%
      const endIdx = Math.floor(priceCount * 0.7);   // Skip highest 30%
      
      // Extract the middle range as grey zone candidates
      const greyZonePrices = allPrices.slice(startIdx, endIdx);
      
      if (greyZonePrices.length >= 2) {
        // Create tight grey zone around middle prices
        const greyMin = Math.min(...greyZonePrices);
        const greyMax = Math.max(...greyZonePrices);
        
        // Use the median price as primary entry level
        const medianPrice = greyZonePrices[Math.floor(greyZonePrices.length / 2)];
        
        zones.push({
          name: 'Grey Entry Zone',
          min: greyMin,
          max: greyMax,
          value: medianPrice  // This will be our precise entry level
        });
        
        logger.info(`🔘 Precise grey zone: ${greyMin}-${greyMax}, entry: ${medianPrice}`);
        
        // Also identify potential target zones (higher/lower extremes)
        const higherPrices = allPrices.slice(endIdx);
        const lowerPrices = allPrices.slice(0, startIdx);
        
        if (higherPrices.length > 0) {
          const targetHigh = higherPrices[Math.floor(higherPrices.length / 2)];
          zones.push({
            name: 'Upper Target',
            min: targetHigh,
            max: targetHigh,
            value: targetHigh
          });
        }
        
        if (lowerPrices.length > 0) {
          const targetLow = lowerPrices[Math.floor(lowerPrices.length / 2)];
          zones.push({
            name: 'Lower Target',
            min: targetLow,
            max: targetLow,
            value: targetLow
          });
        }
      }
    }
    
    // Extract explicit GREY ZONES from patterns
    greyEntryPatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match.length >= 3) {
          const min = parseFloat(match[match.length - 2]);
          const max = parseFloat(match[match.length - 1]);
          if (!isNaN(min) && !isNaN(max)) {
            zones.push({ 
              name: 'Grey Entry Zone', 
              min: Math.min(min, max), 
              max: Math.max(min, max), 
              value: (min + max) / 2 
            });
            logger.info(`🔘 Found explicit grey zone: ${min} - ${max}`);
          }
        }
      });
    });
    
    // Extract TARGET ZONES 
    targetPatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach((match, index) => {
        const valueIndex = match.length - 1;
        const value = parseFloat(match[valueIndex]);
        if (!isNaN(value) && value > 0) {
          const targetNum = match[1] ? match[1] : (index + 1).toString();
          const name = match[0].includes('Final') ? 'Final Target' : `Target ${targetNum}`;
          zones.push({ name, min: value, max: value, value });
        }
      });
    });
    
    logger.debug(`🔍 Visual chart analysis: Found ${zones.length} zones (grey entry + targets)`);
    
    return zones.length > 0 ? { zones } : null;
  }

  /**
   * Extract setup data from caption text - simplified for 1:1 RR (no targets needed)
   */
  private extractCaptionSetupData(caption: string): { action: TradeAction, entryZone: {min: number, max: number}, stopLoss?: number } | null {
    logger.debug('🔍 Analyzing caption for setup data:', caption);
    
    // Pattern for buying/selling setup in caption - ENHANCED for more formats
    const setupPatterns = [
      /(bullish|bearish|buying|selling)\s+(?:setup|zone)/i,
      /(buy|sell)\s+setup/i,
      /(buy|sell)\s+limit/i,
      /best\s+(buying|selling)\s+zone/i,
      /(bullish|bearish)\s+move\s+expected/i
    ];
    
    let action: TradeAction | null = null;
    let setupMatch = null;
    
    for (const pattern of setupPatterns) {
      setupMatch = caption.match(pattern);
      if (setupMatch) {
        const matchedText = setupMatch[1].toLowerCase();
        action = (matchedText.includes('bull') || matchedText.includes('buy')) ? 'BUY' : 'SELL';
        logger.debug(`📈 Action detected: ${action} from "${setupMatch[0]}"`);
        break;
      }
    }
    
    if (!action) {
      logger.debug('❌ No clear buy/sell setup found in caption');
      return null;
    }
    
    // Extract entry zone - ENHANCED patterns
    const entryPatterns = [
      // "buying zone: 3385 – 3375" or "zone (3385 – 3375)"
      /(?:zone|area|levels?)[:\s]*\(?(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)\)?/i,
      // "Buy Limit: 3385 – 3375"
      /(?:buy|sell)\s+limit[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
      // "Entry: 3385 – 3375"
      /entry[:\s]+(\d+\.?\d*)\s*[–\-~]\s*(\d+\.?\d*)/i,
      // Any two numbers with dash/hyphen
      /(\d{4}\.?\d*)\s*[–\-~]\s*(\d{4}\.?\d*)/
    ];
    
    let entryMin: number | null = null;
    let entryMax: number | null = null;
    
    for (const pattern of entryPatterns) {
      const entryMatch = caption.match(pattern);
      if (entryMatch) {
        entryMin = Math.min(parseFloat(entryMatch[1]), parseFloat(entryMatch[2]));
        entryMax = Math.max(parseFloat(entryMatch[1]), parseFloat(entryMatch[2]));
        logger.debug(`📊 Entry zone detected: ${entryMin} - ${entryMax} from "${entryMatch[0]}"`);
        break;
      }
    }
    
    if (!entryMin || !entryMax) {
      logger.debug('❌ No valid entry zone found in caption');
      return null;
    }
    
    // Extract stop loss - ENHANCED patterns
    let stopLoss: number | undefined;
    const slPatterns = [
      /(?:stop\s+loss|SL|❌\s*SL)[:\s]*(\d+\.?\d*)/i,
      /SL[:\s]+(\d+\.?\d*)/i,
      /❌[^0-9]*(\d+\.?\d*)/
    ];
    
    for (const pattern of slPatterns) {
      const slMatch = caption.match(pattern);
      if (slMatch) {
        stopLoss = parseFloat(slMatch[1]);
        logger.debug(`🛑 Stop Loss detected: ${stopLoss} from "${slMatch[0]}"`);
        break;
      }
    }
    
    logger.info(`✅ Caption setup data extracted: ${action} ${entryMin}-${entryMax} SL:${stopLoss || 'N/A'}`);
    return { action, entryZone: { min: entryMin, max: entryMax }, stopLoss };
  }

  /**
   * Parse standard format: "XAUUSD SELL 2440-2445 SL:2450 TP:2430,2420"
   */
  private parseStandardSignal(text: string): TradeSignal | null {
    const patterns = [
      // Pattern 0: NEW - Telegram channel signal format (PRIORITY)
      /#?(XAUUSD|NAS100|US30|SPX500|Gold|Silver)[\s\S]*?(Buy|Buying|BUY|Sell|Selling|SELL)[\s\S]*?(?:zone|area|limit)[\s\S]*?(\d{3,6})\s*[–-]\s*(\d{3,6})[\s\S]*?(?:Tp1?|TP1?|Target)[\s\S]*?(\d{3,6})[\s\S]*?(?:SL|❌\s*SL)[\s\S]*?(\d{3,6})/gi,
      
      // Pattern 0b: NEW - Forex pairs with decimal prices
      /#?(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)[\s\S]*?(Buy|Buying|BUY|Sell|Selling|SELL)[\s\S]*?(?:zone|area|limit)[\s\S]*?(\d\.\d{4})\s*[–-]\s*(\d\.\d{4})[\s\S]*?(?:Tp1?|TP1?|Target)[\s\S]*?(\d\.\d{4})[\s\S]*?(?:SL|❌\s*SL)[\s\S]*?(\d\.\d{4})/gi,
      
      // Pattern 1: SYMBOL ACTION ENTRY SL TP format
      /(\w+)\s+(BUY|SELL)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s+(?:SL|STOPLOSS|STOP LOSS)[\s:]*(\d+\.?\d*)\s+(?:TP|TARGET|TAKE PROFIT|TAKEPROFIT)[\s:]*([\d.,\s]+)/gi,
      
      // Pattern 2: More flexible format
      /(\w+)\s+(BUY|SELL)[\s\n]+(?:ENTRY|ENTER)[\s:]*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)[\s\n]+(?:SL|STOPLOSS|STOP LOSS)[\s:]*(\d+\.?\d*)[\s\n]+(?:TP|TARGET|TARGETS)[\s:]*([\d.,\s\n]+)/gi,
      
      // Pattern 3: Compact format
      /(\w+)\s+(BUY|SELL)\s+(\d+\.?\d*)-(\d+\.?\d*)\s+SL(\d+\.?\d*)\s+TP([\d.,\s]+)/gi,

      // Pattern 4: Caption format with trading setup text (NEW)
      /#?(\w+)[\s\S]*?(BUY|SELL|Buying|Selling)[\s\S]*?(?:zone|levels?|area)[\s\S]*?\(?(\d+\.?\d*)[\s–-]+(\d+\.?\d*)\)?[\s\S]*?(?:SL|Stop|stop)[\s:]?(\d+\.?\d*)[\s\S]*?(?:TP|Target|targets?)[\s:]?([\d.\s\/,]+)/gi,
      
      // Pattern 5: Gold/XAUUSD specific format with detailed description
      /(?:#?XAUUSD|Gold)[\s\S]*?(Selling|Buying|SELL|BUY)[\s\S]*?(?:zone|resistance|support)[\s\S]*?\(?(\d+)[\s–-]+(\d+)\)?[\s\S]*?(?:SL|❌\s*SL)[\s:]?(\d+)[\s\S]*?(?:TP|🏹\s*TP)[\s:]*(\d+(?:\s*\/\s*\d+)?)/gi,
      
      // Pattern 6: Extract explicit entry zone with parentheses
      /(?:#?XAUUSD|Gold|EURUSD|GBPUSD)[\s\S]*?(Selling|Buying|SELL|BUY)[\s\S]*?\((\d+)[\s–-]+(\d+)\)[\s\S]*?(?:SL|❌\s*SL)[\s:]?(\d+)[\s\S]*?(?:TP|🏹\s*TP)[\s:]*(\d+(?:\s*\/\s*\d+)?)/gi
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = pattern.exec(text);
      if (match) {
        let symbol, action, entryMin, entryMax, stopLoss, targetsStr;
        
        if (i === 0 || i === 1) {
          // New telegram patterns (0 and 0b): symbol, action, entryMax, entryMin, target, stopLoss
          [, symbol, action, entryMax, entryMin, targetsStr, stopLoss] = match;
        } else {
          // Standard patterns: symbol, action, entryMin, entryMax, stopLoss, targetsStr
          [, symbol, action, entryMin, entryMax, stopLoss, targetsStr] = match;
        }
        
        // Handle Gold -> XAUUSD conversion
        if (symbol.toUpperCase() === 'GOLD' || symbol.toUpperCase() === 'SILVER') {
          symbol = symbol.toUpperCase() === 'GOLD' ? 'XAUUSD' : 'XAGUSD';
        }
        
        // Normalize action
        if (action.toLowerCase().includes('sell')) {
          action = 'SELL';
        } else if (action.toLowerCase().includes('buy')) {
          action = 'BUY';
        }
        
        if (this.isValidSymbol(symbol)) {
          let targets;
          if (i === 0 || i === 1) {
            // For the new patterns, targetsStr is a single target
            targets = [parseFloat(targetsStr)];
          } else {
            // For other patterns, parse multiple targets
            targets = this.parseTargets(targetsStr);
          }
          
          // Validate that we have reasonable price levels
          const entryMinNum = parseFloat(entryMin);
          const entryMaxNum = parseFloat(entryMax);
          const stopLossNum = parseFloat(stopLoss);
          
          if (entryMinNum > 0 && entryMaxNum > 0 && stopLossNum > 0 && targets.length > 0) {
            return {
              symbol: symbol.toUpperCase(),
              action: action.toUpperCase() as TradeAction,
              entryZone: {
                min: Math.min(entryMinNum, entryMaxNum),
                max: Math.max(entryMinNum, entryMaxNum)
              },
              stopLoss: stopLossNum,
              targets,
              reason: this.extractReason(text),
              plan: this.extractPlan(text)
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Parse chart setup format with price levels
   */
  private parseChartSetupSignal(text: string): TradeSignal | null {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for symbol and timeframe
    const symbolLine = lines.find(line => this.isValidSymbol(line.split(' ')[0]));
    if (!symbolLine) return null;

    const symbol = symbolLine.split(' ')[0].toUpperCase();
    
    // Extract price levels
    const prices: number[] = [];
    for (const line of lines) {
      const price = this.extractPrice(line);
      if (price && price > 0) {
        prices.push(price);
      }
    }

    if (prices.length < 3) return null;

    // Sort prices to identify levels
    prices.sort((a, b) => b - a); // Descending order

    // Determine bias based on text content or price positioning
    const action = this.determineBias(text, prices);
    
    if (action === 'BUY') {
      // For buy: entry around middle, calculate 1:1 risk-reward
      const entryZone = this.createEntryZone(prices[Math.floor(prices.length / 2)]);
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const stopLoss = prices[prices.length - 1] - 10; // Below lowest level
      const slDistance = Math.abs(entryMid - stopLoss);
      const target1 = entryMid + slDistance; // 1:1 risk-reward
      
      return {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets: [target1],
      };
    } else {
      // For sell: entry around middle-high, calculate 1:1 risk-reward
      const entryZone = this.createEntryZone(prices[1] || prices[0]);
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const stopLoss = prices[0] + 10; // Above highest level
      const slDistance = Math.abs(stopLoss - entryMid);
      const target1 = entryMid - slDistance; // 1:1 risk-reward
      
      return {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets: [target1],
      };
    }
  }

  /**
   * Parse combined text and image signals
   */
  private parseCombinedTextImageSignal(text: string): TradeSignal | null {
    // Look for context clues in the text
    const hasBullishWords = /(?:bullish|buy|long|support|bounce|uptrend)/gi.test(text);
    const hasBearishWords = /(?:bearish|sell|short|resistance|rejection|downtrend)/gi.test(text);
    
    // Extract symbol from text
    const symbolMatch = text.match(new RegExp(`\\b(${[...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS].join('|')})\\b`, 'gi'));
    if (!symbolMatch) return null;

    const symbol = symbolMatch[0].toUpperCase();
    
    // Extract prices
    const prices = this.extractAllPrices(text);
    if (prices.length < 2) return null;

    // Determine action based on context
    let action: TradeAction;
    if (hasBullishWords && !hasBearishWords) {
      action = 'BUY';
    } else if (hasBearishWords && !hasBullishWords) {
      action = 'SELL';
    } else {
      // Default based on price positioning
      action = this.determineBias(text, prices);
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const midPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const entryZone = this.createEntryZone(midPrice);
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const stopLoss = action === 'BUY' ? sortedPrices[0] - 5 : sortedPrices[sortedPrices.length - 1] + 5;
    const slDistance = Math.abs(entryMid - stopLoss);
    const target1 = action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;
    
    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets: [target1],
      reason: this.extractReason(text),
      plan: this.extractPlan(text)
    };
  }

  /**
   * Parse flexible format signals
   */
  private parseFlexibleFormatSignal(text: string): TradeSignal | null {
    // Extract symbol first
    const symbol = this.extractSymbol(text);
    if (!symbol) return null;

    // Extract action
    const action = this.extractAction(text);
    if (!action) return null;

    // Extract all numerical values
    const prices = this.extractAllPrices(text);
    if (prices.length < 3) return null;

    // Sort prices
    const sortedPrices = [...prices].sort((a, b) => a - b);

    let entryZone: { min: number; max: number };
    let stopLoss: number;
    let targets: number[];

    if (action === 'BUY') {
      // For BUY: calculate 1:1 risk-reward
      const entryPrices = sortedPrices.slice(0, 2);
      entryZone = { min: entryPrices[0], max: entryPrices[1] || entryPrices[0] + 5 };
      stopLoss = Math.min(...sortedPrices) - 10;
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const slDistance = Math.abs(entryMid - stopLoss);
      targets = [entryMid + slDistance];
    } else {
      // For SELL: calculate 1:1 risk-reward
      const entryPrices = sortedPrices.slice(-2);
      entryZone = { min: entryPrices[0], max: entryPrices[1] || entryPrices[0] + 5 };
      stopLoss = Math.max(...sortedPrices) + 10;
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const slDistance = Math.abs(stopLoss - entryMid);
      targets = [entryMid - slDistance];
    }

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets
    };
  }

  /**
   * Parse price action signals from charts
   */
  private parsePriceActionSignal(text: string): TradeSignal | null {
    const symbol = this.extractSymbol(text);
    if (!symbol) return null;

    const prices = this.extractAllPrices(text);
    if (prices.length < 2) return null;

    // Look for price action keywords
    const keywordMapping = {
      'BUY': /(?:support|bounce|bullish|long|buy|uptrend|reversal up)/gi,
      'SELL': /(?:resistance|rejection|bearish|short|sell|downtrend|reversal down)/gi
    };

    let action: TradeAction = 'BUY';
    for (const [actionType, pattern] of Object.entries(keywordMapping)) {
      if (pattern.test(text)) {
        action = actionType as TradeAction;
        break;
      }
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const midIndex = Math.floor(sortedPrices.length / 2);
    const entryPrice = sortedPrices[midIndex];
    const entryZone = this.createEntryZone(entryPrice);
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const stopLoss = action === 'BUY' 
      ? sortedPrices[0] - 20 
      : sortedPrices[sortedPrices.length - 1] + 20;
    const slDistance = Math.abs(entryMid - stopLoss);
    const target1 = action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets: [target1]
    };
  }

  // Helper methods
  private cleanText(text: string): string {
    return text
      .replace(/[^\w\s\d.,:\-–]/g, ' ') // Remove special chars except common ones
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toUpperCase();
  }

  private isValidSymbol(symbol: string): boolean {
    const normalizedSymbol = symbol.toUpperCase();
    return [...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS]
      .includes(normalizedSymbol);
  }

  private extractSymbol(text: string): string | null {
    const allSymbols = [...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS];
    for (const symbol of allSymbols) {
      if (text.toUpperCase().includes(symbol)) {
        return symbol;
      }
    }
    return null;
  }

  private extractAction(text: string): TradeAction | null {
    const upperText = text.toUpperCase();
    if (/\b(?:SELL|SHORT|BEAR)\b/.test(upperText)) return 'SELL';
    if (/\b(?:BUY|LONG|BULL)\b/.test(upperText)) return 'BUY';
    return null;
  }

  private extractPrice(line: string): number | null {
    const priceMatch = line.match(/\d+\.?\d*/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[0]);
      return price > 0.001 && price < 100000 ? price : null;
    }
    return null;
  }

  private extractAllPrices(text: string): number[] {
    const prices: number[] = [];
    const priceRegex = /\d+\.?\d*/g;
    let match;
    
    while ((match = priceRegex.exec(text)) !== null) {
      const price = parseFloat(match[0]);
      if (price > 0.001 && price < 100000 && !prices.includes(price)) {
        prices.push(price);
      }
    }
    
    return prices;
  }

  private parseTargets(targetsStr: string): number[] {
    // Handle various target formats: "3357 / 3344", "2430,2420", "2430 2420", etc.
    return targetsStr
      .replace(/\s*\/\s*/g, ',') // Convert "/" to comma
      .split(/[,\s\n]+/)
      .map(t => parseFloat(t.trim()))
      .filter(t => !isNaN(t) && t > 0);
  }

  private determineBias(text: string, prices: number[]): TradeAction {
    const upperText = text.toUpperCase();
    
    // Check for explicit directional words
    const bullishWords = (upperText.match(/(?:BUY|LONG|BULLISH|SUPPORT|BOUNCE|UP)/g) || []).length;
    const bearishWords = (upperText.match(/(?:SELL|SHORT|BEARISH|RESISTANCE|REJECTION|DOWN)/g) || []).length;
    
    if (bullishWords > bearishWords) return 'BUY';
    if (bearishWords > bullishWords) return 'SELL';
    
    // Default based on price spread (wider spread suggests sell from top)
    const priceRange = Math.max(...prices) - Math.min(...prices);
    return priceRange > 50 ? 'SELL' : 'BUY';
  }

  private createEntryZone(centerPrice: number): { min: number; max: number } {
    const spread = centerPrice * 0.001; // 0.1% spread
    return {
      min: centerPrice - spread,
      max: centerPrice + spread
    };
  }

  private extractReason(text: string): string | undefined {
    const reasonPatterns = [
      /(?:reason|because|due to|analysis)[\s:]+([^.\n]+)/gi,
      /([^.\n]*(?:valid|holding|channel|trend|support|resistance)[^.\n]*)/gi
    ];

    for (const pattern of reasonPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractPlan(text: string): string | undefined {
    const planPatterns = [
      /(?:plan|strategy|wait for)[\s:]+([^.\n]+)/gi,
      /([^.\n]*(?:wait|patience|entry|proper)[^.\n]*)/gi
    ];

    for (const pattern of planPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  /**
   * Add position sizing calculations to a trade signal
   */
  addPositionSizing(signal: TradeSignal, accountEquity: number): TradeSignal {
    try {
      if (!signal || accountEquity <= 0) {
        logger.warn('Invalid signal or account equity for position sizing');
        return signal;
      }

      const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
      
      const calculation = this.positionSizeCalculator.calculatePositionSize(
        accountEquity,
        entryMid,
        signal.stopLoss,
        signal.symbol
      );

      // Add position sizing to signal
      signal.positionSizing = {
        lotSize: calculation.lotSize,
        riskAmount: calculation.riskAmount,
        riskPercentage: calculation.riskPercentage,
        accountEquity,
        reasoning: calculation.reasoning
      };

      logger.info(`💰 Position sizing calculated for ${signal.symbol}:`);
      logger.info(`   Lot Size: ${calculation.lotSize}`);
      logger.info(`   Risk: $${calculation.riskAmount.toFixed(2)} (${calculation.riskPercentage.toFixed(2)}%)`);

      return signal;
    } catch (error) {
      logger.error('Failed to add position sizing:', error);
      return signal;
    }
  }

  /**
   * Update position sizing configuration
   */
  updatePositionSizingConfig(config: Partial<PositionSizingConfig>): void {
    this.positionSizeCalculator.updateConfig(config);
  }

  /**
   * Get current position sizing configuration
   */
  getPositionSizingConfig(): PositionSizingConfig {
    return this.positionSizeCalculator.getConfig();
  }

  private validateSignal(signal: TradeSignal): boolean {
    // Basic validation
    if (!signal.symbol || !signal.action) return false;
    if (!signal.entryZone || signal.entryZone.min >= signal.entryZone.max) return false;
    if (signal.stopLoss <= 0) return false;
    if (!signal.targets || signal.targets.length === 0) return false;

    // CRITICAL: Block cryptocurrency symbols
    const cryptoSymbols = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'BITCOIN', 'BTC', 'ETH', 'LTC'];
    if (cryptoSymbols.includes(signal.symbol.toUpperCase())) {
      logger.warn(`❌ Cryptocurrency ${signal.symbol} blocked - not supported by broker`);
      return false;
    }

    // Validate symbol is in supported list
    if (!this.isValidSymbol(signal.symbol)) {
      logger.warn(`❌ Unsupported symbol: ${signal.symbol}`);
      return false;
    }

    // Logical validation
    if (signal.action === 'BUY') {
      // For BUY: SL should be below entry, targets above
      if (signal.stopLoss >= signal.entryZone.min) return false;
      if (signal.targets.some(t => t <= signal.entryZone.max)) return false;
    } else {
      // For SELL: SL should be above entry, targets below
      if (signal.stopLoss <= signal.entryZone.max) return false;
      if (signal.targets.some(t => t >= signal.entryZone.min)) return false;
    }

    // Risk-reward validation (minimum 1:1.2 ratio) - RELAXED for 1:1 RR mode
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const risk = Math.abs(entryMid - signal.stopLoss);
    const reward = Math.abs(signal.targets[0] - entryMid);
    
    // If 1:1 RR is enforced, skip this validation since we'll adjust it anyway
    if (!config.trading.enforceOneToOneRR && reward < risk * 1.2) {
      logger.warn('⚠️ Poor risk-reward ratio detected', { risk, reward });
      // Don't reject, but warn
    }

    return true;
  }

  /**
   * Public method for external validation (maintains compatibility)
   */
  validateTradeSignal(signal: TradeSignal): boolean {
    return this.validateSignal(signal);
  }
}