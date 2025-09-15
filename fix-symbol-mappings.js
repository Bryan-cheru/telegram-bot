/**
 * Fix all symbol mappings to be properly broker-specific
 */

const fs = require('fs');
const path = require('path');

// Read the current file
const filePath = path.join(__dirname, 'src', 'utils', 'cleanSymbolManager.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Symbol mappings to fix
const symbolMappings = [
  { symbol: 'EURAUD', id: '17', description: 'Euro vs Australian Dollar' },
  { symbol: 'EURCAD', id: '18', description: 'Euro vs Canadian Dollar' },
  { symbol: 'EURCHF', id: '19', description: 'Euro vs Swiss Franc' },
  { symbol: 'EURGBP', id: '21', description: 'Euro vs United Kingdom Pound' },
  { symbol: 'EURJPY', id: '23', description: 'Euro vs Japanese Yen' },
  { symbol: 'EURUSD', id: '27', description: 'Euro vs United States Dollar' },
  { symbol: 'GBPAUD', id: '29', description: 'United Kingdom Pound vs Australian Dollar' },
  { symbol: 'GBPCAD', id: '30', description: 'United Kingdom Pound vs Canadian Dollar' },
  { symbol: 'GBPCHF', id: '31', description: 'United Kingdom Pound vs Swiss Franc' },
  { symbol: 'GBPUSD', id: '34', description: 'United Kingdom Pound vs United States Dollar' },
  { symbol: 'NZDCAD', id: '40', description: 'New Zealand Dollar vs Canadian Dollar' },
  { symbol: 'NZDJPY', id: '42', description: 'New Zealand Dollar vs Japanese Yen' },
  { symbol: 'NZDUSD', id: '43', description: 'New Zealand Dollar vs United States Dollar' },
  { symbol: 'USDCAD', id: '52', description: 'United States Dollar vs Canadian Dollar' },
  { symbol: 'USDCHF', id: '53', description: 'United States Dollar vs Swiss Franc' },
  { symbol: 'USDJPY', id: '58', description: 'United States Dollar vs Japanese Yen' },
  { symbol: 'USDSEK', id: '62', description: 'US Dollar vs Swedish Krona' }
];

// Fix each symbol mapping
symbolMappings.forEach(({ symbol, id, description }) => {
  const oldPattern = new RegExp(
    `(\\s*// ${symbol} variations.*?\\n.*?else if \\(symbol === '${symbol}'\\) \\{[\\s\\S]*?'${id}' // InstantFunding: "${description}"[\\s\\n]*?\\);[\\s\\n]*?\\})`,
    'g'
  );

  const newPattern = `
    // ${symbol} variations - Enhanced with InstantFunding numerical ID
    else if (symbol === '${symbol}') {
      variations.push(
        '${symbol}', '${symbol.toLowerCase()}', '${symbol}_', '${symbol}.',
        '${symbol}m', '${symbol}Cash', '${symbol}.std', '${symbol}pro',
        '${symbol}_ECN', '${symbol}ECN', '${symbol}.a', '${symbol}.raw',
        '${symbol}.swap', '${symbol}#', '${symbol}_raw', '${symbol}_mini',
        '${symbol}_micro', '${symbol}ex', '${symbol}fx', '${symbol}c',
        '${symbol}.r', '${symbol}.fx', '${symbol.substring(0,3)}/${symbol.substring(3)}', '${symbol.substring(0,3)}-${symbol.substring(3)}'
      );
      // InstantFunding-specific numerical ID
      if (brokerName === 'IFPro-Trade') {
        variations.push('${id}'); // InstantFunding: "${description}"
      }
    }`;

  content = content.replace(oldPattern, newPattern);
});

// Write the fixed content back
fs.writeFileSync(filePath, content);

console.log('✅ Fixed all symbol mappings to be properly broker-specific!');
console.log('📋 Updated symbols:', symbolMappings.map(s => s.symbol).join(', '));
console.log('🎯 Numerical IDs now only added for IFPro-Trade broker');
