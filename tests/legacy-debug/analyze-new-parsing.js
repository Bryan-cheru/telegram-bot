#!/usr/bin/env node

/**
 * CURRENT ISSUE ANALYSIS: New parsing vs current market
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function analyzeCurrentIssue() {
    try {
        console.log('🔍 ANALYZING NEW PARSING RESULTS VS CURRENT MARKET');
        console.log('==================================================');
        
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const account = await api.metatraderAccountApi.getAccount(process.env.METAAPI_ACCOUNT_ID);
        const connection = account.getStreamingConnection();
        
        console.log('🔗 Connecting to broker...');
        await connection.connect();
        await connection.waitSynchronized();
        
        const terminalState = connection.terminalState;
        const xauusdPrice = terminalState.price('XAUUSD');
        
        console.log('💰 CURRENT MARKET DATA:');
        console.log(`   Bid: ${xauusdPrice?.bid}`);
        console.log(`   Ask: ${xauusdPrice?.ask}`);
        console.log(`   Current for BUY: ${xauusdPrice?.ask}`);
        
        // Your NEW parsed signal (from bot logs)
        const newSignal = {
            entry: 3455.40,
            stopLoss: 3455.40 - 17.40,  // Entry - Risk = 3438
            takeProfit: 3455.40 + 17.40, // Entry + Risk = 3472.8 (1:1 RR)
            action: 'BUY'
        };
        
        console.log('\n🎯 YOUR NEW PARSED SIGNAL:');
        console.log(`   Entry: ${newSignal.entry}`);
        console.log(`   Stop Loss: ${newSignal.stopLoss.toFixed(2)}`);
        console.log(`   Take Profit: ${newSignal.takeProfit.toFixed(2)}`);
        console.log(`   Risk: 17.40 points (1:1 RR)`);
        
        if (xauusdPrice) {
            const currentPrice = xauusdPrice.ask;
            console.log('\n📊 MARKET ANALYSIS:');
            console.log(`   Current Price: ${currentPrice}`);
            console.log(`   Entry vs Market: ${(newSignal.entry - currentPrice).toFixed(2)} points`);
            
            // Check if trying to BUY above market
            if (newSignal.entry > currentPrice) {
                const aboveMarket = newSignal.entry - currentPrice;
                console.log(`   ❌ ISSUE: Trying to BUY ${aboveMarket.toFixed(2)} points ABOVE market!`);
                console.log(`   This requires LIMIT order, not MARKET order`);
            } else {
                console.log(`   ✅ Good: BUY entry is ${(currentPrice - newSignal.entry).toFixed(2)} points below market`);
            }
            
            // Check stop distances
            const slDistance = Math.abs(newSignal.stopLoss - currentPrice);
            const tpDistance = Math.abs(newSignal.takeProfit - currentPrice);
            
            console.log('\n⚠️  STOP LEVEL VALIDATION (Gold needs 30+ points):');
            console.log(`   SL distance from current: ${slDistance.toFixed(2)} points ${slDistance >= 30 ? '✅' : '❌'}`);
            console.log(`   TP distance from current: ${tpDistance.toFixed(2)} points ${tpDistance >= 30 ? '✅' : '❌'}`);
            
            if (slDistance < 30 || tpDistance < 30) {
                console.log('\n🚨 ROOT CAUSE:');
                if (slDistance < 30) {
                    console.log(`   - Stop Loss (${newSignal.stopLoss.toFixed(2)}) is too close to current price (${currentPrice})`);
                }
                if (tpDistance < 30) {
                    console.log(`   - Take Profit (${newSignal.takeProfit.toFixed(2)}) is too close to current price (${currentPrice})`);
                }
                console.log('   - Broker rejects this as "Invalid stops in the request"');
            }
            
            console.log('\n🔧 SOLUTIONS:');
            console.log('================');
            
            if (newSignal.entry > currentPrice) {
                console.log('1. ✅ Use LIMIT order instead of MARKET order');
                console.log(`   - Place LIMIT BUY at ${newSignal.entry}`);
                console.log('   - Wait for market to come to your entry level');
            }
            
            if (slDistance < 30 || tpDistance < 30) {
                console.log('2. ⚠️  Adjust stop levels to meet broker requirements:');
                const minSL = currentPrice - 30;
                const minTP = currentPrice + 30;
                console.log(`   - Move SL to max ${minSL.toFixed(2)} (30 points below current)`);
                console.log(`   - Move TP to min ${minTP.toFixed(2)} (30 points above current)`);
            }
        }
        
        await connection.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

analyzeCurrentIssue();
