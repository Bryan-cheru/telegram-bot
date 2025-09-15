#!/usr/bin/env node
/**
 * GBPJPY Synchronization D            try {
                const account = await api.metatraderAccountApi.getAccount(accountId);
                const connection = account.getStreamingConnection();
                
                // INITIALIZE THE CONNECTION FIRST!
                console.log(`🔌 Connecting to ${brokerName}...`);
                await connection.connect();
                
                // Check basic connection status
                console.log(`📡 Connection Status:`);
                console.log(`   - Connected: ${connection.connected}`);
                console.log(`   - Synchronized: ${connection.synchronized}`);
                
                // Wait for synchronization with timeout
                console.log(`🔄 Waiting for synchronization...`);
                try {
                    await connection.waitSynchronized({ timeoutInSeconds: 60 });
                    console.log(`✅ Synchronized successfully`);
                } catch (syncError) {
                    console.log(`⚠️  Synchronization timeout: ${syncError.message}`);
                }* Checks why GBPJPY discovery is failing when it should work
 */

require('dotenv').config();
const MetaApi = require('metaapi.cloud-sdk').default;

async function diagnoseSynchronizationIssue() {
    console.log('🔍 GBPJPY SYNCHRONIZATION DIAGNOSTIC');
    console.log('=====================================\n');

    console.log('📋 This will check:');
    console.log('   1. Connection status for each broker');
    console.log('   2. Synchronization state');
    console.log('   3. Available symbol count');
    console.log('   4. GBPJPY variations in specifications');
    console.log('   5. Exact symbol names containing GBP and JPY');
    console.log('');

    try {
        if (!process.env.METAAPI_TOKEN) {
            console.error('❌ METAAPI_TOKEN environment variable is required');
            return;
        }

        const api = new MetaApi(process.env.METAAPI_TOKEN);
        
        // Account IDs from your current .env file
        const accountIds = [
            'b13f9d1e-4c17-4523-af26-78a97e506220', // FTMO-Server3
            'df208894-d0e4-4d76-995e-5939239e99c5', // IFPro-Trade 
            '060723c1-a97d-4bc0-b2fe-a74110959569', // Pepperstone-MT5-Live01
            'face7556-70cb-440d-8fcb-7e6c583877bd', // Pepperstone-MT5-Live02
            '0ec1a33a-1aae-4a71-a92d-1ec686dd9b87'  // FTMO-Brian
        ];

        const brokerNames = [
            'FTMO-Server3',
            'IFPro-Trade', 
            'Pepperstone-MT5-Live01',
            'Pepperstone-MT5-Live02',
            'FTMO-Brian'
        ];
        
        for (let i = 0; i < accountIds.length; i++) {
            const accountId = accountIds[i];
            const brokerName = brokerNames[i];
            
            console.log(`🏦 CHECKING: ${brokerName} (${accountId})`);
            console.log('─'.repeat(60));
            
            try {
                const account = await api.metatraderAccountApi.getAccount(accountId);
                const connection = account.getStreamingConnection();
                
                // Check basic connection status
                console.log(`📡 Connection Status:`);
                console.log(`   - Connected: ${connection.connected}`);
                console.log(`   - Synchronized: ${connection.synchronized}`);
                
                // Wait for synchronization with timeout
                console.log(`� Waiting for synchronization...`);
                try {
                    await connection.waitSynchronized({ timeoutInSeconds: 30 });
                    console.log(`✅ Synchronized successfully`);
                } catch (syncError) {
                    console.log(`⚠️  Synchronization timeout: ${syncError.message}`);
                }
                
                if (connection.terminalState) {
                    console.log(`   - Terminal connected: ${connection.terminalState.connected}`);
                    console.log(`   - Connected to broker: ${connection.terminalState.connectedToBroker}`);
                    
                    const specs = connection.terminalState.specifications || {};
                    const specCount = Object.keys(specs).length;
                    console.log(`   - Specifications loaded: ${specCount}`);
                    
                    if (specCount > 0) {
                        // Check for GBPJPY exact match
                        const gbpjpySpec = connection.terminalState.specification('GBPJPY');
                        if (gbpjpySpec) {
                            console.log(`✅ GBPJPY found: ${gbpjpySpec.description || 'No description'}`);
                            console.log(`   - Spread: ${gbpjpySpec.spread || 'Unknown'}`);
                            console.log(`   - Digits: ${gbpjpySpec.digits || 'Unknown'}`);
                        } else {
                            console.log(`❌ GBPJPY not found in specifications`);
                            
                            // Look for similar symbols
                            const allSymbols = Object.keys(specs);
                            const gbpJpyVariations = allSymbols.filter(symbol => 
                                (symbol.toUpperCase().includes('GBP') && symbol.toUpperCase().includes('JPY')) ||
                                symbol.toLowerCase().includes('gbpjpy')
                            );
                            
                            if (gbpJpyVariations.length > 0) {
                                console.log(`🔍 Similar symbols found:`);
                                gbpJpyVariations.forEach(symbol => {
                                    console.log(`   - ${symbol}: ${specs[symbol].description || 'No description'}`);
                                });
                            } else {
                                console.log(`🔍 No GBP/JPY related symbols found`);
                                
                                // Show symbols starting with GBP
                                const gbpSymbols = allSymbols.filter(s => s.startsWith('GBP')).slice(0, 5);
                                if (gbpSymbols.length > 0) {
                                    console.log(`📋 GBP symbols available:`);
                                    gbpSymbols.forEach(symbol => {
                                        console.log(`   - ${symbol}: ${specs[symbol].description || 'No description'}`);
                                    });
                                }
                                
                                // Show first 5 symbols for reference
                                const sampleSymbols = allSymbols.slice(0, 5);
                                console.log(`📋 Sample symbols available:`);
                                sampleSymbols.forEach(symbol => {
                                    console.log(`   - ${symbol}: ${specs[symbol].description || 'No description'}`);
                                });
                                if (specCount > 5) {
                                    console.log(`   ... and ${specCount - 5} more`);
                                }
                            }
                        }
                    } else {
                        console.log(`⚠️  No specifications loaded - synchronization issue`);
                    }
                } else {
                    console.log(`❌ No terminal state available`);
                }
                
                // Close connection
                connection.close();
                
            } catch (error) {
                console.log(`❌ Error checking ${brokerName}: ${error.message}`);
            }
            
            console.log(''); // Empty line between brokers
        }
        
        console.log('🎯 DIAGNOSTIC SUMMARY');
        console.log('=====================');
        console.log('');
        console.log('If GBPJPY was working last week but not now, possible causes:');
        console.log('1. 🔄 Broker temporarily disabled the symbol');
        console.log('2. 📡 MetaAPI synchronization is incomplete');
        console.log('3. 🔌 Connection issues preventing full symbol loading');
        console.log('4. ⏰ Weekend/off-market symbol restrictions');
        console.log('5. 🛠️  Broker maintenance affecting symbol availability');
        console.log('');
        console.log('SOLUTIONS TO TRY:');
        console.log('• Wait for market hours (if currently closed)');
        console.log('• Restart connections if synchronization count is low');
        console.log('• Check with broker support if symbol is temporarily disabled');
        console.log('• Force re-synchronization with longer timeout');
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
        console.error(error.stack);
    }
}

// Run diagnostic
diagnoseSynchronizationIssue().catch(console.error);
