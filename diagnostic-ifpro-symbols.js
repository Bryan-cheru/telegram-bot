/**
 * IFPro-Trade Symbol Diagnostic
 * Checks what symbols are available on Instant Funding server
 */

const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();

async function checkIFProTradeSymbols() {
  try {
    console.log('🔍 Connecting to IFPro-Trade to check available symbols...');
    
    const token = process.env.METAAPI_TOKEN;
    const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade account ID
    
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    console.log('📊 Account Info:');
    console.log(`   - Name: ${account.name}`);
    console.log(`   - Server: ${account.server}`);
    console.log(`   - Platform: ${account.platform}`);
    console.log(`   - State: ${account.state}`);
    console.log(`   - Connection Status: ${account.connectionStatus}`);
    
    if (account.connectionStatus !== 'CONNECTED') {
      console.log('⏳ Waiting for connection...');
      await account.waitConnected();
    }
    
    const connection = account.getStreamingConnection();
    await connection.connect();
    
    console.log('⏳ Waiting for synchronization...');
    await connection.waitSynchronized();
    
    console.log('📋 Available Symbols on IFPro-Trade:');
    const specifications = connection.terminalState.specifications;
    
    if (!specifications || Object.keys(specifications).length === 0) {
      console.log('❌ No specifications available');
      return;
    }
    
    // Look for Gold-related symbols
    const goldSymbols = [];
    const allSymbols = [];
    
    for (const [symbol, spec] of Object.entries(specifications)) {
      allSymbols.push(symbol);
      
      // Check if it's a gold-related symbol
      if (symbol.toLowerCase().includes('xau') || 
          symbol.toLowerCase().includes('gold') ||
          spec.description?.toLowerCase().includes('gold')) {
        goldSymbols.push({
          symbol,
          description: spec.description,
          tradeAllowed: spec.tradeAllowed,
          digits: spec.digits,
          contractSize: spec.contractSize
        });
      }
    }
    
    console.log(`\n🥇 GOLD SYMBOLS FOUND (${goldSymbols.length}):`);
    goldSymbols.forEach(gold => {
      console.log(`   ✅ ${gold.symbol}`);
      console.log(`      Description: ${gold.description}`);
      console.log(`      Trade Allowed: ${gold.tradeAllowed !== false}`);
      console.log(`      Digits: ${gold.digits}`);
      console.log(`      Contract Size: ${gold.contractSize}`);
      console.log('');
    });
    
    if (goldSymbols.length === 0) {
      console.log('❌ No Gold symbols found on IFPro-Trade!');
      console.log('📋 Available symbol categories:');
      
      const categories = {};
      allSymbols.forEach(symbol => {
        const category = symbol.substring(0, 3);
        categories[category] = (categories[category] || 0) + 1;
      });
      
      for (const [cat, count] of Object.entries(categories)) {
        console.log(`   ${cat}*: ${count} symbols`);
      }
      
      console.log(`\n📊 Total symbols available: ${allSymbols.length}`);
      console.log('First 20 symbols:', allSymbols.slice(0, 20).join(', '));
    }
    
    await connection.close();
    console.log('✅ Diagnostic complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

checkIFProTradeSymbols();
