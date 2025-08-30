# Auto-Update System for Telegram Trading Bot

## 🚀 Quick Update Commands

### Option 1: Automated Update Script (Recommended)
```powershell
# Run the automated update builder
.\build-update.ps1 -NewVersion "1.0.1" -ReleaseNotes "Fixed critical bug in OCR processing"
```

### Option 2: Manual Update Process
```powershell
# 1. Update version in package.json manually
# 2. Build installers
npx electron-builder --win portable --x64 --publish=never
npx electron-builder --win nsis --x64 --publish=never
npx electron-builder --win zip --x64 --publish=never

# 3. Organize files
$version = "1.0.1"
mkdir "release\v$version"
copy "dist-electron\*.exe" "release\v$version\"
copy "dist-electron\*.zip" "release\v$version\"
```

## 📝 Update Workflow Checklist

- [ ] **Code Changes**: Make your improvements/fixes
- [ ] **Testing**: Test thoroughly using the app's testing suite
- [ ] **Version Update**: Increment version number appropriately
- [ ] **Build Process**: Run the update script or manual commands
- [ ] **Release Notes**: Document what changed
- [ ] **Quality Check**: Test the new installers
- [ ] **Distribution**: Share with users

## 🔄 Version Numbering Guide

| Change Type | Version Change | Example |
|-------------|----------------|---------|
| Bug fixes, small improvements | Patch: x.y.Z | 1.0.0 → 1.0.1 |
| New features, backward compatible | Minor: x.Y.0 | 1.0.1 → 1.1.0 |
| Breaking changes, major updates | Major: X.0.0 | 1.1.0 → 2.0.0 |

## 📋 Example Update Scenarios

### Scenario 1: Bug Fix Update
```powershell
.\build-update.ps1 -NewVersion "1.0.1" -ReleaseNotes "Fixed OCR parsing issue with EURUSD signals"
```

### Scenario 2: Feature Addition
```powershell
.\build-update.ps1 -NewVersion "1.1.0" -ReleaseNotes "Added new currency pair support and enhanced UI"
```

### Scenario 3: Major Update
```powershell
.\build-update.ps1 -NewVersion "2.0.0" -ReleaseNotes "Complete redesign with new trading engine"
```

## 🎯 User Update Instructions

### For Users with Installed Version:
1. Download the new **Setup.exe** file
2. Run as administrator
3. Follow the installation wizard
4. The installer will update your existing installation

### For Users with Portable Version:
1. Download the new **Portable.exe** file
2. Replace your existing executable
3. Your settings and data will be preserved

## 📊 Update Distribution

After building an update, you'll have these files:
- `Telegram Trading Bot-[version]-Setup.exe` - Full installer
- `Telegram Trading Bot-[version]-Portable.exe` - Portable version  
- `Telegram Trading Bot-[version]-Setup.zip` - ZIP archive
- `RELEASE_NOTES.md` - Documentation
- `update-manifest.json` - Version metadata

## 🔍 Testing Your Update

1. **Install Test**: Install the new version on a test machine
2. **Upgrade Test**: Update from previous version to ensure smooth transition
3. **Functionality Test**: Use the app's built-in testing suite
4. **Settings Migration**: Verify user settings are preserved

## 📈 Release Management

### Backup Before Release
```powershell
# Backup current release
copy-item "dist-electron" "backup\v$(Get-Date -Format 'yyyy-MM-dd')" -Recurse
```

### Version Control
```powershell
# Git workflow for updates
git add .
git commit -m "Release v1.0.1: Bug fixes and improvements"
git tag "v1.0.1"
git push origin main --tags
```

## 🚨 Emergency Hotfix Process

For critical bugs requiring immediate updates:

```powershell
# Quick hotfix build
.\build-update.ps1 -NewVersion "1.0.2" -ReleaseNotes "HOTFIX: Critical security update"

# Immediate testing and distribution
```

---

**Remember**: Always test updates thoroughly before distributing to users! 🧪
