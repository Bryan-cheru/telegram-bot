#!/usr/bin/env node

/**
 * DEBUG: Check if FTMO account can access XAUUSD price data
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function testFTMOAccount() {
    try {
        console.log('🔍 TESTING FTMO ACCOUNT ACCESS');
        console.log('===============================');
        
        const accountId = process.env.METAAPI_ACCOUNT_ID;
        console.log(`   Account ID: ${accountId}`);
        
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getStreamingConnection();
        
        console.log('\n🔗 Connecting to FTMO account...');
        await connection.connect();
        
        console.log('⏳ Waiting for synchronization...');
        await connection.waitSynchronized();
        
        const terminalState = connection.terminalState;
        
        console.log('\n📊 ACCOUNT INFO:');
        const accountInfo = terminalState.accountInformation;
        if (accountInfo) {
            console.log(`   Balance: $${accountInfo.balance}`);
            console.log(`   Equity: $${accountInfo.equity}`);
            console.log(`   Currency: ${accountInfo.currency}`);
            console.log(`   Server: ${accountInfo.server}`);
            console.log(`   Leverage: 1:${accountInfo.leverage}`);
        } else {
            console.log('   ❌ Account info not available');
        }
        
        console.log('\n💹 XAUUSD PRICE ACCESS:');
        const xauusdPrice = terminalState.price('XAUUSD');
        if (xauusdPrice) {
            console.log(`   ✅ Bid: ${xauusdPrice.bid}`);
            console.log(`   ✅ Ask: ${xauusdPrice.ask}`);
            console.log(`   ✅ Spread: ${(xauusdPrice.ask - xauusdPrice.bid).toFixed(2)}`);
            console.log(`   ✅ Time: ${xauusdPrice.time}`);
        } else {
            console.log('   ❌ XAUUSD price not available');
            console.log('   This explains why validation fails!');
        }
        
        console.log('\n📋 AVAILABLE SYMBOLS:');
        const symbols = terminalState.symbols;
        if (symbols && symbols.length > 0) {
            console.log(`   Total symbols: ${symbols.length}`);
            const goldSymbols = symbols.filter(s => 
                s.symbol.includes('XAU') || 
                s.symbol.includes('GOLD') ||
                s.symbol.toUpperCase().includes('GOLD')
            );
            console.log(`   Gold symbols: ${goldSymbols.map(s => s.symbol).join(', ')}`);
        } else {
            console.log('   ❌ No symbols available');
        }
        
        console.log('\n📈 SYMBOL SPECIFICATION TEST:');
        try {
            const spec = terminalState.specification('XAUUSD');
            if (spec) {
                console.log(`   ✅ XAUUSD spec available`);
                console.log(`   Min volume: ${spec.minVolume}`);
                console.log(`   Volume step: ${spec.volumeStep}`);
                console.log(`   Contract size: ${spec.contractSize}`);
            } else {
                console.log('   ❌ XAUUSD specification not available');
            }
        } catch (error) {
            console.log(`   ❌ Error getting spec: ${error.message}`);
        }
        
        console.log('\n🔧 DIAGNOSIS:');
        console.log('==============');
        
        if (!xauusdPrice) {
            console.log('🚨 ROOT CAUSE: FTMO account cannot access XAUUSD prices');
            console.log('   This means:');
            console.log('   1. Enhanced validation cannot get current price');
            console.log('   2. No price means no distance calculation');
            console.log('   3. Falls back to basic order which fails');
            console.log('');
            console.log('💡 SOLUTIONS:');
            console.log('   A) Check if FTMO demo includes XAUUSD symbol');
            console.log('   B) Try different symbol that\'s available');
            console.log('   C) Use Pepperstone account that has XAUUSD access');
            console.log('   D) Add fallback logic for missing price data');
        } else {
            console.log('✅ FTMO account has XAUUSD access - issue elsewhere');
        }
        
        await connection.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n🔧 POSSIBLE FIXES:');
        console.log('   1. Check if FTMO account is properly deployed');
        console.log('   2. Verify MetaAPI token has correct permissions');
        console.log('   3. Try using Pepperstone account instead');
        process.exit(1);
    }
}

testFTMOAccount();
