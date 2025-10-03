#!/usr/bin/env ts-node
/**
 * Security Configuration Checker
 * Validates security settings and identifies potential vulnerabilities
 */

import { config, validateConfig } from '../src/utils/config';
import { logger } from '../src/utils/logger';

interface SecurityCheck {
  name: string;
  passed: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  recommendation?: string;
}

class SecurityChecker {
  private checks: SecurityCheck[] = [];

  async runAllChecks(): Promise<void> {
    console.log('🔒 Running Security Configuration Checks...\n');

    // Environment checks
    this.checkEnvironmentSecurity();
    
    // Authentication checks
    this.checkAuthenticationSecurity();
    
    // API security checks
    this.checkApiSecurity();
    
    // Trading security checks
    this.checkTradingSecurity();
    
    // Configuration validation
    this.checkConfigurationSecurity();

    this.displayResults();
  }

  private checkEnvironmentSecurity(): void {
    // Check NODE_ENV
    if (process.env.NODE_ENV !== 'production') {
      this.addCheck({
        name: 'Production Environment',
        passed: false,
        severity: 'MEDIUM',
        message: 'NODE_ENV is not set to production',
        recommendation: 'Set NODE_ENV=production for deployment'
      });
    } else {
      this.addCheck({
        name: 'Production Environment',
        passed: true,
        severity: 'LOW',
        message: 'NODE_ENV correctly set to production'
      });
    }

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      this.addCheck({
        name: 'JWT Secret',
        passed: false,
        severity: 'CRITICAL',
        message: 'JWT_SECRET not set',
        recommendation: 'Generate and set a strong JWT_SECRET (32+ characters)'
      });
    } else if (process.env.JWT_SECRET.length < 32) {
      this.addCheck({
        name: 'JWT Secret Length',
        passed: false,
        severity: 'HIGH',
        message: 'JWT_SECRET is too short',
        recommendation: 'Use a JWT_SECRET with at least 32 characters'
      });
    } else {
      this.addCheck({
        name: 'JWT Secret',
        passed: true,
        severity: 'LOW',
        message: 'JWT_SECRET properly configured'
      });
    }
  }

  private checkAuthenticationSecurity(): void {
    // Check if default credentials are being used
    const botToken = process.env.BOT_TOKEN;
    if (botToken && botToken.includes('your-bot-token')) {
      this.addCheck({
        name: 'Bot Token',
        passed: false,
        severity: 'CRITICAL',
        message: 'Default bot token detected',
        recommendation: 'Replace with actual Telegram bot token'
      });
    }

    // Check MetaAPI token format
    const metaApiToken = process.env.METAAPI_TOKEN;
    if (metaApiToken) {
      if (metaApiToken.length < 100) {
        this.addCheck({
          name: 'MetaAPI Token Format',
          passed: false,
          severity: 'HIGH',
          message: 'MetaAPI token appears incomplete',
          recommendation: 'Verify complete MetaAPI token is set'
        });
      } else {
        this.addCheck({
          name: 'MetaAPI Token Format',
          passed: true,
          severity: 'LOW',
          message: 'MetaAPI token format appears valid'
        });
      }
    }
  }

  private checkApiSecurity(): void {
    // Check memory limits
    const nodeOptions = process.env.NODE_OPTIONS;
    if (nodeOptions && nodeOptions.includes('max-old-space-size')) {
      const memMatch = nodeOptions.match(/max-old-space-size=(\d+)/);
      if (memMatch) {
        const memLimit = parseInt(memMatch[1]);
        if (memLimit < 512) {
          this.addCheck({
            name: 'Memory Allocation',
            passed: false,
            severity: 'MEDIUM',
            message: `Low memory limit: ${memLimit}MB`,
            recommendation: 'Increase to at least 512MB for stable operation'
          });
        } else {
          this.addCheck({
            name: 'Memory Allocation',
            passed: true,
            severity: 'LOW',
            message: `Adequate memory limit: ${memLimit}MB`
          });
        }
      }
    }

    // Check connection limits
    const maxConnections = parseInt(process.env.MAX_CONCURRENT_CONNECTIONS || '5');
    if (maxConnections > 20) {
      this.addCheck({
        name: 'Connection Limits',
        passed: false,
        severity: 'MEDIUM',
        message: 'High concurrent connection limit may cause resource issues',
        recommendation: 'Consider reducing MAX_CONCURRENT_CONNECTIONS'
      });
    }
  }

  private checkTradingSecurity(): void {
    // Check risk percentage
    const riskPercentage = parseFloat(process.env.RISK_PERCENTAGE || '0');
    if (riskPercentage > 5) {
      this.addCheck({
        name: 'Risk Management',
        passed: false,
        severity: 'HIGH',
        message: `High risk percentage: ${riskPercentage}%`,
        recommendation: 'Consider reducing RISK_PERCENTAGE to below 2%'
      });
    } else if (riskPercentage > 2) {
      this.addCheck({
        name: 'Risk Management',
        passed: false,
        severity: 'MEDIUM',
        message: `Moderate risk percentage: ${riskPercentage}%`,
        recommendation: 'Consider reducing RISK_PERCENTAGE to 1% or lower'
      });
    } else {
      this.addCheck({
        name: 'Risk Management',
        passed: true,
        severity: 'LOW',
        message: `Conservative risk percentage: ${riskPercentage}%`
      });
    }

    // Check max drawdown limits
    const maxDrawdown = parseFloat(process.env.TOTAL_DRAWDOWN_LIMIT_PERCENT || '0');
    if (maxDrawdown > 10) {
      this.addCheck({
        name: 'Drawdown Protection',
        passed: false,
        severity: 'HIGH',
        message: 'High drawdown limit may risk account',
        recommendation: 'Set TOTAL_DRAWDOWN_LIMIT_PERCENT to 5% or lower'
      });
    }

    // Check if risk management is enabled
    const riskManagementEnabled = process.env.ENABLE_RISK_MANAGEMENT === 'true';
    this.addCheck({
      name: 'Risk Management Enabled',
      passed: riskManagementEnabled,
      severity: riskManagementEnabled ? 'LOW' : 'CRITICAL',
      message: riskManagementEnabled ? 'Risk management is enabled' : 'Risk management is disabled',
      recommendation: riskManagementEnabled ? undefined : 'Enable ENABLE_RISK_MANAGEMENT=true'
    });
  }

  private checkConfigurationSecurity(): void {
    // Run standard config validation
    const configValid = validateConfig();
    this.addCheck({
      name: 'Configuration Validation',
      passed: configValid,
      severity: configValid ? 'LOW' : 'CRITICAL',
      message: configValid ? 'All required configuration present' : 'Missing required configuration',
      recommendation: configValid ? undefined : 'Check console output for missing configuration'
    });
  }

  private addCheck(check: SecurityCheck): void {
    this.checks.push(check);
  }

  private displayResults(): void {
    console.log('\n🔍 Security Check Results:');
    console.log('═'.repeat(60));

    const critical = this.checks.filter(c => c.severity === 'CRITICAL');
    const high = this.checks.filter(c => c.severity === 'HIGH');
    const medium = this.checks.filter(c => c.severity === 'MEDIUM');
    const low = this.checks.filter(c => c.severity === 'LOW');

    const passed = this.checks.filter(c => c.passed).length;
    const failed = this.checks.filter(c => !c.passed).length;

    // Display summary
    console.log(`\n📊 Summary: ${passed} passed, ${failed} failed`);
    console.log(`   🔴 Critical: ${critical.filter(c => !c.passed).length}`);
    console.log(`   🟠 High: ${high.filter(c => !c.passed).length}`);
    console.log(`   🟡 Medium: ${medium.filter(c => !c.passed).length}`);
    console.log(`   🟢 Low: ${low.filter(c => c.passed).length}`);

    // Display failed checks
    console.log('\n❌ Failed Security Checks:');
    this.checks.filter(c => !c.passed).forEach(check => {
      const icon = check.severity === 'CRITICAL' ? '🔴' : 
                   check.severity === 'HIGH' ? '🟠' : 
                   check.severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`\n${icon} ${check.name} [${check.severity}]`);
      console.log(`   Issue: ${check.message}`);
      if (check.recommendation) {
        console.log(`   Fix: ${check.recommendation}`);
      }
    });

    // Overall security rating
    const criticalIssues = critical.filter(c => !c.passed).length;
    const highIssues = high.filter(c => !c.passed).length;
    
    let rating: string;
    let color: string;
    
    if (criticalIssues > 0) {
      rating = 'CRITICAL - Deployment NOT Recommended';
      color = '🔴';
    } else if (highIssues > 2) {
      rating = 'HIGH RISK - Address Issues Before Deployment';
      color = '🟠';
    } else if (highIssues > 0 || medium.filter(c => !c.passed).length > 3) {
      rating = 'MODERATE RISK - Review and Fix Issues';
      color = '🟡';
    } else {
      rating = 'LOW RISK - Ready for Deployment';
      color = '🟢';
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`${color} Security Rating: ${rating}`);
    console.log('═'.repeat(60));
  }
}

// Run security checks
async function runSecurityCheck(): Promise<void> {
  try {
    const checker = new SecurityChecker();
    await checker.runAllChecks();
  } catch (error) {
    console.error('Security check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSecurityCheck();
}

export { SecurityChecker, runSecurityCheck };