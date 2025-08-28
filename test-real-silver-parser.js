const path = require('path');

// Import the compiled trade parser
async function testWithActualParser() {
  try {
    // Build first to ensure latest code
    const { exec } = require('child_process');
    
    console.log('🔨 Building latest code...');
    await new Promise((resolve, reject) => {
      exec('npm run build', (error, stdout, stderr) => {
        if (error) {
          console.error('Build error:', error);
          reject(error);
          return;
        }
        console.log('✅ Build complete');
        resolve();
      });
    });

    // Import the built parser
    const { TradeParser } = require('./dist/src/ocr/tradeParser.js');
    
    console.log('\n🥈 REAL TRADE PARSER TEST - SILVER CHART\n');
    console.log('='.repeat(60));
    
    const parser = new TradeParser();
    
    // Simulated OCR text from Silver chart
    const ocrText = `
      CFDs on Silver US$ OZ 4h TVC
      USD 39.5000 39.3523 39.0000 38.8880
      38.6489 38.5000 38.0000 37.5104
      37.5094 36.9758 36.5500 SILVER 4h
      Resistance Level
    `;
    
    const caption = '#SILVER (Update) 📊 Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅';
    
    console.log('📤 INPUT:');
    console.log('Caption:', caption);
    console.log('OCR Text:', ocrText.trim());
    
    // Parse the signal
    const result = await parser.parseTradeSignal(ocrText, caption);
    
    console.log('\n📥 PARSER RESULT:');
    if (result) {
      console.log('✅ SUCCESS! Trade signal parsed:');
      console.log(JSON.stringify(result, null, 2));
      
      console.log('\n🎯 TRADE SUMMARY:');
      console.log(`Symbol: ${result.symbol}`);
      console.log(`Action: ${result.action}`);
      console.log(`Entry: $${result.entryZone.min} - $${result.entryZone.max}`);
      console.log(`Stop Loss: $${result.stopLoss}`);
      console.log(`Take Profit: $${result.targets[0]}`);
      
      const risk = Math.abs(result.stopLoss - (result.entryZone.min + result.entryZone.max) / 2);
      const reward = Math.abs(result.targets[0] - (result.entryZone.min + result.entryZone.max) / 2);
      const ratio = (reward / risk).toFixed(1);
      
      console.log(`Risk: $${risk.toFixed(2)}`);
      console.log(`Reward: $${reward.toFixed(2)}`);
      console.log(`Ratio: ${ratio}:1 ✅`);
      
    } else {
      console.log('❌ No trade signal detected');
    }
    
    console.log('\n='.repeat(60));
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testWithActualParser();
