/**
 * Test IFPro-Trade Symbol Fix
 * Quickly test if the synchronization and symbol lookup fixes work
 */

const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();

// Import our fixed symbol manager
const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');

async function testIFProTradeFix() {
  try {
    console.log('🧪 Testing IFPro-Trade symbol fix...');
    
    const token = process.env.METAAPI_TOKEN;
    const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade account ID
    
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    console.log('⏳ Connecting...');
    if (account.connectionStatus !== 'CONNECTED') {
      await account.waitConnected();
    }
    
    const connection = account.getStreamingConnection();
    await connection.connect();
    
    console.log('🔍 Testing symbol validation with fixed manager...');
    
    try {
      const validSymbol = await CleanSymbolManager.getValidSymbol('XAUUSD', connection, 'IFPro-Trade');
      console.log(`✅ SUCCESS! Found valid symbol: ${validSymbol}`);
    } catch (error) {
      console.log(`❌ FAILED! Error: ${error.message}`);
    }
    
    await connection.close();
    console.log('✅ Test complete');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
  
  process.exit(0);
}

testIFProTradeFix();
