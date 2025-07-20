const MetaApi = require('metaapi.cloud-sdk').default;
require('dotenv').config();

async function deployMetaApiAccount() {
  try {
    console.log('🚀 Deploying MetaAPI account...');
    
    const api = new MetaApi(process.env.METAAPI_TOKEN);
    const account = await api.metatraderAccountApi.getAccount(process.env.METAAPI_ACCOUNT_ID);
    
    console.log('📋 Current account state:', account.state);
    
    if (account.state === 'UNDEPLOYED') {
      console.log('⚡ Deploying account...');
      await account.deploy();
      console.log('✅ Account deployment initiated!');
      
      // Wait for deployment to complete
      console.log('⏳ Waiting for deployment to complete...');
      let attempts = 0;
      while (attempts < 30) { // Wait up to 5 minutes
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        await account.reload();
        console.log(`🔄 Status check ${attempts + 1}/30 - State: ${account.state}`);
        
        if (account.state === 'DEPLOYED') {
          console.log('🎉 Account successfully deployed!');
          break;
        }
        attempts++;
      }
      
      if (account.state !== 'DEPLOYED') {
        console.log('⚠️ Deployment taking longer than expected. Please check MetaAPI dashboard.');
        return;
      }
    } else if (account.state === 'DEPLOYED') {
      console.log('✅ Account is already deployed!');
    }
    
    // Test connection after deployment
    console.log('🔗 Testing connection to deployed account...');
    const connection = account.getConnection();
    
    try {
      console.log('⏳ Connecting...');
      await connection.connect();
      console.log('✅ Connection established!');
      
      // Get account info
      const accountInfo = await connection.getAccountInformation();
      console.log('💰 Account Info:', {
        balance: accountInfo.balance,
        currency: accountInfo.currency,
        leverage: accountInfo.leverage,
        server: accountInfo.server,
        equity: accountInfo.equity,
        margin: accountInfo.margin
      });
      
      // Test symbol availability
      console.log('📊 Testing XAUUSD symbol...');
      try {
        const symbolSpec = await connection.getSymbolSpecification('XAUUSD');
        console.log('✅ XAUUSD available:', {
          description: symbolSpec.description,
          minVolume: symbolSpec.minVolume,
          maxVolume: symbolSpec.maxVolume,
          volumeStep: symbolSpec.volumeStep
        });
        
        // Try to get current price
        try {
          const price = await connection.getSymbolPrice('XAUUSD');
          console.log('📈 Current Price:', {
            bid: price.bid,
            ask: price.ask,
            time: new Date(price.time)
          });
        } catch (priceError) {
          console.log('⚠️ Price data unavailable (market may be closed):', priceError.message);
        }
      } catch (symbolError) {
        console.log('❌ XAUUSD symbol error:', symbolError.message);
      }
      
    } catch (connectionError) {
      console.log('❌ Connection failed:', connectionError.message);
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

deployMetaApiAccount();
