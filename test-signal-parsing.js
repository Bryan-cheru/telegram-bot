const { TradeParser } = require('./dist/ocr/tradeParser');

// Test signal from the channel
const sampleSignal = `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
On rejection from this area, bullish move expected.

🔼Signal:

📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408 - Final TP: Higher towards 3420+
❌ SL: 3370...!!`;

console.log('🧪 Testing Trade Signal Parsing...\n');
console.log('📝 Raw Signal Text:');
console.log(sampleSignal);
console.log('\n' + '='.repeat(50) + '\n');

try {
    const parser = new TradeParser();
    
    // Test if this is considered a result message
    console.log('🔍 Checking if this is a result/update message...');
    const isResult = parser.isResultOrUpdateMessage(sampleSignal);
    console.log(`Is result message: ${isResult}`);
    
    if (!isResult) {
        console.log('\n🔍 Attempting to parse trade signal...');
        const result = parser.parseTradeSignal(sampleSignal);
        
        console.log('📊 Parsed Result:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result) {
            console.log('\n✅ PARSING SUCCESS!');
            console.log(`Symbol: ${result.symbol}`);
            console.log(`Action: ${result.action}`);
            console.log(`Entry Zone: ${result.entryZone.min} - ${result.entryZone.max}`);
            console.log(`Stop Loss: ${result.stopLoss}`);
            console.log(`Targets: ${result.targets.join(', ')}`);
            
            if (result.positionSizing) {
                console.log(`\n💰 Position Sizing:`);
                console.log(`Lot Size: ${result.positionSizing.lotSize}`);
                console.log(`Risk: ${result.positionSizing.riskPercentage}%`);
            }
        } else {
            console.log('❌ PARSING FAILED - No signal detected');
            
            // Let's try some manual pattern matching to debug
            console.log('\n🔧 DEBUG: Manual pattern matching...');
            const text = sampleSignal.toLowerCase();
            
            // Check for symbol
            if (text.includes('xauusd') || text.includes('gold')) {
                console.log('✓ Symbol detected: XAUUSD/Gold');
            }
            
            // Check for action
            if (text.includes('buy') || text.includes('buying')) {
                console.log('✓ Action detected: BUY');
            } else if (text.includes('sell') || text.includes('selling')) {
                console.log('✓ Action detected: SELL');
            }
            
            // Check for price levels
            const pricePattern = /(\d{4})/g;
            const prices = sampleSignal.match(pricePattern);
            if (prices) {
                console.log('✓ Price levels detected:', prices.join(', '));
            }
        }
    } else {
        console.log('⚠️ Message identified as result/update - skipping parsing');
    }
    
} catch (error) {
    console.error('🚨 ERROR during parsing:', error.message);
    console.error(error.stack);
}
