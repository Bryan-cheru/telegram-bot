# 🔄 Update Workflow - Telegram Trading Bot

## 📋 Complete Update Process

### 🚀 Step 1: Prepare Your Update

1. **Make Your Changes** in the source code
2. **Test Thoroughly** using the testing suite
3. **Update Version Number** in `package.json`
4. **Document Changes** in changelog

### 📝 Step 2: Update Version Number

**Edit `package.json`:**
```json
{
  "version": "1.0.1",  // Increment version (1.0.0 → 1.0.1)
  "description": "Your updated description"
}
```

**Version Numbering Rules:**
- **Major**: `2.0.0` - Breaking changes, major new features
- **Minor**: `1.1.0` - New features, backward compatible
- **Patch**: `1.0.1` - Bug fixes, small improvements

### 🧪 Step 3: Test Your Changes

```powershell
# Test the app locally
npm run electron

# Run the testing suite (from within the app)
# Go to Testing tab → Run Tests → Run Safety Tests
```

### 🏗️ Step 4: Build New Installers

**Run these commands in PowerShell:**

```powershell
# Navigate to your project
cd "C:\Users\Brian Cheruiyot\Desktop\telegram\telegram-bot"

# Build all installer types
npx electron-builder --win portable --x64 --publish=never
npx electron-builder --win nsis --x64 --publish=never
npx electron-builder --win zip --x64 --publish=never
```

### 📦 Step 5: Organize Release Files

```powershell
# Create release directory with version
$version = "1.0.1"  # Update this with your new version
mkdir "release\v$version"

# Copy installers to versioned release folder
copy "dist-electron\*.exe" "release\v$version\"
copy "dist-electron\*.zip" "release\v$version\"
copy "dist-electron\*.blockmap" "release\v$version\"
```

### 📋 Step 6: Create Release Notes

Create `release\v1.0.1\RELEASE_NOTES.md`:

```markdown
# Release Notes - Version 1.0.1

## 🆕 New Features
- Feature 1 description
- Feature 2 description

## 🐛 Bug Fixes
- Fixed issue with X
- Resolved problem with Y

## 🔧 Improvements
- Enhanced performance
- Updated UI elements

## 🛡️ Security Updates
- Security improvement 1
- Security improvement 2

## 📥 Installation
- Download the appropriate installer for your needs
- Run as administrator if prompted
- Follow the installation wizard
```

### 🚀 Step 7: Update Methods Available

You now have multiple ways to create updates:

## 🎯 **Method 1: Automated PowerShell Script (RECOMMENDED)**
```powershell
.\build-update.ps1 -NewVersion "1.0.1" -ReleaseNotes "Bug fixes and improvements"
```

## 🎯 **Method 2: Quick Batch File (EASY)**
```batch
# Double-click quick-update.bat
# Enter version when prompted
# Script handles everything automatically
```

## 🎯 **Method 3: Version Manager Utility (ADVANCED)**
```powershell
# Check current version
node version-manager.js current

# Auto-increment version
node version-manager.js increment patch

# Set specific version  
node version-manager.js set 1.0.1

# Build with new version
npx electron-builder --win portable --x64 --publish=never
```

## 🎯 **Method 4: Manual Process (FULL CONTROL)**
```powershell
# 1. Edit package.json version manually
# 2. Run build commands individually
# 3. Organize files manually
```

## 📁 **What Gets Created**

After running any update method, you'll have:
```
release/v1.0.1/
├── Telegram Trading Bot-1.0.1-Setup.exe      (Full installer)
├── Telegram Trading Bot-1.0.1-Portable.exe   (Portable version)
├── Telegram Trading Bot-1.0.1-Setup.zip      (ZIP archive)
├── RELEASE_NOTES.md                           (Documentation)
└── update-manifest.json                       (Version metadata)
```

## 🧪 **Testing Your Update**

1. **Test the new installers** before distribution
2. **Run the built-in test suite** (Testing tab in the app)
3. **Verify all safety systems** are working
4. **Check configuration migration** from previous version

---

## 📋 **Complete Update Workflow Summary**

**For a typical update, just run:**
```powershell
.\build-update.ps1 -NewVersion "1.0.1" -ReleaseNotes "Your changes here"
```

**That's it!** The script will:
- ✅ Update package.json version
- ✅ Build TypeScript
- ✅ Create all installers
- ✅ Organize release files  
- ✅ Generate release notes
- ✅ Create update manifest

Your professional update system is now complete! 🎉
