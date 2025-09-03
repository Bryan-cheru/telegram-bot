const { VisualChartAnalysisML } = require('./dist/ml/visualChartAnalysisML');
const fs = require('fs');

/**
 * Test the enhanced caption + visual ML integration
 * This demonstrates how instrument detection should work:
 * 1. Extract symbol from caption (#EURCAD, #XAUUSD)
 * 2. Use visual ML to analyze chart for price levels
 * 3. Combine both for complete trade signal
 */

console.log('🧪 Testing Caption + Visual ML Integration...\n');

/**
 * Extract trading symbol from caption text
 */
function extractSymbolFromCaption(caption) {
  console.log(`🔍 Extracting symbol from caption: "${caption.substring(0, 100)}..."`);
  
  // Look for hashtag symbols: #EURCAD, #XAUUSD, etc.
  const hashtagPattern = /#([A-Z]{6})\b/gi;
  const hashtagMatch = caption.match(hashtagPattern);
  
  if (hashtagMatch && hashtagMatch.length > 0) {
    const symbol = hashtagMatch[0].replace('#', '').toUpperCase();
    console.log(`💰 Symbol extracted from caption: ${symbol}`);
    return symbol;
  }
  
  // Fallback: Look for common symbol patterns without hashtag
  const symbolPatterns = [
    /\b([A-Z]{6})\b/g,        // EURCAD, XAUUSD
    /\b(GOLD|SILVER)\b/gi     // GOLD, SILVER
  ];
  
  for (const pattern of symbolPatterns) {
    const matches = caption.match(pattern);
    if (matches && matches.length > 0) {
      let symbol = matches[0].toUpperCase();
      
      // Convert aliases
      if (symbol === 'GOLD') symbol = 'XAUUSD';
      if (symbol === 'SILVER') symbol = 'XAGUSD';
      
      console.log(`💰 Symbol extracted (fallback): ${symbol}`);
      return symbol;
    }
  }
  
  console.warn('⚠️ No symbol found in caption');
  return null;
}

/**
 * Test with sample captions and chart image
 */
async function testCaptionVisualMLIntegration() {
  const visualML = new VisualChartAnalysisML();
  
  // Test captions (your real examples)
  const testCaptions = [
    '#EURCAD (Update) 📊\n\nNext move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅',
    '#XAUUSD (Update)...!! 🔼 Gold is approaching the highlighted demand zone (3526 – 3521)...',
    'GOLD analysis - looking for entry opportunities'
  ];
  
  const chartImagePath = './downloaded_images/signal_XAUUSD_826_1756715916986.jpg';
  
  if (!fs.existsSync(chartImagePath)) {
    console.error('❌ Chart image not found:', chartImagePath);
    return;
  }
  
  const imageBuffer = fs.readFileSync(chartImagePath);
  console.log(`📊 Loading chart image: ${chartImagePath}`);
  
  for (let i = 0; i < testCaptions.length; i++) {
    const caption = testCaptions[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 TEST ${i + 1}: Caption + Visual ML Integration`);
    console.log(`${'='.repeat(80)}`);
    
    // Step 1: Extract symbol from caption
    const captionSymbol = extractSymbolFromCaption(caption);
    
    if (!captionSymbol) {
      console.log('⚠️ No symbol in caption - skipping this test');
      continue;
    }
    
    try {
      // Step 2: Analyze chart with visual ML
      console.log(`🎨 Analyzing chart with Visual ML...`);
      const visualResult = await visualML.analyzeChartImage(imageBuffer);
      
      // Step 3: Override symbol with caption symbol
      visualResult.symbol = captionSymbol;
      
      // Step 4: Create combined trade signal
      const tradeSignal = {
        symbol: captionSymbol,
        action: visualResult.direction || 'BUY',
        source: 'CAPTION_VISUAL_ML',
        confidence: visualResult.confidence || 0,
        caption: caption.substring(0, 100) + '...'
      };
      
      // Extract price levels from visual analysis
      if (visualResult.greyEntryZones && visualResult.greyEntryZones.length > 0) {
        const entryPrices = visualResult.greyEntryZones.map(zone => zone.price);
        tradeSignal.entry = Math.min(...entryPrices);
        tradeSignal.entryZone = `${Math.min(...entryPrices)}-${Math.max(...entryPrices)}`;
      }
      
      if (visualResult.greenTargetZones && visualResult.greenTargetZones.length > 0) {
        tradeSignal.targets = visualResult.greenTargetZones
          .map(zone => zone.price)
          .sort((a, b) => a - b);
      }
      
      if (visualResult.redStopZones && visualResult.redStopZones.length > 0) {
        const stopPrices = visualResult.redStopZones.map(zone => zone.price);
        tradeSignal.stopLoss = visualResult.direction === 'BUY' ? 
          Math.min(...stopPrices) : Math.max(...stopPrices);
      }
      
      // Display results
      console.log(`\n✅ COMBINED TRADE SIGNAL:`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`💰 Symbol (from caption): ${tradeSignal.symbol}`);
      console.log(`📈 Direction: ${tradeSignal.action}`);
      console.log(`🎯 Entry Zone: ${tradeSignal.entryZone || 'Not detected'}`);
      console.log(`🟢 Targets: ${tradeSignal.targets ? tradeSignal.targets.join(', ') : 'Not detected'}`);
      console.log(`🔴 Stop Loss: ${tradeSignal.stopLoss || 'Not detected'}`);
      console.log(`📊 Confidence: ${(tradeSignal.confidence || 0).toFixed(1)}%`);
      console.log(`📝 Source: ${tradeSignal.source}`);
      console.log(`💬 Caption: "${tradeSignal.caption}"`);
      
      // Visual analysis summary
      console.log(`\n📊 VISUAL ANALYSIS SUMMARY:`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`🔘 Grey Zones (Entry): ${visualResult.greyEntryZones ? visualResult.greyEntryZones.length : 0}`);
      console.log(`🟢 Green Zones (Targets): ${visualResult.greenTargetZones ? visualResult.greenTargetZones.length : 0}`);
      console.log(`🔴 Red Zones (Stops): ${visualResult.redStopZones ? visualResult.redStopZones.length : 0}`);
      
    } catch (error) {
      console.error(`❌ Visual ML analysis failed for test ${i + 1}:`, error.message);
    }
  }
}

// Run the test
testCaptionVisualMLIntegration()
  .then(() => {
    console.log('\n✅ Caption + Visual ML Integration Test Complete!');
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
  });
