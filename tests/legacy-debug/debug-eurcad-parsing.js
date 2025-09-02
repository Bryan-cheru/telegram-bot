const fs = require('fs');
const path = require('path');

// Mock the logger to capture logs
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

// Read and compile the TradeParser
function loadTradeParser() {
  const tsContent = fs.readFileSync(
    path.join(__dirname, 'src', 'ocr', 'tradeParser.ts'), 
    'utf-8'
  );
  
  // Simple TS to JS conversion (remove types)
  const jsContent = tsContent
    .replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '') // Remove imports
    .replace(/export\s+/g, '') // Remove exports
    .replace(/:\s*[A-Za-z\[\]<>{}\|]+(?:\s*=|\s*\{|\s*;|\s*,|\s*\))/g, '') // Remove type annotations
    .replace(/private\s+/g, '') // Remove private keyword
    .replace(/public\s+/g, '') // Remove public keyword
    .replace(/readonly\s+/g, '') // Remove readonly keyword
    .replace(/as\s+[A-Za-z]+/g, '') // Remove type assertions
    .replace(/\?\s*:/g, ':') // Remove optional markers
    .replace(/<[^>]+>/g, '') // Remove generic types
    .replace(/interface\s+\w+\s*\{[^}]+\}/g, '') // Remove interfaces
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, ''); // Remove type definitions

  return jsContent;
}

// Test EURCAD parsing
async function testEURCADParsing() {
  console.log('🧪 Testing EURCAD Parsing Debug...\n');
  
  // Simulate EURCAD chart OCR text
  const eurCadText = `
    Euro / Canadian Dollar • 2h • OANDA
    CAD
    1.61850
    1.61381
    1.61290
    1.61032
    Support Become a Resistance
    1.60829
    1.60602
    1.60500
    Target
    1.59860
    1.59854
    EURCAD
    2h
    #EURCAD selling zone (1.61032) - (1.60829)
    SL: 1.61200
    TP: 1.59860
  `;

  console.log('📄 Input text:', eurCadText.substring(0, 200) + '...\n');

  try {
    // Load and execute the parser
    const jsCode = loadTradeParser();
    const TradeParserClass = eval(`
      ${jsCode}
      
      // Mock dependencies
      const OrderType = { MARKET: 'MARKET', LIMIT: 'LIMIT' };
      const TradeAction = { BUY: 'BUY', SELL: 'SELL' };
      
      class MockPositionSizing {
        calculateLotSize() {
          return { lotSize: 1.0, riskAmount: 100, riskPercentage: 2 };
        }
      }
      
      class MockOrderTypeDetector {
        detectOrderType() {
          return { orderType: 'LIMIT', confidence: 0.8 };
        }
      }
      
      // Create parser instance with mocks
      const parser = new TradeParser();
      parser.positionSizing = new MockPositionSizing();
      parser.orderTypeDetector = new MockOrderTypeDetector();
      
      parser
    `);

    console.log('🔍 Testing parseTradeSignal...\n');
    const result = TradeParserClass.parseTradeSignal(eurCadText, 'eurcad_test.jpg');
    
    if (result) {
      console.log('✅ SUCCESS! EURCAD parsed:');
      console.log('Symbol:', result.symbol);
      console.log('Action:', result.action);  
      console.log('Entry Zone:', result.entryZone);
      console.log('Stop Loss:', result.stopLoss);
      console.log('Targets:', result.targets);
      console.log('Reason:', result.reason);
    } else {
      console.log('❌ FAILED - No trade signal found');
    }

  } catch (error) {
    console.error('💥 Error during parsing:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEURCADParsing();
