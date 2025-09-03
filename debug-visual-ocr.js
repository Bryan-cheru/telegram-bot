const { VisualChartAnalysisML } = require('./dist/ml/visualChartAnalysisML');
const { TextExtractor } = require('./dist/ocr/textExtractor');
const fs = require('fs');
const path = require('path');

async function debugVisualAnalysis() {
    console.log('🔍 Debugging Visual Analysis - OCR Text Extraction...\n');
    
    try {
        const textExtractor = new TextExtractor();
        
        // Test with your sample signal image
        const imagePath = path.join(__dirname, 'downloaded_images', 'signal_XAUUSD_826_1756715916986.jpg');
        
        console.log('📊 Loading sample signal image:', imagePath);
        const imageBuffer = fs.readFileSync(imagePath);
        
        console.log('📝 Extracting all OCR text to see what we get...');
        const ocrResult = await textExtractor.extractTextFromImage(imageBuffer);
        
        console.log('\n📋 FULL OCR TEXT DETECTED:');
        console.log('='.repeat(50));
        console.log(ocrResult.text);
        console.log('='.repeat(50));
        
        console.log(`\nOCR Confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
        console.log(`Total Words: ${ocrResult.words.length}`);
        
        console.log('\n🔍 HIGH CONFIDENCE WORDS:');
        const highConfidenceWords = ocrResult.words.filter(w => w.confidence > 0.7);
        highConfidenceWords.forEach(word => {
            console.log(`   "${word.text}" (${(word.confidence * 100).toFixed(1)}%) at [${word.bbox.x0}, ${word.bbox.y0}]`);
        });
        
        // Extract numbers that look like prices
        console.log('\n💰 POTENTIAL PRICE VALUES:');
        const priceRegex = /\b\d{3,5}(?:\.\d{1,3})?\b/g;
        const matches = ocrResult.text.match(priceRegex);
        if (matches) {
            matches.forEach(match => {
                console.log(`   ${match}`);
            });
        } else {
            console.log('   No price-like numbers found');
        }
        
        // Show what our visual ML would extract
        console.log('\n🤖 VISUAL ML SYMBOL DETECTION:');
        const visualML = new VisualChartAnalysisML();
        
        // Test symbol extraction
        const symbolPatterns = [
            /#?([A-Z]{6})\b/g,
            /\b(GOLD|SILVER|EUR|USD|GBP|JPY)\b/gi,
            /\b([A-Z]{3}[A-Z]{3})\b/g
        ];

        for (const pattern of symbolPatterns) {
            const matches = ocrResult.text.match(pattern);
            if (matches && matches.length > 0) {
                console.log(`   Pattern ${pattern}: ${matches.join(', ')}`);
            }
        }
        
        console.log('\n✅ Debug complete!');
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

// Run the debug
debugVisualAnalysis().catch(console.error);
