// Test script to add a log entry
const { addLog } = require('./dist/dashboard/server');

console.log('Adding test log entry...');

addLog({
  level: 'info',
  message: 'Test log entry from manual script - ' + new Date().toLocaleTimeString()
});

addLog({
  level: 'success',
  message: 'Dashboard logs are now working! ✅'
});

addLog({
  level: 'warning',
  message: 'This is a test warning message'
});

addLog({
  level: 'error', 
  message: 'This is a test error message'
});

console.log('Test logs added successfully!');
