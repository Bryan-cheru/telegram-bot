@echo off
echo 🚂 Railway Deployment Script for Telegram Trading Bot
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

echo 📋 Step 2: Checking Railway CLI...
railway --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Railway CLI not found. Installing...
    npm install -g @railway/cli
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Failed to install Railway CLI. Please install manually.
        pause
        exit /b 1
    )
)

echo ✅ Railway CLI ready!
echo.

echo 📋 Step 3: Deploying to Railway...
echo ⚠️  Make sure you have set your environment variables in Railway dashboard:
echo    - BOT_TOKEN
echo    - ALLOWED_CHANNEL_ID  
echo    - METAAPI_TOKEN
echo    - METAAPI_ACCOUNT_ID
echo    - MAX_TRADE_SIZE
echo    - RISK_PERCENTAGE
echo.

pause

echo 🚀 Starting deployment...
railway up

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Deployment successful! Your bot is now running on Railway 24/7!
    echo 📊 Check the Railway dashboard for logs and monitoring.
    echo 🔗 Bot will automatically restart if there are any issues.
) else (
    echo.
    echo ❌ Deployment failed. Please check the error messages above.
    echo 💡 Make sure you're logged in to Railway: railway login
)

echo.
pause
