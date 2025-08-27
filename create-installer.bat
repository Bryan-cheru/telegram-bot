@echo off
title Telegram Trading Bot - Complete Installer Builder

echo ==========================================
echo    TELEGRAM TRADING BOT INSTALLER
echo         Complete Package Builder
echo ==========================================
echo.

REM Check Node.js installation
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js is installed

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Please run this from the bot directory.
    pause
    exit /b 1
)

echo.
echo 🔧 Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo 🏗️ Building TypeScript...
call npm run build
if errorlevel 1 (
    echo ERROR: TypeScript build failed!
    pause
    exit /b 1
)

echo.
echo 📦 Creating complete installer packages...
echo This will create both NSIS installer and portable version...
call npm run electron:build
if errorlevel 1 (
    echo ERROR: Electron build failed!
    pause
    exit /b 1
)

echo.
echo 🎉 SUCCESS! Installer packages created:
echo.
if exist "dist-electron\*.exe" (
    dir "dist-electron\*.exe" /B
) else (
    echo No .exe files found in dist-electron folder
)

echo.
echo 📋 Package Contents:
echo   ✅ Complete Electron desktop app
echo   ✅ All Node.js dependencies bundled
echo   ✅ MetaAPI SDK included
echo   ✅ OCR engine (Tesseract) built-in
echo   ✅ Configuration templates
echo   ✅ Complete documentation
echo   ✅ Auto-updater support
echo.

echo 🚀 Distribution Ready!
echo Users can now install with just the .exe file - no Node.js required!
echo.

echo 📤 Share these files with users:
if exist "dist-electron\Telegram Trading Bot Setup 1.0.0.exe" (
    echo   • Telegram Trading Bot Setup 1.0.0.exe (Full Installer^)
)
if exist "dist-electron\Telegram Trading Bot-1.0.0-portable.exe" (
    echo   • Telegram Trading Bot-1.0.0-portable.exe (Portable Version^)
)
echo.

echo 💡 Next Steps:
echo   1. Test the installer on a clean system
echo   2. Share the setup file with end users
echo   3. Users just run the .exe - everything is included!
echo.

pause
