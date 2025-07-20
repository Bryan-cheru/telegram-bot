const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();

async function testMetaApiConnection() {
  try {
    console.log('🔄 Testing MetaAPI connection...');
    
    const api = new MetaApi(process.env.METAAPI_TOKEN);
    
    // Get account
    console.log('📋 Getting account info...');
    const account = await api.metatraderAccountApi.getAccount(process.env.METAAPI_ACCOUNT_ID);
    console.log('✅ Account found:', {
      name: account.name,
      platform: account.platform,
      state: account.state,
      connectionStatus: account.connectionStatus
    });
    
    // Test connection
    if (account.state === 'DEPLOYED') {
      console.log('🔗 Testing trading connection...');
      const connection = account.getConnection();
      
      // Wait for connection
      console.log('⏳ Waiting for connection...');
      await connection.connect();
      
      // Test basic operations
      console.log('💰 Getting account information...');
      const accountInfo = await connection.getAccountInformation();
      console.log('✅ Account Info:', {
        balance: accountInfo.balance,
        currency: accountInfo.currency,
        leverage: accountInfo.leverage,
        server: accountInfo.server
      });
      
      console.log('📊 Getting symbol info for XAUUSD...');
      const symbolInfo = await connection.getSymbolSpecification('XAUUSD');
      console.log('✅ XAUUSD Symbol Info:', {
        description: symbolInfo.description,
        minVolume: symbolInfo.minVolume,
        maxVolume: symbolInfo.maxVolume,
        volumeStep: symbolInfo.volumeStep
      });
      
      // Check if market is open
      console.log('🕐 Checking market hours...');
      try {
        const price = await connection.getSymbolPrice('XAUUSD');
        console.log('✅ Current XAUUSD Price:', {
          bid: price.bid,
          ask: price.ask,
          time: price.time
        });
        console.log('🟢 Market appears to be active');
      } catch (error) {
        console.log('🟡 Market may be closed or symbol unavailable:', error.message);
      }
      
    } else {
      console.log('⚠️ Account not deployed. State:', account.state);
    }
    
    console.log('\n🎉 MetaAPI connection test completed!');
    
  } catch (error) {
    console.error('❌ MetaAPI test failed:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

testMetaApiConnection();
