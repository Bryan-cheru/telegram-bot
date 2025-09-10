/**
 * Test Enhanced Symbol Manager with Proper Connection Handling
 */

const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();
const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');

async function testEnhancedSymbolManager() {
  try {
    console.log('🧪 Testing Enhanced Symbol Manager...');
    
    const token = process.env.METAAPI_TOKEN;
    const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade account ID
    
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    console.log('⏳ Connecting and synchronizing properly...');
    if (account.connectionStatus !== 'CONNECTED') {
      await account.waitConnected();
    }
    
    const connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized(); // Ensure synchronized before testing
    
    console.log('✅ Connection ready, testing enhanced symbol validation...');
    
    // Test 1: Normal XAUUSD lookup
    try {
      console.log('\n📋 Test 1: XAUUSD Symbol Lookup');
      const validSymbol = await CleanSymbolManager.getValidSymbol('XAUUSD', connection, 'IFPro-Trade');
      console.log(`✅ SUCCESS! Found: ${validSymbol}`);
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 2: Cache functionality
    try {
      console.log('\n📋 Test 2: Cache Performance Test');
      const start = Date.now();
      const validSymbol = await CleanSymbolManager.getValidSymbol('XAUUSD', connection, 'IFPro-Trade');
      const duration = Date.now() - start;
      console.log(`✅ SUCCESS! Cached lookup in ${duration}ms: ${validSymbol}`);
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 3: Invalid symbol handling
    try {
      console.log('\n📋 Test 3: Invalid Symbol Error Handling');
      await CleanSymbolManager.getValidSymbol('INVALID_SYMBOL_XYZ', connection, 'IFPro-Trade');
      console.log(`❌ UNEXPECTED! Should have failed for invalid symbol`);
    } catch (error) {
      console.log(`✅ SUCCESS! Correctly rejected invalid symbol: ${error.message}`);
    }
    
    // Test 4: Symbol variations
    try {
      console.log('\n📋 Test 4: Symbol Variations Generation');
      const variations = CleanSymbolManager.getSymbolVariations('XAUUSD', 'IFPro-Trade');
      console.log(`✅ SUCCESS! Generated variations: ${variations.join(', ')}`);
      
      // Verify '66' is prioritized for IFPro-Trade
      if (variations[0] === '66') {
        console.log(`✅ EXCELLENT! '66' is prioritized for IFPro-Trade`);
      } else {
        console.log(`⚠️ WARNING: '66' not prioritized: ${variations[0]}`);
      }
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    await connection.close();
    console.log('\n🎉 Enhanced Symbol Manager Test Complete!');
    
  } catch (error) {
    console.error('\n❌ Test setup error:', error.message);
  }
  
  process.exit(0);
}

testEnhancedSymbolManager();
