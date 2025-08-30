@echo off
echo Building Telegram Trading Bot Distribution...
cd /d "%~dp0"

echo Step 1: Clean previous builds...
rmdir /s /q dist-electron 2>nul
rmdir /s /q dist 2>nul

echo Step 2: Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo TypeScript build failed!
    pause
    exit /b 1
)

echo Step 3: Building Electron App...
call npm run app:build
if %errorlevel% neq 0 (
    echo Electron build failed!
    pause
    exit /b 1
)

echo Step 4: Build completed!
echo Check the dist-electron folder for your installer.
echo.
dir dist-electron\*.exe /b 2>nul
pause
