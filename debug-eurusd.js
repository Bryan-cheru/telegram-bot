const testEURUSD = `#EURUSD BUY Setup 💚

Euro showing bullish momentum.
Best buying area: 1.0850 – 1.0840

Signal:
📍 Buy: 1.0850 – 1.0840
🎯 Target: 1.0875
❌ SL: 1.0835`;

console.log('🧪 Testing EURUSD Pattern Matching');
console.log('='.repeat(50));

// Test our new pattern
const pattern = /#?(XAUUSD|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD|NAS100|US30|SPX500|Gold|Silver)[\s\S]*?(Buy|Buying|BUY|Sell|Selling|SELL)[\s\S]*?(?:zone|area|limit)[\s\S]*?(\d{3,6})\s*[–-]\s*(\d{3,6})[\s\S]*?(?:Tp1?|TP1?|Target)[\s\S]*?(\d{3,6})[\s\S]*?(?:SL|❌\s*SL)[\s\S]*?(\d{3,6})/gi;

const match = pattern.exec(testEURUSD);
if (match) {
    console.log('✅ Pattern matches!');
    console.log('Match result:', match);
    console.log(`Symbol: ${match[1]}`);
    console.log(`Action: ${match[2]}`);
    console.log(`Entry Max: ${match[3]}`);
    console.log(`Entry Min: ${match[4]}`);
    console.log(`Target: ${match[5]}`);
    console.log(`Stop Loss: ${match[6]}`);
} else {
    console.log('❌ Pattern does not match');
    
    // Check what the issue might be
    console.log('\n🔍 Debugging:');
    console.log('Contains EURUSD:', testEURUSD.includes('EURUSD'));
    console.log('Contains BUY:', testEURUSD.includes('BUY'));
    console.log('Contains area:', testEURUSD.includes('area'));
    console.log('Contains Target:', testEURUSD.includes('Target'));
    console.log('Contains SL:', testEURUSD.includes('SL'));
    
    // Try a more specific pattern for this format
    console.log('\n🆕 Trying specific pattern...');
    const specificPattern = /#?EURUSD[\s\S]*?BUY[\s\S]*?area:?\s*(\d\.\d{4})\s*[–-]\s*(\d\.\d{4})[\s\S]*?Target:?\s*(\d\.\d{4})[\s\S]*?SL:?\s*(\d\.\d{4})/gi;
    const specificMatch = specificPattern.exec(testEURUSD);
    if (specificMatch) {
        console.log('✅ Specific pattern matches!', specificMatch);
    } else {
        console.log('❌ Specific pattern also fails');
    }
}
