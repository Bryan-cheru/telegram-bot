// Comprehensive Signal Detection Test
import { TradeParser } from './src/ocr/tradeParser';
import { TextExtractor } from './src/ocr/textExtractor';
import { logger } from './src/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const parser = new TradeParser();
const textExtractor = new TextExtractor();

console.log('🧪 COMPREHENSIVE SIGNAL DETECTION TEST\n');
console.log('=' .repeat(60));

// Test Sample 1: XAUUSD Buy Signal
const xauusdBuySignal = `XAUUSD (Update)...!!✔️
Gold has shown strong bullish momentum after breaking key resistance levels and is now in a healthy retracement phase. The best buying zone is between 2453 – 2441, where price is likely to take support before continuing its upward move.

🔼Buying Reason:

- Previous breakout confirms bullish strength.
- Price is retracting back to the demand zone (2453 – 2441), offering a low-risk entry.
- Bullish trend continuation expected towards Target 1: 2501 and Final Target: 2520+.

Stop Loss: 2435

👉 This setup provides a strong risk-to-reward ratio for buyers.`;

// Test Sample 2: EURUSD Sell Signal
const eurusdSellSignal = `EURUSD SELL SIGNAL 🔻

📍 Entry Zone: 1.0850 - 1.0865
🛑 Stop Loss: 1.0880  
🎯 Target 1: 1.0820
🎯 Target 2: 1.0795
🎯 Final Target: 1.0770

📈 Analysis:
EUR showing weakness after rejection at key resistance
Dollar strength continuing
Expecting bearish continuation`;

// Test Sample 3: US30 Index Signal
const us30Signal = `US30 INDEX ANALYSIS 📊

🔼 BUY SETUP
Entry: 41250 - 41180
Stop Loss: 41100
Target 1: 41350
Target 2: 41450
Target 3: 41550

Market bouncing from strong support zone
Bullish momentum building`;

// Test Sample 4: Complex XAGUSD Signal
const xagSignal = `XAGUSD Silver Update 🥈

Current Price: 28.45

SELL OPPORTUNITY
Best selling zone: 28.60 - 28.75
Stop Loss: 28.85
TP1: 28.25
TP2: 28.00
TP3: 27.80

Technical Analysis:
- Silver facing resistance at 28.70 level
- Bearish divergence on H4 timeframe
- Dollar strength pressuring precious metals

Risk Management: 2% per trade maximum`;

// Test Sample 5: Result/Update Message (Should be ignored)
const resultMessage = `XAUUSD UPDATE - TRADE CLOSED ✅

Our previous SELL signal from 2465 has reached TP1 at 2440
Profit: +250 pips
Next setup coming soon...

Thanks for following our signals!`;

// Test Sample 6: Invalid/Incomplete Signal
const incompleteSignal = `Gold looking good today
Might go up or down
Will update later`;

const testSignals = [
  { name: 'XAUUSD Buy Signal', text: xauusdBuySignal },
  { name: 'EURUSD Sell Signal', text: eurusdSellSignal },
  { name: 'US30 Index Signal', text: us30Signal },
  { name: 'XAGUSD Silver Signal', text: xagSignal },
  { name: 'Result Message (Should Skip)', text: resultMessage },
  { name: 'Incomplete Signal (Should Fail)', text: incompleteSignal }
];

async function testSignalDetection() {
  console.log('🔍 Testing Signal Detection Logic\n');

  for (let i = 0; i < testSignals.length; i++) {
    const testCase = testSignals[i];
    console.log(`\n${i + 1}️⃣ ${testCase.name}`);
    console.log('-'.repeat(40));

    try {
      const signal = parser.parseTradeSignal(testCase.text);
      
      if (signal) {
        console.log('✅ Signal Detected:');
        console.log(`   Symbol: ${signal.symbol}`);
        console.log(`   Action: ${signal.action}`);
        console.log(`   Order Type: ${signal.orderType}`);
        
        if (signal.entryZone) {
          console.log(`   Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
        }
        
        if (signal.stopLoss) {
          console.log(`   Stop Loss: ${signal.stopLoss}`);
        }
        
        if (signal.targets && signal.targets.length > 0) {
          console.log(`   Targets: ${signal.targets.join(', ')}`);
        }
        
        if (signal.positionSizing) {
          console.log(`   Lot Size: ${signal.positionSizing.lotSize}`);
          console.log(`   Risk: ${signal.positionSizing.riskPercentage}%`);
        }
        
        if (signal.reason) {
          console.log(`   Reason: ${signal.reason.substring(0, 80)}...`);
        }
      } else {
        console.log('❌ No Signal Detected');
      }
    } catch (error) {
      console.log('🚨 Error:', error instanceof Error ? error.message : String(error));
    }
  }
}

async function testImageSignalDetection() {
  console.log('\n\n🖼️  TESTING IMAGE SIGNAL DETECTION');
  console.log('=' .repeat(60));

  const imageDir = path.join(__dirname, 'downloaded_images');
  
  if (!fs.existsSync(imageDir)) {
    console.log('❌ No downloaded_images directory found');
    return;
  }

  const imageFiles = fs.readdirSync(imageDir).filter(file => 
    file.toLowerCase().endsWith('.jpg') || 
    file.toLowerCase().endsWith('.png') ||
    file.toLowerCase().endsWith('.jpeg')
  );

  if (imageFiles.length === 0) {
    console.log('❌ No image files found in downloaded_images');
    return;
  }

  for (const imageFile of imageFiles) {
    console.log(`\n📸 Testing: ${imageFile}`);
    console.log('-'.repeat(40));

    try {
      const imagePath = path.join(imageDir, imageFile);
      const imageBuffer = fs.readFileSync(imagePath);
      const extractedResult = await textExtractor.extractTextFromImage(imageBuffer);
      
      console.log('📝 Extracted Text:');
      console.log(extractedResult.text.substring(0, 200) + '...');
      console.log(`📊 OCR Confidence: ${(extractedResult.confidence * 100).toFixed(1)}%`);
      
      const signal = parser.parseTradeSignal(extractedResult.text);
      
      if (signal) {
        console.log('✅ Signal Found in Image:');
        console.log(`   Symbol: ${signal.symbol}`);
        console.log(`   Action: ${signal.action}`);
        console.log(`   Order Type: ${signal.orderType}`);
        
        if (signal.entryZone) {
          console.log(`   Entry: ${signal.entryZone.min} - ${signal.entryZone.max}`);
        }
        
        if (signal.stopLoss) {
          console.log(`   Stop Loss: ${signal.stopLoss}`);
        }
        
        if (signal.targets && signal.targets.length > 0) {
          console.log(`   Targets: ${signal.targets.join(', ')}`);
        }
      } else {
        console.log('❌ No valid signal found in image');
      }
      
    } catch (error) {
      console.log('🚨 Error processing image:', error instanceof Error ? error.message : String(error));
    }
  }
}

async function testSavedSignals() {
  console.log('\n\n💾 TESTING SAVED TRADE SIGNALS');
  console.log('=' .repeat(60));

  const signalsDir = path.join(__dirname, 'trade_signals');
  
  if (!fs.existsSync(signalsDir)) {
    console.log('❌ No trade_signals directory found');
    return;
  }

  const signalFiles = fs.readdirSync(signalsDir).filter(file => 
    file.endsWith('.json')
  );

  for (const signalFile of signalFiles) {
    console.log(`\n📄 Analyzing: ${signalFile}`);
    console.log('-'.repeat(40));

    try {
      const signalPath = path.join(signalsDir, signalFile);
      const signalData = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
      
      console.log('📊 Saved Signal Data:');
      console.log(`   Symbol: ${signalData.signal?.symbol || 'N/A'}`);
      console.log(`   Action: ${signalData.signal?.action || 'N/A'}`);
      console.log(`   Status: ${signalData.status || 'N/A'}`);
      console.log(`   Timestamp: ${signalData.timestamp || 'N/A'}`);
      
      if (signalData.signal?.entryZone) {
        console.log(`   Entry Zone: ${signalData.signal.entryZone.min} - ${signalData.signal.entryZone.max}`);
      }
      
      if (signalData.signal?.stopLoss) {
        console.log(`   Stop Loss: ${signalData.signal.stopLoss}`);
      }
      
      if (signalData.signal?.targets) {
        console.log(`   Targets: ${signalData.signal.targets.join(', ')}`);
      }
      
    } catch (error) {
      console.log('🚨 Error reading signal file:', error instanceof Error ? error.message : String(error));
    }
  }
}

async function testComplexPatterns() {
  console.log('\n\n🎯 TESTING COMPLEX PATTERN DETECTION');
  console.log('=' .repeat(60));

  const complexSignals = [
    {
      name: 'Multi-Symbol Signal',
      text: `GOLD & SILVER UPDATE 📈
      
      XAUUSD: Buy 2450-2445, SL: 2440, TP: 2460
      XAGUSD: Sell 28.50-28.55, SL: 28.60, TP: 28.40`
    },
    {
      name: 'Percentage-based SL/TP',
      text: `EURUSD SIGNAL
      Entry: 1.0850
      SL: -50 pips
      TP: +100 pips
      Risk: 2%`
    },
    {
      name: 'Time-based Signal',
      text: `US30 SCALPING
      Entry: Market Open
      Quick TP: 41200
      Time Exit: 30 minutes max`
    },
    {
      name: 'Conditional Signal',
      text: `GBPUSD Setup
      IF price breaks 1.2650
      THEN buy with SL: 1.2630
      Target: 1.2680`
    }
  ];

  for (const testCase of complexSignals) {
    console.log(`\n🔬 ${testCase.name}`);
    console.log('-'.repeat(30));

    try {
      const signal = parser.parseTradeSignal(testCase.text);
      
      if (signal) {
        console.log('✅ Pattern Recognized');
        console.log(`   ${signal.symbol} ${signal.action}`);
      } else {
        console.log('❌ Pattern Not Recognized');
      }
    } catch (error) {
      console.log('🚨 Error:', error instanceof Error ? error.message : String(error));
    }
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testSignalDetection();
    await testImageSignalDetection();
    await testSavedSignals();
    await testComplexPatterns();
    
    console.log('\n\n🎉 All tests completed!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('🚨 Test suite error:', error);
  }
}

runAllTests().catch(console.error);
