// Test EURGBP without any code changes
import { TradeParser } from './src/ocr/tradeParser';

const parser = new TradeParser();

// Test EURGBP with simple data
const eurgbpText = `
EURGBP
0.86513
0.86417
0.86325
0.86106
`;

const eurgbpCaption = `#EURGBP (Update)...!!

Next move possible use proper money management Good luck Guy's..❣️`;

console.log('🧪 Testing EURGBP (should work already)...');
const result = parser.parseTradeSignal(eurgbpText, eurgbpCaption);

if (result) {
  console.log('\n✅ EURGBP WORKS:');
  console.log('   Symbol:', result.symbol);
  console.log('   Action:', result.action);
  console.log('   Entry Zone:', result.entryZone);
  console.log('   Stop Loss:', result.stopLoss);
  console.log('   Targets:', result.targets);
} else {
  console.log('❌ EURGBP needs support');
}
