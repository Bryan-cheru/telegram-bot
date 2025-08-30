@echo off
echo === SIMPLE WINDOWS APP TEST ===
echo.
echo This will test the basic functionality step by step.
echo.

echo Step 1: Run the diagnosis tool
echo.
pause

call diagnose-install.bat

echo.
echo Step 2: Test development version
echo Do you want to test the development version first? (Y/N)
set /p choice=
if /i "%choice%"=="Y" (
    echo Testing development version...
    npm run electron
)

echo.
echo Step 3: Install and test production version
echo.
echo 1. First, uninstall any existing version from Control Panel
echo 2. Then install: dist-electron\Telegram Trading Bot Setup 1.0.1.exe
echo 3. Run from Start Menu and click "Debug Info"
echo 4. Try starting the bot
echo.
echo If it still doesn't work, we'll create a simpler version.
pause
