import * as zmq from 'zeromq';
import { MT5TradeRequest, MT5Response } from '../types';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export class MT5Connection {
  private socket: zmq.Request | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    try {
      logger.info(`Attempting to connect to MT5 server at ${config.mt5.host}:${config.mt5.port}`);
      this.socket = new zmq.Request();
      await this.socket.connect(`tcp://${config.mt5.host}:${config.mt5.port}`);
      this.isConnected = true;
      logger.info(`Successfully connected to MT5 at ${config.mt5.host}:${config.mt5.port}`);
      
      // Test the connection immediately
      const testResult = await this.testConnection();
      if (testResult) {
        logger.info('MT5 connection test successful - ready for trading');
      } else {
        logger.warn('MT5 connection test failed - server may not be responding');
      }
    } catch (error) {
      logger.error(`Failed to connect to MT5 at ${config.mt5.host}:${config.mt5.port}:`, error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      logger.info('Disconnected from MT5');
    }
  }

  async sendRequest(request: any): Promise<MT5Response> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to MT5');
    }

    try {
      await this.socket.send(JSON.stringify(request));
      const [response] = await this.socket.receive();
      return JSON.parse(response.toString());
    } catch (error) {
      logger.error('Error sending request to MT5:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.info('Testing MT5 connection with ping...');
      const response = await Promise.race([
        this.sendRequest({ action: 'ping' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
      ]) as MT5Response;
      
      if (response.success) {
        logger.info('MT5 ping test successful');
        return true;
      } else {
        logger.warn('MT5 ping test failed:', response);
        return false;
      }
    } catch (error) {
      logger.error('MT5 connection test failed:', error);
      return false;
    }
  }
}
