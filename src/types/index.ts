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

export type TradeAction = 'BUY' | 'SELL';

export interface TradeResult {
  success: boolean;
  ticket?: number;
  error?: string;
  message?: string;
  details?: {
    volume?: number;
    symbol?: string;
    action?: string;
    target?: number;
    price?: number;
    stopLoss?: number;
    volumePerTarget?: number;
    error?: string;
    successfulTrades?: number;
    totalTrades?: number;
    orderIds?: string[];
    responses?: MetaTraderTradeResponse[];
  };
}

export interface MetaTraderTradeResponse {
  numericCode: number;
  stringCode: string;
  message: string;
  orderId?: string;
  positionId?: number;
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
