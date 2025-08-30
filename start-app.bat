@echo off
echo Starting Telegram Trading Bot...
cd /d "%~dp0"
npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build successful, starting app...
npm run electron
pause
