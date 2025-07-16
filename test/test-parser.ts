import { TradeParser } from '../src/ocr/tradeParser';

// Test the trade parser with sample text
const parser = new TradeParser();

const sampleText = `
#XAUUSD (Updates) Sell Setup

4 Selling Zone: 3345 - 3351
4 Stop Loss: 3367
4 Targets:

Target 1: 3312.430
Target 2: 3295.385
Final Target: 3255.439

Reason:
Rising Wedge Pattern (Bearish)
Strong Resistance Zone
Expecting sharp drop after retest.

Plan: Wait for entry in the selling zone
and sell with proper SL.
`;

console.log('Testing trade signal parsing...');
const signal = parser.parseTradeSignal(sampleText);

if (signal) {
  console.log('✅ Successfully parsed trade signal:');
  console.log(JSON.stringify(signal, null, 2));
  
  const isValid = parser.validateTradeSignal(signal);
  console.log(`✅ Signal validation: ${isValid ? 'PASSED' : 'FAILED'}`);
} else {
  console.log('❌ Failed to parse trade signal');
}
