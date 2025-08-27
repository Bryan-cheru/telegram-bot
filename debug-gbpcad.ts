// Debug GBPCAD parsing
import { TradeParser } from './src/ocr/tradeParser';

const parser = new TradeParser();

// Very simple GBPCAD test with clear patterns
const simpleText = `
GBPCAD
Selling Area (1.84000-1.84500)
Target 1 1.83500
Target 2 1.83000
Final Target 1.82500
`;

const caption = `#GBPCAD setup!`;

console.log('🧪 Debug: Simple GBPCAD Test');
console.log('Text:', simpleText);
console.log('Caption:', caption);

const result = parser.parseTradeSignal(simpleText, caption);

if (result) {
  console.log('\n✅ SUCCESS:');
  console.log('   Symbol:', result.symbol);
  console.log('   Action:', result.action);
  console.log('   Entry Zone:', result.entryZone);
  console.log('   Stop Loss:', result.stopLoss);
  console.log('   Targets:', result.targets);
} else {
  console.log('❌ FAILED - Let me try another approach...');
  
  // Try with just prices in forex range
  const pricesOnly = `
  1.84500
  1.84000
  1.83500
  1.83000
  1.82500
  `;
  
  console.log('\n🧪 Testing prices only approach:');
  const result2 = parser.parseTradeSignal(pricesOnly, caption);
  
  if (result2) {
    console.log('✅ Prices-only approach worked:');
    console.log('   Symbol:', result2.symbol);
    console.log('   Action:', result2.action);
    console.log('   Entry Zone:', result2.entryZone);
    console.log('   Targets:', result2.targets);
  } else {
    console.log('❌ Prices-only approach also failed');
  }
}
