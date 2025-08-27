@echo off
title Telegram Trading Bot - Desktop App

echo =========================================
echo    TELEGRAM TRADING BOT - DESKTOP APP
echo =========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm packages are installed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Build the project
echo Building project...
npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Start Electron app
echo Starting Telegram Trading Bot Desktop App...
echo.
npm run electron

pause
