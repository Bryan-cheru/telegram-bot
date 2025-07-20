#!/bin/bash

# Railway deployment script
echo "Starting Telegram Trading Bot deployment..."

# Install dependencies
echo "Installing dependencies..."
npm ci --only=production

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Start the application
echo "Starting application..."
npm start
