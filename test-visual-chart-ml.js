const { VisualChartAnalysisML } = require('./dist/ml/visualChartAnalysisML');
const fs = require('fs');
const path = require('path');

async function testVisualChartAnalysis() {
    console.log('🔍 Testing Visual Chart Analysis ML...\n');
    
    try {
        const visualML = new VisualChartAnalysisML();
        
        // Test with your sample signal image
        const imagePath = path.join(__dirname, 'downloaded_images', 'signal_XAUUSD_826_1756715916986.jpg');
        
        if (!fs.existsSync(imagePath)) {
            console.log('❌ Sample image not found at:', imagePath);
            console.log('Available images:');
            const imageDir = path.dirname(imagePath);
            if (fs.existsSync(imageDir)) {
                const files = fs.readdirSync(imageDir);
                files.forEach(file => console.log(`   - ${file}`));
            }
            return;
        }
        
        console.log('📊 Loading sample signal image:', imagePath);
        const imageBuffer = fs.readFileSync(imagePath);
        
        console.log('🎨 Analyzing chart for color highlights...');
        const analysis = await visualML.analyzeChartImage(imageBuffer);
        
        console.log('\n✅ Visual Analysis Results:');
        console.log('='.repeat(50));
        console.log(`Symbol: ${analysis.symbol}`);
        console.log(`Direction: ${analysis.direction || 'Unknown'}`);
        console.log(`Overall Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
        
        console.log('\n🔘 GREY ENTRY ZONES (From visual highlights):');
        if (analysis.greyEntryZones.length > 0) {
            analysis.greyEntryZones.forEach((zone, i) => {
                console.log(`   ${i + 1}. Price: ${zone.price} | Confidence: ${(zone.confidence * 100).toFixed(1)}%`);
            });
        } else {
            console.log('   ⚠️  No grey entry zones detected visually');
        }
        
        console.log('\n🟢 GREEN TARGET ZONES (From visual highlights):');
        if (analysis.greenTargetZones.length > 0) {
            analysis.greenTargetZones.forEach((zone, i) => {
                console.log(`   ${i + 1}. Price: ${zone.price} | Confidence: ${(zone.confidence * 100).toFixed(1)}%`);
            });
        } else {
            console.log('   ⚠️  No green target zones detected visually');
        }
        
        console.log('\n🔴 RED STOP ZONES (From visual highlights):');
        if (analysis.redStopZones.length > 0) {
            analysis.redStopZones.forEach((zone, i) => {
                console.log(`   ${i + 1}. Price: ${zone.price} | Confidence: ${(zone.confidence * 100).toFixed(1)}%`);
            });
        } else {
            console.log('   ⚠️  No red stop zones detected visually');
        }
        
        console.log('\n📏 Price Scale Analysis:');
        console.log(`   Min Price: ${analysis.priceScale.minPrice}`);
        console.log(`   Max Price: ${analysis.priceScale.maxPrice}`);
        console.log(`   Pixels per Pip: ${analysis.priceScale.pixelsPerPip.toFixed(2)}`);
        
        // Convert to trading signal format
        console.log('\n🎯 CONVERTED TRADING SIGNAL:');
        console.log('-'.repeat(30));
        const tradingSignal = visualML.convertToTradingSignal(analysis);
        
        console.log(`Symbol: ${tradingSignal.symbol}`);
        console.log(`Action: ${tradingSignal.action}`);
        
        if (tradingSignal.entryZone) {
            console.log(`Entry Zone: ${tradingSignal.entryZone.min} - ${tradingSignal.entryZone.max}`);
        } else {
            console.log('Entry Zone: Not detected');
        }
        
        if (tradingSignal.targets.length > 0) {
            console.log(`Targets: ${tradingSignal.targets.join(', ')}`);
        } else {
            console.log('Targets: Not detected');
        }
        
        if (tradingSignal.stopLoss) {
            console.log(`Stop Loss: ${tradingSignal.stopLoss}`);
        } else {
            console.log('Stop Loss: Not detected');
        }
        
        console.log(`Confidence: ${(tradingSignal.confidence * 100).toFixed(1)}%`);
        console.log(`Source: ${tradingSignal.source}`);
        
        // Test with a fallback scenario
        console.log('\n\n🧪 TESTING OCR FALLBACK (when no colors detected)...');
        console.log('Simulating scenario where visual color detection fails:');
        
        const mockOCRText = `
        #XAUUSD (Update)...!! 🔼
        
        Gold is approaching the highlighted demand zone
        
        Entry: 3521 - 3526
        Target 1: 3545
        Target 2: 3565  
        Target 3: 3585
        Stop Loss: 3510
        `;
        
        // You could test OCR fallback here
        console.log('   OCR Text would be processed for price extraction when visual fails');
        
        console.log('\n✅ Visual Chart Analysis ML Test Complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testVisualChartAnalysis().catch(console.error);
