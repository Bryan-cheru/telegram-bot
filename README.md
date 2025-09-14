# Telegram Trading Bot

A professional trading bot that monitors Telegram channels for trading signals and executes trades across multiple MetaAPI accounts.

## Features

- **Multi-Account Trading**: Execute trades across multiple MetaAPI accounts simultaneously
- **Signal Processing**: Extract trading signals from text and chart images
- **Risk Management**: Automatic position sizing and 1:1 risk-reward ratio
- **Symbol Mapping**: Support for various broker symbol formats including IFPro-Trade numeric symbols
- **Dashboard**: Real-time monitoring and management interface
- **OCR Integration**: Extract trading levels from chart images

## Production Setup

1. **Environment Variables**: Configure `.env` file with your MetaAPI tokens and account IDs
2. **Install Dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Start**: `npm start`

## Configuration

The bot requires MetaAPI account credentials and Telegram bot token. See `.env.production` for required environment variables.

## Deployment

The bot includes configuration for Render deployment via `render.yaml`. Ensure all environment variables are set in your deployment platform.

## Support

For issues or questions, refer to the source code documentation in the `src/` directory.
