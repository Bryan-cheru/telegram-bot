export interface TradeSignal {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryZone: {
    min: number;
    max: number;
  };
  stopLoss: number;
  targets: number[];
  reason?: string;
  plan?: string;
}

export interface MT5TradeRequest {
  symbol: string;
  action: 'BUY' | 'SELL';
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  comment?: string;
}

export interface MT5Response {
  success: boolean;
  ticket?: number;
  error?: string;
  retcode?: number;
}
