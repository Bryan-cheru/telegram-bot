const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🔍 Debugging False Result Detection\n');

const parser = new TradeParser();

const problematicSignals = [
    {
        name: "NAS100 Multi-Target (Should Trade)",
        text: `#NAS100 Sell Setup

Tech index at resistance.
Entry: 15850 - 15800
SL: 15900
TP1: 15750
TP2: 15700
TP3: 15650`
    },
    {
        name: "Emoji Heavy Signal (Should Trade)", 
        text: `🥇 #XAUUSD Setup

🔼 BUY Gold
📍 Entry: 3380 – 3375
🎯 TP: 3405
❌ SL: 3368

💪 Strong support holding!`
    }
];

problematicSignals.forEach(signal => {
    console.log(`Testing: ${signal.name}`);
    console.log('-'.repeat(60));
    
    const lowerText = signal.text.toLowerCase();
    console.log('Lowercase text:');
    console.log(lowerText);
    console.log('');
    
    // Check specific keywords
    const resultKeywords = [
        'result update', 'results update', 'trade result', 'trade closed',
        'position closed', 'target hit', 'target reached', 'pips secured',
        'profit secured', 'trade completed', 'closed position',
        'perfect execution', 'precision delivered', 'no drawdown'
    ];
    
    const pastTensePhrases = [
        'entry:', 'target hit:', 'secured!', 'delivered', 'executed', 'hit:'
    ];
    
    console.log('Checking result keywords:');
    resultKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) {
            console.log(`   ⚠️  Found: "${keyword}"`);
        }
    });
    
    console.log('Checking past tense phrases:');
    pastTensePhrases.forEach(phrase => {
        if (lowerText.includes(phrase)) {
            console.log(`   ⚠️  Found: "${phrase}"`);
        }
    });
    
    const isResult = parser.isResultOrUpdateMessage(signal.text);
    console.log(`Final result: ${isResult ? '🚫 BLOCKED' : '✅ ALLOWED'}\n`);
    console.log('='.repeat(60) + '\n');
});
