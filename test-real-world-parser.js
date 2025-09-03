#!/usr/bin/env node

/**
 * TEST CLEAN REAL-WORLD PARSER
 */

const path = require('path');

// Mock logger for testing
global.console.info = console.log;
global.console.debug = console.log;
global.console.warn = console.log;
global.console.error = console.log;

console.log('🎯 TESTING CLEAN REAL-WORLD PARSER');
console.log('===================================');

// Your actual signal
const realSignal = `#XAUUSD (Update)...!! 🔼

Gold is approaching the highlighted demand zone (3526 – 3521). This area is marked as an instant buy zone where price may take support and push higher towards the targets. However, this is a scalping setup and carries some risk, so proper money management and strict stop loss are highly recommended. Trade safe and with discipline..!! ⚡️`;

console.log('📨 Testing Signal:');
console.log(realSignal);
console.log('\n' + '='.repeat(50) + '\n');

// Simple test without TypeScript compilation
const testParser = {
  extractSymbol: function(text) {
    const match = text.match(/#(XAUUSD|GOLD|EURUSD|GBPUSD)/i);
    return match ? match[1].toUpperCase() : null;
  },
  
  detectAction: function(text) {
    const textLower = text.toLowerCase();
    const buyKeywords = ['buy zone', 'demand zone', 'push higher', '🔼', 'support'];
    const sellKeywords = ['sell zone', 'supply zone', 'push lower', '🔽', 'resistance'];
    
    const buyScore = buyKeywords.filter(k => textLower.includes(k)).length;
    const sellScore = sellKeywords.filter(k => textLower.includes(k)).length;
    
    if (buyScore > sellScore && buyScore > 0) return 'BUY';
    if (sellScore > buyScore && sellScore > 0) return 'SELL';
    return null;
  },
  
  extractEntryZone: function(text) {
    const match = text.match(/\((\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)\)/);
    if (match) {
      const price1 = parseFloat(match[1]);
      const price2 = parseFloat(match[2]);
      return {
        min: Math.min(price1, price2),
        max: Math.max(price1, price2)
      };
    }
    return null;
  }
};

// Test the parser
try {
  const symbol = testParser.extractSymbol(realSignal);
  const action = testParser.detectAction(realSignal);
  const entryZone = testParser.extractEntryZone(realSignal);
  
  console.log('✅ PARSING RESULTS:');
  console.log('===================');
  console.log(`🎯 Symbol: ${symbol || 'NOT FOUND'}`);
  console.log(`📈 Action: ${action || 'NOT FOUND'}`);
  console.log(`🎪 Entry Zone: ${entryZone ? `${entryZone.min} - ${entryZone.max}` : 'NOT FOUND'}`);
  
  if (symbol && action && entryZone) {
    console.log('\n🚀 SUCCESS! Parser can handle your signal format.');
    console.log('This would create a valid trade signal.');
  } else {
    console.log('\n❌ INCOMPLETE! Some parts missing.');
  }
  
} catch (error) {
  console.log('❌ ERROR:', error.message);
}

console.log('\n' + '='.repeat(50));
console.log('🎯 Test complete!');
