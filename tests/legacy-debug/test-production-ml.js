// Test Production ML Integration
const { PhotoHandler } = require('./dist/bot/handlers/photoHandler');
const { MetaApiTradeExecutor } = require('./dist/mt5/metaApiTradeExecutor');

console.log('🚀 Testing Production ML Integration in PhotoHandler...');

async function testProductionIntegration() {
  try {
    // Create a mock trade executor for testing
    const mockExecutor = {
      executeTradeSignal: async (signal) => {
        console.log('🎯 MOCK TRADE EXECUTION:', {
          symbol: signal.symbol,
          action: signal.action,
          entryZone: signal.entryZone,
          stopLoss: signal.stopLoss,
          targets: signal.targets
        });
        return { success: true, message: 'Mock execution successful' };
      }
    };
    
    const photoHandler = new PhotoHandler(mockExecutor);
    
    // Simulate processing a photo message with XAUUSD chart
    const mockMessage = {
      caption: '#XAUUSD Next move on the way, focus on proper risk management',
      photo: [{ file_id: 'mock_file_id' }]
    };
    
    const mockContext = {
      chat: { id: process.env.ALLOWED_CHANNEL_ID || '-1001234567890' }, // Mock allowed channel
      channelPost: mockMessage,
      telegram: {
        getFileLink: () => Promise.resolve('mock_image_url')
      },
      reply: (message) => {
        console.log('📨 Bot Reply:', message);
        return Promise.resolve();
      }
    };
    
    // Mock the text extraction to return our test data
    const originalExtractText = photoHandler.textExtractor?.extractTextFromImage;
    if (photoHandler.textExtractor) {
      photoHandler.textExtractor.extractTextFromImage = async () => ({
        text: `
Gold Spot / U.S. Dollar · 3h · OANDA
Final Target 3475.040
Target 1 3460.000
3450.397
3447.435
3440.000
3433.594 Best buying Area: (3433-3423)
3423.144
3400.000
Resistance Become a Support
GOLD TRADER...
        `,
        confidence: 0.95
      });
    }
    
    console.log('📊 Processing mock photo with Production ML Integration...');
    await photoHandler.handlePhoto(mockContext);
    
    console.log('\n✅ Production integration test completed!');
    
  } catch (error) {
    console.error('❌ Production test error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Only run if this is the main module
if (require.main === module) {
  testProductionIntegration();
}
