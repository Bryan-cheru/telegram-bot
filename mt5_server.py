"""
MT5 ZeroMQ Server
This script acts as a bridge between the Telegram bot and MetaTrader 5
Run this script alongside MT5 to enable automated trading
"""

import zmq
import json
import MetaTrader5 as mt5
import time
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mt5_server.log'),
        logging.StreamHandler()
    ]
)

class MT5Server:
    def __init__(self, port=18812):
        self.port = port
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.running = False
        
    def initialize_mt5(self):
        """Initialize MT5 connection"""
        # Try to initialize MT5
        if not mt5.initialize():
            error_code = mt5.last_error()
            logging.error(f"MT5 initialization failed. Error code: {error_code}")
            logging.error("Make sure MetaTrader 5 is installed, running, and logged into an account")
            logging.error("Also ensure 'Allow automated trading' is enabled in MT5 settings")
            return False
        
        # Check if we can get account info
        account_info = mt5.account_info()
        if account_info is None:
            error_code = mt5.last_error()
            logging.error(f"Failed to get account info. Error code: {error_code}")
            logging.error("Make sure you are logged into a trading account in MT5")
            return False
            
        logging.info(f"Successfully connected to MT5 account: {account_info.login}")
        logging.info(f"Account balance: {account_info.balance} {account_info.currency}")
        return True
    
    def start_server(self):
        """Start the ZeroMQ server"""
        try:
            self.socket.bind(f"tcp://*:{self.port}")
            self.running = True
            logging.info(f"MT5 Server started on port {self.port}")
            
            while self.running:
                try:
                    # Wait for request
                    message = self.socket.recv_json(zmq.NOBLOCK)
                    logging.info(f"Received request: {message}")
                    
                    # Process request
                    response = self.process_request(message)
                    
                    # Send response
                    self.socket.send_json(response)
                    logging.info(f"Sent response: {response}")
                    
                except zmq.Again:
                    # No message available
                    time.sleep(0.1)
                    continue
                except Exception as e:
                    logging.error(f"Error processing request: {e}")
                    error_response = {"success": False, "error": str(e)}
                    self.socket.send_json(error_response)
                    
        except KeyboardInterrupt:
            logging.info("Server stopped by user")
        except Exception as e:
            logging.error(f"Server error: {e}")
        finally:
            self.cleanup()
    
    def process_request(self, request):
        """Process incoming requests"""
        action = request.get('action')
        
        if action == 'ping':
            return {"success": True, "message": "pong"}
        
        elif action == 'trade':
            return self.execute_trade(request.get('request', {}))
        
        elif action == 'modify_position':
            return self.modify_position(request)
        
        elif action == 'get_account_info':
            return self.get_account_info()
        
        elif action == 'get_symbol_info':
            return self.get_symbol_info(request.get('symbol'))
        
        else:
            return {"success": False, "error": f"Unknown action: {action}"}
    
    def execute_trade(self, trade_request):
        """Execute a trade order"""
        try:
            symbol = trade_request.get('symbol')
            action = trade_request.get('action')
            volume = trade_request.get('volume', 0.1)
            price = trade_request.get('price')
            sl = trade_request.get('sl')
            tp = trade_request.get('tp')
            comment = trade_request.get('comment', 'Bot Trade')
            
            # Validate symbol
            symbol_info = mt5.symbol_info(symbol)
            if symbol_info is None:
                return {"success": False, "error": f"Symbol {symbol} not found"}
            
            # Prepare request
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": mt5.ORDER_TYPE_BUY if action == 'BUY' else mt5.ORDER_TYPE_SELL,
                "comment": comment,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            
            # Add price if specified (for pending orders)
            if price:
                request["price"] = price
            
            # Add SL/TP if specified
            if sl:
                request["sl"] = sl
            if tp:
                request["tp"] = tp
            
            # Send order
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    "success": False, 
                    "error": f"Order failed: {result.comment}",
                    "retcode": result.retcode
                }
            
            return {
                "success": True,
                "ticket": result.order,
                "price": result.price,
                "volume": result.volume
            }
            
        except Exception as e:
            logging.error(f"Trade execution error: {e}")
            return {"success": False, "error": str(e)}
    
    def modify_position(self, request):
        """Modify an existing position"""
        try:
            ticket = request.get('ticket')
            tp = request.get('tp')
            sl = request.get('sl')
            
            # Get position info
            positions = mt5.positions_get(ticket=ticket)
            if not positions:
                return {"success": False, "error": "Position not found"}
            
            position = positions[0]
            
            # Prepare modification request
            modify_request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": ticket,
                "symbol": position.symbol,
            }
            
            if tp:
                modify_request["tp"] = tp
            if sl:
                modify_request["sl"] = sl
            
            result = mt5.order_send(modify_request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    "success": False,
                    "error": f"Modification failed: {result.comment}",
                    "retcode": result.retcode
                }
            
            return {"success": True, "ticket": ticket}
            
        except Exception as e:
            logging.error(f"Position modification error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_account_info(self):
        """Get account information"""
        try:
            info = mt5.account_info()
            if info is None:
                return {"success": False, "error": "Failed to get account info"}
            
            return {
                "success": True,
                "account": {
                    "login": info.login,
                    "balance": info.balance,
                    "equity": info.equity,
                    "margin": info.margin,
                    "free_margin": info.margin_free,
                    "currency": info.currency
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_symbol_info(self, symbol):
        """Get symbol information"""
        try:
            info = mt5.symbol_info(symbol)
            if info is None:
                return {"success": False, "error": f"Symbol {symbol} not found"}
            
            return {
                "success": True,
                "symbol": {
                    "name": info.name,
                    "bid": info.bid,
                    "ask": info.ask,
                    "point": info.point,
                    "digits": info.digits,
                    "spread": info.spread,
                    "volume_min": info.volume_min,
                    "volume_max": info.volume_max,
                    "volume_step": info.volume_step
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def cleanup(self):
        """Cleanup resources"""
        self.running = False
        if self.socket:
            self.socket.close()
        if self.context:
            self.context.term()
        mt5.shutdown()
        logging.info("MT5 Server shutdown complete")

def main():
    """Main function"""
    server = MT5Server()
    
    # Initialize MT5
    if not server.initialize_mt5():
        logging.error("Failed to initialize MT5")
        return
    
    # Start server
    try:
        server.start_server()
    except KeyboardInterrupt:
        logging.info("Server stopped by user")
    finally:
        server.cleanup()

if __name__ == "__main__":
    main()
