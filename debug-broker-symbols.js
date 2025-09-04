// Debug Broker Symbol Availability
// File: debug-broker-symbols.js

const MetaApi = require('metaapi.cloud-sdk').default;

console.log('🔍 DEBUGGING BROKER SYMBOL AVAILABILITY');
console.log('═══════════════════════════════════════\n');

async function debugBrokerSymbols() {
    try {
        console.log('1️⃣ Initializing MetaAPI...');
        const api = new MetaApi(process.env.METAAPI_TOKEN);

        // Check all accounts
        const accountIds = [
            process.env.METAAPI_ACCOUNT_ID,
            process.env.METAAPI_ACCOUNT_ID_2, 
            process.env.METAAPI_ACCOUNT_ID_3
        ].filter(Boolean);

        console.log(`2️⃣ Found ${accountIds.length} broker accounts\n`);

        for (let i = 0; i < accountIds.length; i++) {
            const accountId = accountIds[i];
            console.log(`🏢 BROKER ${i + 1} (${accountId.slice(-6)}):`);
            console.log('─'.repeat(40));

            try {
                const account = await api.metatraderAccountApi.getAccount(accountId);
                const connection = account.getRPCConnection();
                await connection.connect();
                await connection.waitSynchronized();

                console.log(`   ✅ Connected to: ${account.name}`);
                console.log(`   📊 Broker: ${account.brokerName || 'Unknown'}`);
                
                // Get terminal state
                const terminalState = connection.terminalState;
                const specs = terminalState.specifications;
                
                console.log(`   📈 Total Symbols: ${specs.length}`);

                // Look for silver symbols
                const silverSymbols = specs.filter(spec => 
                    spec.symbol.includes('XAG') || 
                    spec.symbol.includes('SILVER') ||
                    spec.description?.toLowerCase().includes('silver')
                );

                console.log(`   🥈 Silver Symbols Found: ${silverSymbols.length}`);
                
                if (silverSymbols.length > 0) {
                    silverSymbols.forEach(spec => {
                        console.log(`      ✅ ${spec.symbol} - ${spec.description || 'No description'}`);
                        console.log(`         Digits: ${spec.digits}, Point: ${spec.point}, Min Volume: ${spec.minVolume}`);
                    });
                } else {
                    console.log('      ❌ No silver symbols found on this broker');
                }

                // Look for gold symbols for comparison
                const goldSymbols = specs.filter(spec => 
                    spec.symbol.includes('XAU') || 
                    spec.symbol.includes('GOLD') ||
                    spec.description?.toLowerCase().includes('gold')
                );
                console.log(`   🥇 Gold Symbols: ${goldSymbols.map(s => s.symbol).join(', ')}`);

                // Show some other precious metals
                const metalSymbols = specs.filter(spec => 
                    spec.symbol.includes('XPT') || 
                    spec.symbol.includes('XPD') ||
                    spec.description?.toLowerCase().includes('platinum') ||
                    spec.description?.toLowerCase().includes('palladium')
                );
                console.log(`   🏆 Other Metals: ${metalSymbols.map(s => s.symbol).join(', ')}`);

                await connection.close();

            } catch (error) {
                console.log(`   ❌ Error with broker ${i + 1}: ${error.message}`);
            }

            console.log();
        }

        console.log('🎯 SILVER SYMBOL ANALYSIS:');
        console.log('═══════════════════════════');
        console.log('If no XAGUSD found, possible alternatives:');
        console.log('• SILVER (direct symbol name)');
        console.log('• XAGEUR (Silver vs Euro)');
        console.log('• XAG/USD (with slash)');
        console.log('• XAG_USD (with underscore)');
        console.log('• Check if silver trading is available on your brokers');

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check your MetaAPI token and account IDs');
        console.log('2. Ensure accounts are properly funded and active');
        console.log('3. Verify silver trading is enabled by your broker');
    }
}

debugBrokerSymbols();
