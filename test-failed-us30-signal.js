const { TradeParser } = require('./src/ocr/tradeParser');

/**
 * Test the specific US30 Update signal that failed
 * Based on the chart provided showing US30 with green support zone around 43,378 - 45,293
 */

async function testFailedUS30Signal() {
    console.log('🔍 Testing Failed US30 Update Signal\n');
    
    const tradeParser = new TradeParser();
    
    // Test the exact signal that failed
    const failedSignal = `#US30 (Update) 📊

Next move on the way — focus on proper risk management & stay disciplined. Wishing you successful trades....!!✅`;
    
    const failedCaption = '#US30 (Update) 📊\n\nNext move on the way — focus on proper risk management & stay disciplined. Wishin...';
    
    console.log('📝 Testing the exact signal that failed...');
    console.log('Signal text:', failedSignal);
    console.log('Caption:', failedCaption);
    
    const result = tradeParser.parseTradeSignal(failedSignal, failedCaption);
    
    if (result) {
        console.log('\n✅ Signal parsing result:');
        console.log(`   Symbol: ${result.symbol}`);
        console.log(`   Action: ${result.action}`);
        console.log(`   Entry Zone: ${result.entryZone.min} - ${result.entryZone.max}`);
        console.log(`   Stop Loss: ${result.stopLoss}`);
        console.log(`   Target: ${result.targets[0]}`);
        console.log(`   Reason: ${result.reason}`);
        console.log(`   Order Type: ${result.orderType || 'MARKET'}`);
        
        // Check if entry zone has valid prices
        if (result.entryZone.min === 0 || result.entryZone.max === 0) {
            console.log('\n❌ PROBLEM IDENTIFIED: Entry zone contains invalid price (0)');
            console.log('🔧 The issue is that no valid entry level was extracted from the text');
        } else {
            console.log('\n✅ Entry zone has valid prices');
        }
        
        // Based on the chart provided, suggest what the entry should be
        console.log('\n📊 Based on the chart analysis:');
        console.log('   Current price appears to be around 45,293');
        console.log('   Green support zone: 43,378 - 45,293');
        console.log('   For BUY signal, entry should be near current level or support');
        console.log('   Suggested entry: ~45,290 (near current price)');
        
    } else {
        console.log('❌ Signal parsing failed completely');
    }
    
    console.log('\n🔍 DIAGNOSIS:');
    console.log('The signal text contains very little price information:');
    console.log('- No explicit entry level mentioned');
    console.log('- No stop loss or target prices');
    console.log('- Only mentions "Next move on the way"');
    console.log('- Bot needs to extract entry from chart context or use current market price');
    
    console.log('\n🎯 SOLUTION NEEDED:');
    console.log('1. Improve parsing to extract entry from visual context');
    console.log('2. Use current market price as fallback entry');
    console.log('3. Fix symbol mapping for US30 across brokers');
    console.log('4. Ensure entry price is never 0');
}

// Run the test
testFailedUS30Signal().catch(console.error);
