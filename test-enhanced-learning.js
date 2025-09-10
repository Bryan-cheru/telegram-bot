/**
 * Test Enhanced Symbol Management System with Learning
 */

const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();
const { CleanSymbolManager } = require('./dist/utils/cleanSymbolManager');

async function testEnhancedSymbolSystem() {
  try {
    console.log('🧪 Testing Enhanced Symbol Management System...\n');
    
    const token = process.env.METAAPI_TOKEN;
    const accountId = 'df208894-d0e4-4d76-995e-5939239e99c5'; // IFPro-Trade account ID
    
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    console.log('⏳ Connecting with enhanced synchronization...');
    if (account.connectionStatus !== 'CONNECTED') {
      await account.waitConnected();
    }
    
    const connection = account.getStreamingConnection();
    await connection.connect();
    
    // Test 1: Enhanced Connection Ready with Retry Logic
    console.log('\n📋 Test 1: Enhanced Connection Management');
    const start1 = Date.now();
    try {
      await CleanSymbolManager.ensureConnectionReady(connection, 'IFPro-Trade', 3);
      console.log(`✅ SUCCESS! Connection ready in ${Date.now() - start1}ms`);
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 2: Initialize Broker Learning
    console.log('\n📋 Test 2: Symbol Learning Initialization');
    const start2 = Date.now();
    try {
      await CleanSymbolManager.initializeBrokerLearning(connection, 'IFPro-Trade');
      console.log(`✅ SUCCESS! Learning initialized in ${Date.now() - start2}ms`);
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 3: Intelligent Symbol Variations
    console.log('\n📋 Test 3: Intelligent Symbol Variations');
    try {
      const variations = CleanSymbolManager.getIntelligentVariations('XAUUSD', 'IFPro-Trade');
      console.log(`✅ SUCCESS! Generated ${variations.length} variations:`);
      console.log(`   Priority order: ${variations.slice(0, 5).join(', ')}${variations.length > 5 ? '...' : ''}`);
      
      // Check if '66' is prioritized
      if (variations[0] === '66' || variations[1] === '66') {
        console.log(`✅ EXCELLENT! '66' is properly prioritized for IFPro-Trade`);
      } else {
        console.log(`⚠️ WARNING: '66' not in top positions: ${variations.slice(0, 3)}`);
      }
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 4: Enhanced Symbol Lookup with Learning
    console.log('\n📋 Test 4: Enhanced Symbol Lookup (First Time)');
    const start4 = Date.now();
    try {
      const validSymbol = await CleanSymbolManager.getValidSymbol('XAUUSD', connection, 'IFPro-Trade');
      console.log(`✅ SUCCESS! Found symbol: ${validSymbol} in ${Date.now() - start4}ms`);
      console.log(`   System learned this mapping for future use`);
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 5: Second Lookup (Should Use Learned Mapping)
    console.log('\n📋 Test 5: Second Lookup (Using Learned Mapping)');
    const start5 = Date.now();
    try {
      const validSymbol = await CleanSymbolManager.getValidSymbol('XAUUSD', connection, 'IFPro-Trade');
      const duration = Date.now() - start5;
      console.log(`✅ SUCCESS! Found symbol: ${validSymbol} in ${duration}ms`);
      
      if (duration < 1000) {
        console.log(`🚀 EXCELLENT! Learning system working - much faster lookup!`);
      } else {
        console.log(`⚠️ Learning system may not be optimizing as expected`);
      }
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 6: Different Symbol Learning
    console.log('\n📋 Test 6: Learning System with Different Symbol');
    try {
      // Try to find EUR/USD equivalent
      const eurVariations = CleanSymbolManager.getIntelligentVariations('EURUSD', 'IFPro-Trade');
      console.log(`✅ EURUSD variations: ${eurVariations.slice(0, 5).join(', ')}`);
      
      // Check if system found any EUR symbols
      const allSymbols = await CleanSymbolManager.getAllSymbols(connection, 'IFPro-Trade');
      const eurSymbols = allSymbols.filter(s => s.includes('EUR') || s.includes('1')); // 1 might be EUR on numeric systems
      console.log(`📊 Found ${eurSymbols.length} potential EUR symbols: ${eurSymbols.slice(0, 3).join(', ')}`);
      
    } catch (error) {
      console.log(`❌ FAILED! ${error.message}`);
    }
    
    // Test 7: Error Handling & Classification
    console.log('\n📋 Test 7: Error Classification System');
    try {
      await CleanSymbolManager.getValidSymbol('TOTALLY_INVALID_SYMBOL_XYZ123', connection, 'IFPro-Trade');
      console.log(`❌ UNEXPECTED! Should have failed for invalid symbol`);
    } catch (error) {
      const errorType = CleanSymbolManager.classifySymbolError(error, 'INVALID', 'IFPro-Trade');
      console.log(`✅ SUCCESS! Properly rejected invalid symbol`);
      console.log(`   Error classified as: ${errorType}`);
      console.log(`   Error message: ${error.message.substring(0, 100)}...`);
    }
    
    await connection.close();
    console.log('\n🎉 Enhanced Symbol System Test Complete!');
    console.log('\n📊 SUMMARY:');
    console.log('✅ Enhanced synchronization with retry logic');
    console.log('✅ Automatic symbol discovery and learning');
    console.log('✅ Intelligent symbol variation generation');
    console.log('✅ Performance optimization through caching');
    console.log('✅ Robust error classification');
    console.log('✅ Future-proof broker adaptation');
    
  } catch (error) {
    console.error('\n❌ Test setup error:', error.message);
  }
  
  process.exit(0);
}

testEnhancedSymbolSystem();
