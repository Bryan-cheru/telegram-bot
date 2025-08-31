const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🧪 COMPREHENSIVE SIGNAL PARSING TEST SUITE');
console.log('📅 Weekend Testing - Markets Closed');
console.log('='.repeat(60));

// Test signals in different formats
const testSignals = [
  {
    name: "Your Original XAUUSD Signal",
    signal: `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
On rejection from this area, bullish move expected.

🔼Signal:

📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408 - Final TP: Higher towards 3420+
❌ SL: 3370...!!`
  },
  
  {
    name: "XAUUSD Sell Signal",
    signal: `#XAUUSD SELL Setup 🔴

Gold facing strong resistance at 2650 level.
Selling zone: 2650 – 2645

🔽Signal:

📍 Sell Limit: 2650 – 2645
🎯 TP1: 2630 - TP2: 2615
❌ SL: 2655`
  },
  
  {
    name: "EURUSD Buy Signal",
    signal: `#EURUSD BUY Setup 💚

Euro showing bullish momentum.
Best buying area: 1.0850 – 1.0840

Signal:
📍 Buy: 1.0850 – 1.0840
🎯 Target: 1.0875
❌ SL: 1.0835`
  },
  
  {
    name: "Compact Format Signal",
    signal: `GBPUSD BUY 1.2750-1.2740 SL1.2735 TP1.2780`
  },
  
  {
    name: "Multi-Target Signal",
    signal: `#NAS100 Sell Setup

Tech index at resistance.
Entry: 15850 - 15800
SL: 15900
TP1: 15750
TP2: 15700
TP3: 15650`
  },
  
  {
    name: "Caption Style Signal",
    signal: `Gold Analysis Update

Market showing rejection from key resistance zone.
Selling opportunity in the range 2655-2650.
Stop loss above 2665.
Target towards 2635 and lower to 2620.`
  },
  
  {
    name: "Emoji Heavy Signal",
    signal: `🥇 #XAUUSD Setup

🔼 BUY Gold
📍 Entry: 3380 – 3375
🎯 TP: 3405
❌ SL: 3368

💪 Strong support holding!`
  }
];

async function testSignalParsing() {
  const parser = new TradeParser();
  let successCount = 0;
  let failCount = 0;
  
  console.log(`\n🔍 Testing ${testSignals.length} different signal formats...\n`);
  
  for (let i = 0; i < testSignals.length; i++) {
    const test = testSignals[i];
    console.log(`${i + 1}️⃣ Testing: ${test.name}`);
    console.log('-'.repeat(40));
    console.log('📝 Signal Text:');
    console.log(test.signal);
    console.log('');
    
    try {
      const result = parser.parseTradeSignal(test.signal);
      
      if (result) {
        console.log('✅ PARSING SUCCESS!');
        console.log(`   Symbol: ${result.symbol}`);
        console.log(`   Action: ${result.action}`);
        console.log(`   Entry: ${result.entryZone.min} - ${result.entryZone.max}`);
        console.log(`   Stop Loss: ${result.stopLoss}`);
        console.log(`   Targets: ${result.targets.join(', ')}`);
        if (result.reason) {
          console.log(`   Reason: ${result.reason.substring(0, 50)}...`);
        }
        successCount++;
      } else {
        console.log('❌ PARSING FAILED - No signal detected');
        failCount++;
        
        // Debug info
        const text = test.signal.toLowerCase();
        console.log('   🔧 Debug Info:');
        
        // Check for symbols
        const symbols = ['xauusd', 'gold', 'eurusd', 'gbpusd', 'usdjpy', 'nas100'];
        const foundSymbols = symbols.filter(s => text.includes(s));
        if (foundSymbols.length > 0) {
          console.log(`      Symbols found: ${foundSymbols.join(', ')}`);
        }
        
        // Check for actions
        if (text.includes('buy') || text.includes('buying')) {
          console.log('      Action: BUY detected');
        } else if (text.includes('sell') || text.includes('selling')) {
          console.log('      Action: SELL detected');
        }
        
        // Check for price numbers
        const pricePattern = /(\d{1,5}\.?\d*)/g;
        const prices = test.signal.match(pricePattern);
        if (prices && prices.length >= 3) {
          console.log(`      Price levels: ${prices.slice(0, 5).join(', ')}${prices.length > 5 ? '...' : ''}`);
        }
      }
      
    } catch (error) {
      console.log('🚨 ERROR during parsing:', error.message);
      failCount++;
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  // Summary
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful parses: ${successCount}/${testSignals.length}`);
  console.log(`❌ Failed parses: ${failCount}/${testSignals.length}`);
  console.log(`📈 Success rate: ${((successCount / testSignals.length) * 100).toFixed(1)}%`);
  
  if (successCount === testSignals.length) {
    console.log('\n🎉 PERFECT! All signals parsed successfully!');
  } else if (successCount > 0) {
    console.log('\n💪 Good progress! Some signals working, others need pattern improvements.');
  } else {
    console.log('\n⚠️ No signals parsed successfully. Pattern matching needs work.');
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. ✅ Signal parsing tested (weekend appropriate)');
  console.log('   2. 📅 Monday: Test MetaAPI connection & trade execution');
  console.log('   3. 🤖 Monday: Test full Telegram bot integration');
  console.log('   4. 🚀 Monday: Deploy to production when markets open');
}

testSignalParsing();
