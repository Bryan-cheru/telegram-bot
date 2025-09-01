#!/usr/bin/env node

/**
 * URGENT: Check Current XAUUSD Price
 * This will help us see exactly why your signal is failing
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function checkCurrentPrice() {
    try {
        console.log('🔍 CHECKING CURRENT XAUUSD PRICE');
        console.log('==================================');
        
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const account = await api.metatraderAccountApi.getAccount(process.env.METAAPI_ACCOUNT_ID);
        const connection = account.getStreamingConnection();
        
        console.log('🔗 Connecting to broker...');
        await connection.connect();
        await connection.waitSynchronized();
        
        console.log('📊 Getting XAUUSD price data...');
        const terminalState = connection.terminalState;
        const xauusdPrice = terminalState.price('XAUUSD');
        
        console.log('\n💰 CURRENT XAUUSD PRICE:');
        console.log(`   Bid: ${xauusdPrice?.bid}`);
        console.log(`   Ask: ${xauusdPrice?.ask}`);
        console.log(`   Spread: ${xauusdPrice ? (xauusdPrice.ask - xauusdPrice.bid).toFixed(2) : 'N/A'}`);
        
        // Your signal details
        const yourSignal = {
            entry: 3520,
            stopLoss: 3505,
            takeProfit: 3535,
            action: 'BUY'
        };
        
        console.log('\n🎯 YOUR SIGNAL ANALYSIS:');
        console.log(`   Entry: ${yourSignal.entry}`);
        console.log(`   Stop Loss: ${yourSignal.stopLoss}`);
        console.log(`   Take Profit: ${yourSignal.takeProfit}`);
        console.log(`   Action: ${yourSignal.action}`);
        
        if (xauusdPrice) {
            const currentPrice = yourSignal.action === 'BUY' ? xauusdPrice.ask : xauusdPrice.bid;
            console.log(`   Current Price (for ${yourSignal.action}): ${currentPrice}`);
            
            const slDistance = Math.abs(yourSignal.stopLoss - currentPrice);
            const tpDistance = Math.abs(yourSignal.takeProfit - currentPrice);
            
            console.log('\n⚠️  VALIDATION CHECK (Gold needs 30+ points):');
            console.log(`   SL Distance from current: ${slDistance.toFixed(2)} points ${slDistance >= 30 ? '✅' : '❌'}`);
            console.log(`   TP Distance from current: ${tpDistance.toFixed(2)} points ${tpDistance >= 30 ? '✅' : '❌'}`);
            
            if (slDistance < 30 || tpDistance < 30) {
                console.log('\n🚨 PROBLEM FOUND:');
                console.log('   One or both stops are too close to current market price!');
                console.log('   This is why your trade is getting "Invalid stops" error.');
                
                console.log('\n💡 SOLUTIONS:');
                if (tpDistance < 30) {
                    console.log(`   - Your TP (${yourSignal.takeProfit}) is only ${tpDistance.toFixed(2)} points from current price`);
                    console.log(`   - Market moved from ~3447 entry zone to current ${currentPrice.toFixed(2)}`);
                    console.log('   - Need to wait for pullback or use pending order');
                }
                
                if (slDistance < 30) {
                    console.log(`   - Your SL (${yourSignal.stopLoss}) is only ${slDistance.toFixed(2)} points from current price`);
                }
            } else {
                console.log('\n✅ Stop levels are valid! Issue might be elsewhere.');
            }
        }
        
        await connection.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error checking price:', error);
        process.exit(1);
    }
}

checkCurrentPrice();
