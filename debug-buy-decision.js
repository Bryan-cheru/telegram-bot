const { TradeParser } = require('./dist/ocr/tradeParser');

const eurjpyUpdateMessage = `#EURJPY (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;

const realChartOCR = `Euro / Japanese Yen • 2h • OANDA
EURJPY 2h
172.690
172.689
172.600
172.400
171.844
171.711  ← This is the grey zone entry
171.600
171.473
171.400
171.200
171.117
Admin: @FX_Trader3`;

console.log('🔍 DEBUGGING: How Bot Determined BUY Signal\n');
console.log('📝 Caption Text:');
console.log(eurjpyUpdateMessage);
console.log('\n📊 Chart OCR Text:');
console.log(realChartOCR);

console.log('\n' + '='.repeat(70));
console.log('🧠 BOT DECISION-MAKING ANALYSIS:');
console.log('='.repeat(70));

// Step 1: Check caption for explicit trading keywords
console.log('\n1️⃣ CAPTION ANALYSIS:');
const caption = eurjpyUpdateMessage;
const sellKeywords = /sell|short|bearish|down/i;
const buyKeywords = /buy|long|bullish|up/i;

console.log(`   Caption: "${caption}"`);
console.log(`   Contains SELL keywords: ${sellKeywords.test(caption)}`);
console.log(`   Contains BUY keywords: ${buyKeywords.test(caption)}`);
console.log(`   → Caption provides NO clear direction`);

// Step 2: Check if bot uses price analysis for direction
console.log('\n2️⃣ PRICE POSITION ANALYSIS:');
const pricePattern = /\b(\d{3}\.\d{2,4})\b/g;
const allPrices = [...realChartOCR.matchAll(pricePattern)]
    .map(m => parseFloat(m[1]))
    .filter(p => p > 0);

console.log(`   All prices found: ${allPrices.join(', ')}`);

allPrices.sort((a, b) => b - a); // Sort descending (highest first)
const currentPrice = allPrices[0]; // Bot assumes highest price = current price
const preciseEntry = 171.711; // The grey zone entry we know

console.log(`   Highest price (assumed current): ${currentPrice}`);
console.log(`   Grey zone entry: ${preciseEntry}`);
console.log(`   Current vs Entry: ${currentPrice} ${currentPrice > preciseEntry ? '>' : '<'} ${preciseEntry}`);

// Step 3: Bot's logic for determining direction
console.log('\n3️⃣ BOT DIRECTION LOGIC:');
if (currentPrice > preciseEntry) {
    console.log(`   ✅ Current price (${currentPrice}) > Entry (${preciseEntry})`);
    console.log(`   → Bot logic: "Price is ABOVE entry zone"`);
    console.log(`   → Expected move: Price will pull back DOWN to entry zone`);
    console.log(`   → Trade direction: BUY (at lower entry level)`);
} else {
    console.log(`   Current price (${currentPrice}) < Entry (${preciseEntry})`);
    console.log(`   → Bot logic: "Price is BELOW entry zone"`);
    console.log(`   → Expected move: Price will bounce UP to entry zone`);
    console.log(`   → Trade direction: SELL (at higher entry level)`);
}

console.log('\n4️⃣ DEFAULT FALLBACK:');
console.log(`   If no clear direction found: Default to BUY`);

console.log('\n' + '='.repeat(70));
console.log('💡 SUMMARY - Why Bot Chose BUY:');
console.log('='.repeat(70));
console.log('1. Caption had NO explicit BUY/SELL keywords');
console.log('2. Bot used price position analysis as fallback');
console.log('3. Current price (172.690) > Entry price (171.711)');
console.log('4. Bot interpreted this as "BUY the dip" at entry level');
console.log('5. Logic: Wait for price to pullback to 171.711, then BUY');

console.log('\n🤔 POTENTIAL ISSUES WITH THIS LOGIC:');
console.log('- Bot assumes highest price = current market price');
console.log('- This might not always be accurate from OCR data');
console.log('- Real chart context (support/resistance) not considered');
console.log('- Direction should ideally come from chart analysis or caption');
