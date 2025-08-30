// Test the config loading mechanism
const path = require('path');

console.log('Testing simplified config loading...');

// Import our config loader
const configLoader = require('./electron/config-loader.js');

try {
    // Load configuration
    const config = configLoader.loadConfiguration();
    
    console.log('\n=== Configuration Loading Results ===');
    console.log('TELEGRAM_BOT_TOKEN:', config.TELEGRAM_BOT_TOKEN ? '✓ Loaded' : '✗ Missing');
    console.log('TELEGRAM_CHAT_ID:', config.TELEGRAM_CHAT_ID ? '✓ Loaded' : '✗ Missing');
    console.log('MT5_SERVER:', config.MT5_SERVER ? '✓ Loaded' : '✗ Missing');
    console.log('MT5_LOGIN:', config.MT5_LOGIN ? '✓ Loaded' : '✗ Missing');
    console.log('MT5_PASSWORD:', config.MT5_PASSWORD ? '✓ Loaded' : '✗ Missing');
    console.log('GOOGLE_CLOUD_PROJECT_ID:', config.GOOGLE_CLOUD_PROJECT_ID ? '✓ Loaded' : '✗ Missing');
    
    // Check if all required variables are present
    const requiredVars = [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID', 
        'MT5_SERVER',
        'MT5_LOGIN',
        'MT5_PASSWORD',
        'GOOGLE_CLOUD_PROJECT_ID'
    ];
    
    const missing = requiredVars.filter(varName => !config[varName]);
    
    if (missing.length === 0) {
        console.log('\n✅ All required environment variables loaded successfully!');
        console.log('✅ Configuration system is working correctly!');
    } else {
        console.log('\n❌ Missing required variables:', missing.join(', '));
    }
    
} catch (error) {
    console.error('❌ Error loading configuration:', error.message);
    console.error('❌ Configuration system failed!');
}
