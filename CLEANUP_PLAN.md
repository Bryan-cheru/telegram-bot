# Workspace Cleanup Plan

## Files to DELETE (Safe to Remove)

### Documentation Files (Outdated/Duplicate)
- 1-TO-1-RATIO-IMPLEMENTATION.md
- COMPLETE_PACKAGE.md  
- COMPREHENSIVE-PROJECT-REVIEW.md
- CRITICAL-FIXES-COMPLETE.md
- CRITICAL-PROJECT-REVIEW.md
- DASHBOARD_COMPLETE.md
- DESKTOP_APP_GUIDE.md
- DISTRIBUTION_GUIDE.md
- END_USER_GUIDE.md
- FINAL_SUCCESS.md
- HOSTING_ALTERNATIVES.md
- INSTALLATION_FIX.md
- INSTALLER_FIXES.md
- INSTALLER_GUIDE.md
- MULTI-INSTRUMENT-SUPPORT.md
- MULTI_ACCOUNT_SETUP.md
- PRODUCTION_READY.md
- RAILWAY_DEPLOYMENT.md
- RENDER_DEPLOYMENT_READY.md
- RENDER_FIX_APPLIED.md
- SETUP_INSTRUCTIONS_FOR_CLIENT.md
- SIMPLIFIED-PARSING-OPTIMIZATION.md
- SOLUTION_COMPLETE.md
- SUCCESS_REPORT.md
- TRADE_PARSER_IMPLEMENTATION.md
- TROUBLESHOOTING_GUIDE.md
- UPDATE_GUIDE.md
- UPDATE_WORKFLOW.md
- WINDOWS_APP_README.md
- WINDOWS_APP_SUCCESS.md

### Test Files (Outdated)
- test-1-to-1-ratio.js
- test-config-loading.js
- test-electron-runner.js
- test-multi-instruments.js
- test-parser-validation.js
- test-real-silver-parser.js
- test-result-filter.js
- test-silver-chart.js
- test-specific-format.js

### Batch/Script Files (Outdated)
- build-app.bat
- deploy-to-railway.bat
- deploy-to-render.bat
- diagnose-install.bat
- start-app.bat
- test-installer.bat
- test-step-by-step.bat

### Setup/Deploy Files (No longer needed)
- bot-setup.js
- deploy-account.js
- setup.js
- verify-setup.js
- version-manager.js

### Old Build/Config Files
- railwayignore (using Render now)
- render.json (using render.yaml)
- .env.railway (using Render now)

### Build Artifacts (Can be regenerated)
- dist/ (will be regenerated on build)
- dist-electron/ (desktop app builds)

## Files to KEEP (Essential)

### Core Application
- src/ (source code)
- electron/ (desktop app)
- package.json
- tsconfig.json
- README.md
- SETUP.md

### Configuration
- .env.example
- .env (if exists)
- .gitignore
- render.yaml
- Procfile

### Dependencies
- node_modules/
- package-lock.json

### Generated/Working
- logs/ (runtime logs)
- trade_signals/ (sample data)
- .metaapi/ (API cache)
