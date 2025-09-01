#!/usr/bin/env node

/**
 * OCR DEBUG: Find where 3520 is coming from in your XAUUSD signal
 * This will show us exactly what text the OCR extracted
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

async function debugOCRExtraction() {
    try {
        console.log('🔍 DEBUGGING OCR EXTRACTION FOR YOUR XAUUSD SIGNAL');
        console.log('===================================================');
        
        // Find your XAUUSD signal image
        const imageDir = path.join(__dirname, 'downloaded_images');
        const files = fs.readdirSync(imageDir);
        const xauusdImage = files.find(f => f.includes('XAUUSD') || f.includes('826'));
        
        if (!xauusdImage) {
            console.log('❌ Could not find your XAUUSD signal image');
            console.log('📁 Available images:', files);
            return;
        }
        
        const imagePath = path.join(imageDir, xauusdImage);
        console.log(`📸 Found your signal image: ${xauusdImage}`);
        
        // Process image like the bot does
        console.log('\n🔄 Processing image (same as bot)...');
        const processedBuffer = await sharp(imagePath)
            .resize(1200, null, { 
                withoutEnlargement: true,
                fit: 'inside'
            })
            .sharpen(2, 1, 2)
            .modulate({
                brightness: 1.2,
                contrast: 1.3,
                saturation: 0.8
            })
            .normalize()
            .png()
            .toBuffer();
            
        // Run OCR extraction
        console.log('🔍 Running OCR extraction...');
        const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    process.stdout.write(`\r   Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        
        console.log('\n\n📄 FULL OCR TEXT EXTRACTED:');
        console.log('============================');
        console.log(text);
        console.log('============================\n');
        
        // Analyze for 3520
        console.log('🔍 SEARCHING FOR "3520" IN OCR TEXT:');
        const lines = text.split('\n');
        let found3520 = false;
        
        lines.forEach((line, index) => {
            if (line.includes('3520')) {
                console.log(`   Line ${index + 1}: "${line.trim()}" ✅ FOUND 3520`);
                found3520 = true;
            }
        });
        
        if (!found3520) {
            console.log('   ❌ 3520 NOT found in OCR text');
            
            // Check for similar numbers
            console.log('\n🔍 SEARCHING FOR SIMILAR NUMBERS:');
            const pricePattern = /3[0-9]{3}/g;
            const matches = text.match(pricePattern) || [];
            console.log('   Found price-like numbers:', matches);
            
            // Check for numbers that might be misread as 3520
            const allNumbers = text.match(/[0-9]{4}/g) || [];
            console.log('   All 4-digit numbers found:', allNumbers);
        }
        
        // Check for entry zone numbers (3441-3453)
        console.log('\n🔍 SEARCHING FOR ENTRY ZONE NUMBERS:');
        const entryNumbers = ['3441', '3442', '3443', '3444', '3445', '3446', '3447', '3448', '3449', '3450', '3451', '3452', '3453'];
        let foundEntryZone = false;
        
        entryNumbers.forEach(num => {
            if (text.includes(num)) {
                console.log(`   Found entry zone number: ${num} ✅`);
                foundEntryZone = true;
            }
        });
        
        if (!foundEntryZone) {
            console.log('   ❌ No entry zone numbers (3441-3453) found in OCR');
        }
        
        // Now check parsing logic simulation
        console.log('\n🎯 SIMULATING PARSING LOGIC:');
        console.log('==============================');
        
        // Check if it's using visual chart parsing or caption parsing
        console.log('1. Caption parsing would use OCR text above');
        console.log('2. Visual parsing would analyze grey zones in image');
        console.log('3. The bot logs showed "Using visual chart data (highlighted zones detected)"');
        
        // Check for common XAUUSD price patterns
        const xauusdPrices = text.match(/3[4-5][0-9]{2}\.?[0-9]*/g) || [];
        console.log(`\n📊 All XAUUSD-like prices found: ${xauusdPrices.join(', ')}`);
        
        console.log('\n💡 NEXT DEBUGGING STEPS:');
        console.log('=========================');
        if (found3520) {
            console.log('✅ Found 3520 in OCR - this is likely the source');
            console.log('   Need to check why parser chose this over entry zone');
        } else {
            console.log('❌ 3520 NOT in OCR - check visual parsing logic');
            console.log('   The 3520 might be coming from visual chart analysis');
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error during OCR debug:', error);
        process.exit(1);
    }
}

debugOCRExtraction();
