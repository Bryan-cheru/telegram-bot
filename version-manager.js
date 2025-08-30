// Version Management Utility for Telegram Trading Bot
const fs = require('fs');
const path = require('path');

class VersionManager {
    constructor() {
        this.packageJsonPath = path.join(__dirname, 'package.json');
        this.loadPackageInfo();
    }

    loadPackageInfo() {
        this.packageData = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    }

    getCurrentVersion() {
        return this.packageData.version;
    }

    updateVersion(newVersion) {
        // Validate version format
        const versionRegex = /^\d+\.\d+\.\d+$/;
        if (!versionRegex.test(newVersion)) {
            throw new Error('Version must be in format x.y.z');
        }

        this.packageData.version = newVersion;
        fs.writeFileSync(this.packageJsonPath, JSON.stringify(this.packageData, null, 2));
        console.log(`✅ Version updated to ${newVersion}`);
    }

    incrementVersion(type = 'patch') {
        const [major, minor, patch] = this.getCurrentVersion().split('.').map(Number);
        let newVersion;

        switch (type.toLowerCase()) {
            case 'major':
                newVersion = `${major + 1}.0.0`;
                break;
            case 'minor':
                newVersion = `${major}.${minor + 1}.0`;
                break;
            case 'patch':
            default:
                newVersion = `${major}.${minor}.${patch + 1}`;
                break;
        }

        this.updateVersion(newVersion);
        return newVersion;
    }

    createReleaseNotes(version, changes = []) {
        const template = `# Release Notes - Version ${version}
Released: ${new Date().toLocaleDateString()}

## 🆕 New Features
${changes.features ? changes.features.map(f => `- ${f}`).join('\n') : '- [No new features in this release]'}

## 🐛 Bug Fixes
${changes.bugFixes ? changes.bugFixes.map(f => `- ${f}`).join('\n') : '- [No bug fixes in this release]'}

## 🔧 Improvements
${changes.improvements ? changes.improvements.map(i => `- ${i}`).join('\n') : '- [No improvements in this release]'}

## 🛡️ Security Updates
${changes.security ? changes.security.map(s => `- ${s}`).join('\n') : '- [No security updates in this release]'}

## 📥 Installation
- Download the appropriate installer for your needs
- Run as administrator if prompted
- Follow the installation wizard

## 🔧 System Requirements
- Windows 10/11 (64-bit)
- 4GB RAM minimum
- 500MB free disk space
- Internet connection for trading
`;

        const releaseDir = path.join(__dirname, 'release', `v${version}`);
        if (!fs.existsSync(releaseDir)) {
            fs.mkdirSync(releaseDir, { recursive: true });
        }

        fs.writeFileSync(path.join(releaseDir, 'RELEASE_NOTES.md'), template);
        console.log(`✅ Release notes created for version ${version}`);
    }

    getVersionInfo() {
        const current = this.getCurrentVersion();
        const [major, minor, patch] = current.split('.').map(Number);
        
        return {
            current,
            next: {
                major: `${major + 1}.0.0`,
                minor: `${major}.${minor + 1}.0`,
                patch: `${major}.${minor}.${patch + 1}`
            }
        };
    }
}

// CLI usage
if (require.main === module) {
    const vm = new VersionManager();
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'current':
            console.log(`Current version: ${vm.getCurrentVersion()}`);
            break;
        
        case 'increment':
            const type = args[1] || 'patch';
            const newVersion = vm.incrementVersion(type);
            console.log(`Version incremented to: ${newVersion}`);
            break;
        
        case 'set':
            const version = args[1];
            if (!version) {
                console.error('❌ Error: Version is required');
                process.exit(1);
            }
            vm.updateVersion(version);
            break;
        
        case 'info':
            const info = vm.getVersionInfo();
            console.log('Version Information:');
            console.log(`Current: ${info.current}`);
            console.log(`Next Patch: ${info.next.patch}`);
            console.log(`Next Minor: ${info.next.minor}`);
            console.log(`Next Major: ${info.next.major}`);
            break;
        
        default:
            console.log(`
Telegram Trading Bot - Version Manager

Usage:
  node version-manager.js current          - Show current version
  node version-manager.js increment [type] - Increment version (patch/minor/major)
  node version-manager.js set <version>    - Set specific version
  node version-manager.js info             - Show version information

Examples:
  node version-manager.js current
  node version-manager.js increment patch
  node version-manager.js set 1.2.0
            `);
    }
}

module.exports = VersionManager;
