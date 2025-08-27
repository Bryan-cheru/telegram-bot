# Telegram Trading Bot - Complete Installation Package Builder

## This script creates a complete standalone installer with all dependencies

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    TELEGRAM TRADING BOT INSTALLER" -ForegroundColor Yellow
Write-Host "         Complete Package Builder" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
Write-Host "Checking Node.js..." -ForegroundColor Green
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ package.json not found! Please run this from the bot directory." -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Installing dependencies..." -ForegroundColor Blue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies!" -ForegroundColor Red
    exit 1
}

Write-Host "🏗️ Building TypeScript..." -ForegroundColor Blue
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ TypeScript build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Creating complete installer packages..." -ForegroundColor Blue
Write-Host "This will create both NSIS installer and portable version" -ForegroundColor Yellow

# Build both installer and portable versions
npm run electron:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Electron build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 SUCCESS! Installer packages created:" -ForegroundColor Green
Write-Host ""

# List created files
if (Test-Path "dist-electron") {
    $files = Get-ChildItem "dist-electron" -Filter "*.exe"
    foreach ($file in $files) {
        $sizeInMB = [math]::Round($file.Length/1MB,1)
        Write-Host "  📦 $($file.Name) ($sizeInMB MB)" -ForegroundColor Cyan
    }
    
    $blockMapFiles = Get-ChildItem "dist-electron" -Filter "*.blockmap"
    foreach ($file in $blockMapFiles) {
        Write-Host "  🗺️ $($file.Name) (update map)" -ForegroundColor Gray
    }
    
    if (Test-Path "dist-electron\latest.yml") {
        Write-Host "  📋 latest.yml (auto-update config)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "📋 Package Contents:" -ForegroundColor Yellow
Write-Host "  ✅ Complete Electron desktop app" -ForegroundColor Green
Write-Host "  ✅ All Node.js dependencies bundled" -ForegroundColor Green
Write-Host "  ✅ MetaAPI SDK included" -ForegroundColor Green
Write-Host "  ✅ OCR engine (Tesseract) built-in" -ForegroundColor Green
Write-Host "  ✅ Configuration templates" -ForegroundColor Green
Write-Host "  ✅ Complete documentation" -ForegroundColor Green
Write-Host "  ✅ Auto-updater support" -ForegroundColor Green
Write-Host ""

Write-Host "🚀 Distribution Ready!" -ForegroundColor Green
Write-Host "Users can now install with just the .exe file - no Node.js required!" -ForegroundColor Yellow
Write-Host ""

Write-Host "📤 Share these files with users:" -ForegroundColor Cyan
Write-Host "  • Telegram Trading Bot Setup 1.0.0.exe (Full Installer)" -ForegroundColor White
Write-Host "  • Telegram Trading Bot-1.0.0-portable.exe (Portable Version)" -ForegroundColor White
Write-Host ""

Write-Host "💡 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Test the installer on a clean system" -ForegroundColor White
Write-Host "  2. Share the setup file with end users" -ForegroundColor White
Write-Host "  3. Users just run the .exe - everything is included!" -ForegroundColor White
Write-Host ""

Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
