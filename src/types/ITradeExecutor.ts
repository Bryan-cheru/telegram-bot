import { TradeSignal } from './index';

export interface ITradeExecutor {
  initialize(): Promise<void>;
  executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: number;
    signalId?: string;
  }>;
  getAccountEquity?(): Promise<number>; // Optional method for position sizing
  closeConnection(): Promise<void>;
}
