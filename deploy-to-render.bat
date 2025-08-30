@echo off
echo 🌐 Render.com Deployment Script
echo.

echo 📋 Step 1: Building the application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Build failed! Please fix any TypeScript errors first.
    pause
    exit /b 1
)

echo ✅ Build successful!
echo.

echo 📋 Step 2: Preparing for Render deployment...
echo.
echo 🔗 Follow these steps to deploy on Render.com:
echo.
echo 1. Go to https://render.com and create a free account
echo 2. Click "New +" then "Web Service"
echo 3. Connect your GitHub repository (push this code to GitHub first)
echo 4. Use these settings:
echo    - Build Command: npm install ^&^& npm run build
echo    - Start Command: npm start
echo    - Environment: Node
echo.
echo 5. Add these environment variables in Render dashboard:
echo    BOT_TOKEN=%BOT_TOKEN%
echo    ALLOWED_CHANNEL_ID=%ALLOWED_CHANNEL_ID%
echo    METAAPI_TOKEN=%METAAPI_TOKEN%
echo    METAAPI_ACCOUNT_ID=%METAAPI_ACCOUNT_ID%
echo    MAX_TRADE_SIZE=0.1
echo    RISK_PERCENTAGE=2
echo    LOG_LEVEL=info
echo    NODE_ENV=production
echo    PORT=3000
echo.
echo 6. Click "Create Web Service" and wait for deployment!
echo.
echo ✅ Your bot will be running 24/7 on Render.com for FREE!
echo 📊 No payment issues - free tier is perfect for trading bots
echo.
pause
