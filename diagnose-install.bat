@echo off
echo === Telegram Trading Bot Diagnostics ===
echo.

echo 1. Checking if Node.js is available...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Node.js is available: 
    node --version
) else (
    echo ❌ Node.js is NOT available in PATH
    echo This is likely the problem!
)

echo.
echo 2. Checking if npm is available...
npm --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ npm is available:
    npm --version
) else (
    echo ❌ npm is NOT available in PATH
)

echo.
echo 3. Looking for installed Telegram Trading Bot...
if exist "%LOCALAPPDATA%\Programs\Telegram Trading Bot" (
    echo ✅ Found installation at: %LOCALAPPDATA%\Programs\Telegram Trading Bot
    dir "%LOCALAPPDATA%\Programs\Telegram Trading Bot" /B
) else (
    echo ❌ Installation not found at: %LOCALAPPDATA%\Programs\Telegram Trading Bot
)

echo.
echo 4. Checking Program Files...
if exist "%ProgramFiles%\Telegram Trading Bot" (
    echo ✅ Found installation at: %ProgramFiles%\Telegram Trading Bot
    dir "%ProgramFiles%\Telegram Trading Bot" /B
) else (
    echo ❌ Installation not found at: %ProgramFiles%\Telegram Trading Bot
)

echo.
echo 5. Process check...
tasklist | findstr /i "Telegram"
if %errorlevel% equ 0 (
    echo ✅ Telegram Trading Bot processes found above
) else (
    echo ❌ No Telegram Trading Bot processes running
)

echo.
pause
