const { TradeParser } = require('./dist/ocr/tradeParser');

console.log('🧪 Testing Result Detection Logic\n');

const parser = new TradeParser();

const signals = [
    {
        name: "Good Update Signal (Should Trade)",
        text: `#XAUUSD (Update) Buy Setup ✔️

Gold is moving in an uptrend channel. Best buying zone: 3385 – 3375.
🔼Signal:
📍 Buy Limit: 3385 – 3375
🎯 Tp1: 3408
❌ SL: 3370`
    },
    {
        name: "Result Update (Should NOT Trade)",
        text: `XAUUSD Result Update ✅

Entry: 3380 → Target Hit: 3408
Perfect execution! +28 pips secured!
Trade completed with precision delivered.`
    },
    {
        name: "Results Update (Should NOT Trade)", 
        text: `📊 Results Update - Gold Trade
Position closed at target
Profit secured: +150 pips
No drawdown experienced`
    },
    {
        name: "NAS100 Update Signal (Should Trade)",
        text: `#NAS100 Update 📈

Bullish setup confirmed. Buy zone: 15800-15850
TP: 16000
SL: 15750`
    }
];

console.log('Testing each signal:\n');

signals.forEach((signal, index) => {
    console.log(`${index + 1}. ${signal.name}`);
    console.log('-'.repeat(50));
    
    const isResult = parser.isResultOrUpdateMessage(signal.text);
    console.log(`Text preview: "${signal.text.substring(0, 80)}..."`);
    console.log(`Is Result Message: ${isResult ? '🚫 YES (No Trade)' : '✅ NO (Can Trade)'}`);
    
    if (!isResult) {
        const parsed = parser.parseTradeSignal(signal.text);
        console.log(`Parsing Success: ${parsed ? '✅ YES' : '❌ NO'}`);
        if (parsed) {
            console.log(`Signal: ${parsed.symbol} ${parsed.action} ${parsed.entryZone.min}-${parsed.entryZone.max}`);
        }
    }
    
    console.log('');
});
