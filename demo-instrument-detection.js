const { VisualChartAnalysisML } = require('./dist/ml/visualChartAnalysisML');
const fs = require('fs');

/**
 * Simple demo showing how INSTRUMENT DETECTION works:
 * 1. Caption ALWAYS contains the instrument: #EURCAD, #XAUUSD, etc.
 * 2. Visual ML analyzes the chart image for price levels
 * 3. Combine both for complete trade signal
 */

console.log('🧪 INSTRUMENT DETECTION DEMO\n');

// Mock Telegram message examples (your real format)
const telegramMessages = [
  {
    caption: '#EURCAD (Update) 📊\n\nNext move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅',
    hasImage: true
  },
  {
    caption: '#XAUUSD (Update)...!! 🔼 Gold is approaching the highlighted demand zone (3526 – 3521)...',
    hasImage: true
  },
  {
    caption: '#GBPUSD Signal Alert 🚨\n\nLooking for entry at key levels',
    hasImage: true
  }
];

/**
 * Extract instrument from caption - THIS IS THE KEY FUNCTION
 */
function extractInstrumentFromCaption(caption) {
  console.log(`📝 Caption: "${caption.substring(0, 80)}..."`);
  
  // Primary pattern: Look for #SYMBOL
  const hashtagPattern = /#([A-Z]{6})\b/gi;
  const match = caption.match(hashtagPattern);
  
  if (match) {
    const instrument = match[0].replace('#', '').toUpperCase();
    console.log(`✅ INSTRUMENT DETECTED: ${instrument} (from hashtag)`);
    return instrument;
  }
  
  console.log('❌ No instrument found in caption');
  return null;
}

/**
 * Simulate the complete flow
 */
async function demonstrateInstrumentDetection() {
  console.log('🎯 TELEGRAM BOT FLOW SIMULATION');
  console.log('═'.repeat(60));
  
  for (let i = 0; i < telegramMessages.length; i++) {
    const message = telegramMessages[i];
    
    console.log(`\n📨 MESSAGE ${i + 1}:`);
    console.log('─'.repeat(40));
    
    // Step 1: Extract instrument from caption (ALWAYS present)
    const instrument = extractInstrumentFromCaption(message.caption);
    
    if (!instrument) {
      console.log('⚠️ No instrument found - skipping message');
      continue;
    }
    
    // Step 2: Simulate visual chart analysis
    console.log(`🎨 Analyzing chart image for ${instrument}...`);
    console.log(`   📊 Chart shows grey zones (entry levels)`);
    console.log(`   📊 Chart shows green zones (target levels)`);
    console.log(`   📊 Chart shows red zones (stop levels)`);
    
    // Step 3: Create trade signal
    const tradeSignal = {
      instrument: instrument,  // FROM CAPTION
      entryZones: [1.48500, 1.48600],  // FROM VISUAL ML
      targets: [1.49000, 1.49200],     // FROM VISUAL ML  
      stopLoss: 1.48200,               // FROM VISUAL ML
      direction: 'BUY',                // FROM VISUAL ML
      source: 'CAPTION + VISUAL_ML',
      confidence: 85
    };
    
    // Display complete signal
    console.log(`\n🎯 COMPLETE TRADE SIGNAL:`);
    console.log(`   💰 Instrument: ${tradeSignal.instrument}`);
    console.log(`   📈 Direction: ${tradeSignal.direction}`);
    console.log(`   🎯 Entry: ${tradeSignal.entryZones.join(' - ')}`);
    console.log(`   🟢 Targets: ${tradeSignal.targets.join(', ')}`);
    console.log(`   🔴 Stop Loss: ${tradeSignal.stopLoss}`);
    console.log(`   📊 Confidence: ${tradeSignal.confidence}%`);
    console.log(`   🔗 Source: ${tradeSignal.source}`);
    
    console.log(`\n✅ Ready for execution on MT5!`);
  }
}

// Test with actual visual ML if available
async function testWithActualVisualML() {
  const chartImagePath = './downloaded_images/signal_XAUUSD_826_1756715916986.jpg';
  
  if (fs.existsSync(chartImagePath)) {
    console.log('\n🎨 TESTING WITH ACTUAL VISUAL ML');
    console.log('═'.repeat(60));
    
    try {
      const visualML = new VisualChartAnalysisML();
      const imageBuffer = fs.readFileSync(chartImagePath);
      
      // Test caption
      const testCaption = '#XAUUSD (Update)...!! 🔼 Gold is approaching the highlighted demand zone (3526 – 3521)...';
      const instrument = extractInstrumentFromCaption(testCaption);
      
      console.log(`🎨 Analyzing actual chart for ${instrument}...`);
      const visualResult = await visualML.analyzeChartImage(imageBuffer);
      
      console.log(`\n📊 VISUAL ANALYSIS RESULTS:`);
      console.log(`   🔘 Grey zones: ${visualResult.greyEntryZones?.length || 0}`);
      console.log(`   🟢 Green zones: ${visualResult.greenTargetZones?.length || 0}`);
      console.log(`   🔴 Red zones: ${visualResult.redStopZones?.length || 0}`);
      console.log(`   📏 Price scale: ${visualResult.priceScale?.minPrice} - ${visualResult.priceScale?.maxPrice}`);
      
      // Override symbol with caption
      visualResult.symbol = instrument;
      console.log(`   💰 Symbol (from caption): ${visualResult.symbol}`);
      console.log(`   📈 Direction (from ML): ${visualResult.direction}`);
      console.log(`   📊 Confidence: ${visualResult.confidence?.toFixed(1)}%`);
      
    } catch (error) {
      console.error('❌ Visual ML test failed:', error.message);
    }
  } else {
    console.log('\n⚠️ Chart image not found - skipping visual ML test');
  }
}

// Run demonstrations
console.log('This demonstrates the KEY INSIGHT:');
console.log('💡 INSTRUMENT is ALWAYS in the CAPTION (#EURCAD, #XAUUSD)');
console.log('💡 PRICES are extracted from the CHART IMAGE using Visual ML');
console.log('💡 Combined together = Complete Trade Signal');

demonstrateInstrumentDetection()
  .then(() => testWithActualVisualML())
  .then(() => {
    console.log('\n🎉 INSTRUMENT DETECTION DEMO COMPLETE!');
    console.log('\nKEY TAKEAWAY:');
    console.log('✅ Caption = Instrument (#SYMBOL)');  
    console.log('✅ Image = Price levels (grey/green/red zones)');
    console.log('✅ Together = Complete trading signal for MT5');
  })
  .catch(error => {
    console.error('❌ Demo failed:', error);
  });
