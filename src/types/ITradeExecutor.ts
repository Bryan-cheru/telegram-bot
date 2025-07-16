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
  closeConnection(): Promise<void>;
}
