// Quick test of the electron bot runner
const path = require('path');

console.log('Testing electron bot runner...');

async function testElectronBotRunner() {
  try {
    // Simulate Electron environment
    process.env.ELECTRON_IS_RUNNING = 'true';
    process.env.NODE_ENV = 'production';
    
    // Import the electron bot runner
    const electronBotPath = path.join(__dirname, 'dist', 'electron-bot-runner.js');
    const { startBotForElectron, stopBotForElectron, getBotStatus } = require(electronBotPath);
    
    console.log('✅ Electron bot runner imported successfully');
    
    // Check initial status
    const initialStatus = getBotStatus();
    console.log('Initial bot status:', initialStatus.running ? 'Running' : 'Stopped');
    
    console.log('🧪 Test completed - bot runner is ready!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testElectronBotRunner();
