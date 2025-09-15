/**
 * Debug Pepperstone XAUUSD Symbol Discovery
 * This will help us find the exact XAUUSD symbol name on your Pepperstone demo account
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function debugPepperstoneXAUUSD() {
    console.log('🔍 DEBUGGING PEPPERSTONE XAUUSD SYMBOL');
    console.log('=====================================');
    
    try {
        // Initialize MetaAPI
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const accountId = '1fd3d084-a938-4399-bbad-30e29eea9311'; // Your Pepperstone Demo
        
        console.log(`📊 Connecting to Pepperstone Demo account: ${accountId}`);
        
        // Get account and establish connection
        const account = await api.metatraderAccountApi.getAccount(accountId);
        
        // Check deployment
        if (account.state !== 'DEPLOYED') {
            console.log('📦 Deploying account...');
            await account.deploy();
            await account.waitDeployed(60000);
        }
        
        // Wait for connection
        console.log('⏳ Waiting for connection...');
        await account.waitConnected(60000);
        
        // Get streaming connection
        const connection = account.getStreamingConnection();
        await connection.connect();
        
        // Wait for synchronization
        console.log('🔄 Waiting for synchronization...');
        await connection.waitSynchronized();
        
        // Get all specifications
        const specifications = connection.terminalState.specifications || {};
        console.log(`📋 Total symbols available: ${Object.keys(specifications).length}`);
        
        // Search for GOLD/XAU symbols
        console.log('\n🥇 SEARCHING FOR GOLD/XAU SYMBOLS:');
        console.log('====================================');
        
        const goldSymbols = [];
        Object.keys(specifications).forEach(symbol => {
            const spec = specifications[symbol];
            const symbolUpper = symbol.toUpperCase();
            const description = (spec.description || '').toUpperCase();
            
            // Look for GOLD, XAU, or USD patterns
            if (symbolUpper.includes('XAU') || 
                symbolUpper.includes('GOLD') || 
                description.includes('GOLD') || 
                description.includes('XAU')) {
                
                goldSymbols.push({
                    symbol: symbol,
                    description: spec.description,
                    tradeAllowed: spec.tradeAllowed !== false,
                    digits: spec.digits,
                    contractSize: spec.contractSize,
                    minVolume: spec.minVolume,
                    maxVolume: spec.maxVolume
                });
            }
        });
        
        console.log(`\n✨ Found ${goldSymbols.length} GOLD/XAU related symbols:`);
        goldSymbols.forEach((s, index) => {
            const status = s.tradeAllowed ? '✅ TRADEABLE' : '❌ NO TRADE';
            console.log(`${index + 1}. ${s.symbol} - ${s.description} (${status})`);
            console.log(`   Digits: ${s.digits}, Contract: ${s.contractSize}, Min: ${s.minVolume}, Max: ${s.maxVolume}`);
        });
        
        // Find the best XAUUSD candidate
        console.log('\n🎯 RECOMMENDED XAUUSD SYMBOL:');
        console.log('===============================');
        
        const tradeableGold = goldSymbols.filter(s => s.tradeAllowed);
        if (tradeableGold.length > 0) {
            // Prefer exact XAUUSD match, then shorter names
            const bestMatch = tradeableGold.sort((a, b) => {
                if (a.symbol === 'XAUUSD') return -1;
                if (b.symbol === 'XAUUSD') return 1;
                return a.symbol.length - b.symbol.length;
            })[0];
            
            console.log(`🏆 Best match: ${bestMatch.symbol}`);
            console.log(`📝 Description: ${bestMatch.description}`);
            console.log(`💼 Contract Size: ${bestMatch.contractSize}`);
            console.log(`📊 Digits: ${bestMatch.digits}`);
            
            // Test market data
            console.log('\n📈 TESTING MARKET DATA:');
            console.log('========================');
            try {
                const price = await connection.getSymbolPrice(bestMatch.symbol);
                console.log(`✅ Live Price for ${bestMatch.symbol}:`);
                console.log(`   Bid: ${price.bid}`);
                console.log(`   Ask: ${price.ask}`);
                console.log(`   Time: ${price.time}`);
                
                console.log(`\n🎯 SOLUTION: Update your symbol variations to include "${bestMatch.symbol}"`);
                
            } catch (priceError) {
                console.log(`❌ Could not get price for ${bestMatch.symbol}: ${priceError.message}`);
            }
            
        } else {
            console.log('❌ No tradeable GOLD symbols found!');
        }
        
        // Also check for any symbols starting with X
        console.log('\n🔍 ALL SYMBOLS STARTING WITH "X":');
        console.log('===================================');
        const xSymbols = Object.keys(specifications).filter(s => s.startsWith('X')).slice(0, 20);
        xSymbols.forEach(symbol => {
            const spec = specifications[symbol];
            console.log(`${symbol} - ${spec.description}`);
        });
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error('Full error:', error);
    }
}

// Run the debug
debugPepperstoneXAUUSD().then(() => {
    console.log('\n✅ Debug complete!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
