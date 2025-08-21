// Simple health check server for Railway deployment debugging
const http = require('http');

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      mode: 'debug'
    }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ 
      message: 'Telegram Trading Bot - Health Check Mode',
      version: '1.0.0',
      endpoints: ['/health']
    }));
  }
});

server.listen(port, () => {
  console.log(`Health check server running on port ${port}`);
  console.log('Environment variables present:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
  console.log('TELEGRAM_BOT_TOKEN present:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('METAAPI_TOKEN present:', !!process.env.METAAPI_TOKEN);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
