@echo off
echo Testing Installed App...
echo.
echo Step 1: Uninstall old version (if any)
echo Please manually uninstall the old version from Control Panel if it exists
pause

echo.
echo Step 2: Install new version
echo Installing from: dist-electron\Telegram Trading Bot Setup 1.0.1.exe
start /wait "Installing" "dist-electron\Telegram Trading Bot Setup 1.0.1.exe"

echo.
echo Step 3: Test the installed app
echo The app should now be in your Start Menu
echo Look for "Telegram Trading Bot"
echo.
echo When you run it:
echo 1. Click "Debug Info" button to see paths
echo 2. Try starting the bot
echo 3. Check the logs for any error messages
echo.
pause
