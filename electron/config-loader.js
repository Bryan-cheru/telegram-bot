const fs = require('fs');
const path = require('path');

// Simple config loader that bypasses dotenv issues
function loadConfigForElectron(appPath) {
  const isDev = process.env.NODE_ENV === 'development';
  const configPath = isDev ? 
    path.join(appPath, '.env') : 
    path.join(appPath, 'app.asar.unpacked', '.env');

  console.log('🔧 Loading config from:', configPath);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  // Read the .env file manually
  const envContent = fs.readFileSync(configPath, 'utf8');
  const lines = envContent.split('\n');
  
  const config = {};
  
  lines.forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      config[key.trim()] = value;
      // Set environment variable
      process.env[key.trim()] = value;
    }
  });

  console.log('✅ Config loaded. Variables set:', Object.keys(config).length);
  
  // Validate required variables
  const required = ['BOT_TOKEN', 'ALLOWED_CHANNEL_ID', 'METAAPI_TOKEN', 'METAAPI_ACCOUNT_ID'];
  const missing = required.filter(key => !config[key] || config[key].length === 0);
  
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }

  return config;
}

module.exports = { loadConfigForElectron };
