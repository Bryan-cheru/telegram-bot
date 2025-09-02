function testSymbolDetection() {
  const testCases = [
    "#EURCAD (Update) 📊",
    "#XAUUSD Gold signal incoming",
    "#NAS100 bullish setup", 
    "#GBPUSD BUY zone 1.2650-1.2680",
    "#SPX500 (Sell Setup)",
    "EURUSD without hashtag",
    "#GOLD should convert to XAUUSD",
    "#NASDAQ should convert to NAS100"
  ];
  
  testCases.forEach((text, index) => {
    console.log(`\n--- Test ${index + 1}: "${text}" ---`);
    
    const hashtagMatch = text.match(/#([A-Z0-9]{3,10})(?:\s|\(|\b|$)/i);
    if (hashtagMatch) {
      const rawSymbol = hashtagMatch[1].toUpperCase();
      console.log(`Hashtag found: #${rawSymbol}`);
      
      let symbol = rawSymbol;
      if (["GOLD", "XAU"].includes(rawSymbol)) symbol = "XAUUSD";
      else if (["SILVER", "XAG"].includes(rawSymbol)) symbol = "XAGUSD";
      else if (["NASDAQ", "US100", "NDX"].includes(rawSymbol)) symbol = "NAS100";
      else if (["SPY", "S&P500", "SP500"].includes(rawSymbol)) symbol = "SPX500";
      else if (["DOW", "DJ30", "DJI"].includes(rawSymbol)) symbol = "US30";
      else if (["BITCOIN", "BTC", "BTCUSD"].includes(rawSymbol)) {
        console.log("❌ Cryptocurrency not supported");
        return;
      }
      
      console.log(`✅ Final symbol: ${symbol}`);
    } else {
      console.log("❌ No hashtag pattern found");
    }
  });
}

testSymbolDetection();
