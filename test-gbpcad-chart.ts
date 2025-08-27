// Test GBPCAD chart parsing with highlighted zones
import { TradeParser } from './src/ocr/tradeParser';

const parser = new TradeParser();

// Simulate GBPCAD chart from the image with highlighted zones
const gbpcadChartText = `
GBPCAD Chart Analysis
British Pound / Canadian Dollar 4h OANDA

Price Levels:
1.86346 (Target)
1.85689
1.85038
1.84262
1.83611
1.83381

Green Zones (Support/Buying):
Buying Zone (1.85038-1.86346)
Target 1 1.86346

Pink Zones (Resistance/Selling):
Selling Zone (1.83381-1.84262)
Target 1 1.83611
Target 2 1.83381
`;

const gbpcadCaption = `#GBPCAD (Update)...!!

Next move possible use proper money management Good luck Guy's..❣️`;

console.log('🧪 Testing GBPCAD Chart Parsing...');
console.log('📊 Chart OCR:', gbpcadChartText);
console.log('📝 Caption:', gbpcadCaption);

// Test with both chart OCR and caption
const result = parser.parseTradeSignal(gbpcadChartText, gbpcadCaption);

if (result) {
  console.log('\n✅ SUCCESSFULLY PARSED GBPCAD CHART:');
  console.log('   Symbol:', result.symbol);
  console.log('   Action:', result.action);
  console.log('   Entry Zone:', result.entryZone);
  console.log('   Stop Loss:', result.stopLoss);
  console.log('   Targets:', result.targets);
  console.log('   Reason:', result.reason);
  console.log('   Plan:', result.plan);
} else {
  console.log('❌ Failed to parse GBPCAD chart');
}

// Test with simplified price levels (more realistic OCR)
const simplifiedGBPCAD = `
GBPCAD
1.86346
1.85689
1.85038
1.84262
1.83611
1.83381
`;

console.log('\n🧪 Testing Simplified GBPCAD OCR...');
const result2 = parser.parseTradeSignal(simplifiedGBPCAD, gbpcadCaption);

if (result2) {
  console.log('\n✅ SUCCESSFULLY PARSED SIMPLIFIED GBPCAD:');
  console.log('   Symbol:', result2.symbol);
  console.log('   Action:', result2.action);
  console.log('   Entry Zone:', result2.entryZone);
  console.log('   Stop Loss:', result2.stopLoss);
  console.log('   Targets:', result2.targets);
} else {
  console.log('❌ Failed to parse simplified GBPCAD');
}
