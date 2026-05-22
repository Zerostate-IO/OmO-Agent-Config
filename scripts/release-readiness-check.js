#!/usr/bin/env node

/**
 * Release Readiness Check Script
 * Runs strict upstream health checks + fallback regression suite + release metadata.
 * Returns non-zero exit code when not release-ready.
 *
 * Usage: node scripts/release-readiness-check.js [--json]
 *
 * Checks performed:
 *   1. Upstream health check (strict mode) - drift detection + schema validation
 *   2. Fallback models regression tests - normalization logic validation
 *   3. Fallback config roundtrip tests - persistence/round-trip validation
 *   4. Release metadata consistency - SHA pin, version alignment, gitignore, changelog
 *
 * Exit codes:
 *   0 - All checks passed, release-ready
 *   1 - Upstream health issues detected (drift, schema changes, or actions required)
 *   2 - Fallback regression tests failed
 *   3 - Upstream unresolved (network error in strict mode)
 *   5 - Release metadata inconsistencies detected
 *   4 - Unexpected error
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const UPSTREAM_HEALTH_CHECK = path.join(__dirname, 'upstream-health-check.js');
const FALLBACK_MODELS_TEST = path.join(__dirname, '..', 'tests', 'fallback-models-test.js');
const FALLBACK_ROUNDTRIP_TEST = path.join(__dirname, '..', 'tests', 'fallback-config-roundtrip-test.js');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Run a script and capture its exit code and output
 * @param {string} scriptPath - Path to the script
 * @param {string[]} args - Arguments to pass
 * @param {boolean} captureJson - Whether to capture and parse JSON output
 * @returns {Object} Result with exitCode, stdout, stderr, and parsed JSON if applicable
 */
function runScript(scriptPath, args = [], captureJson = false) {
  try {
    const cmd = `node "${scriptPath}" ${args.join(' ')}`;
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: 120000, // 2 minutes timeout
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let parsedJson = null;
    if (captureJson && stdout) {
      try {
        parsedJson = JSON.parse(stdout);
      } catch (e) {
        // Not valid JSON, that's okay
      }
    }

    return {
      success: true,
      exitCode: 0,
      stdout,
      stderr: '',
      parsedJson
    };
  } catch (e) {
    let parsedJson = null;

    // Try to parse stdout even on error (some scripts output JSON before exiting non-zero)
    if (captureJson && e.stdout) {
      try {
        parsedJson = JSON.parse(e.stdout);
      } catch (parseError) {
        // Not valid JSON
      }
    }

    return {
      success: false,
      exitCode: e.status || 1,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      error: e.message,
      parsedJson
    };
  }
}

/**
 * Run upstream health check in strict mode
 * @returns {Object} Health check result
 */
function runUpstreamHealthCheck() {
  return runScript(UPSTREAM_HEALTH_CHECK, ['--strict', '--json'], true);
}

/**
 * Run fallback models regression tests
 * @returns {Object} Test result
 */
function runFallbackModelsTest() {
  return runScript(FALLBACK_MODELS_TEST, [], false);
}

/**
 * Run fallback config roundtrip tests
 * @returns {Object} Test result
 */
function runFallbackRoundtripTest() {
  return runScript(FALLBACK_ROUNDTRIP_TEST, [], false);
}

/**
 * Run release metadata consistency checks against a project root directory.
 *
 * Validates:
 *  - .omo-upstream-sha exists and matches @upstream-sha in lib/core/model-requirements.js
 *  - VERSION, package.json.version, package-lock.json.version, and
 *    package-lock.json.packages[""].version all agree
 *  - .gitignore contains .omo/
 *  - CHANGELOG.md has an entry for the release version or an [Unreleased] section with content
 *
 * @param {string} rootDir - Absolute path to the project root
 * @returns {{ passed: boolean, actionRequired: string[], details: object }}
 */
function runReleaseMetadataCheck(rootDir) {
  const actionRequired = [];
  const details = {};

  // 1. .omo-upstream-sha exists
  const shaFile = path.join(rootDir, '.omo-upstream-sha');
  let shaFileContent = null;
  if (fs.existsSync(shaFile)) {
    shaFileContent = fs.readFileSync(shaFile, 'utf8').trim();
    details.shaFile = shaFileContent;
  } else {
    actionRequired.push('.omo-upstream-sha missing (deleted or never created)');
    details.shaFile = null;
  }

  // 2. @upstream-sha in model-requirements.js
  const reqPath = path.join(rootDir, 'lib', 'core', 'model-requirements.js');
  let reqSha = null;
  if (fs.existsSync(reqPath)) {
    const content = fs.readFileSync(reqPath, 'utf8');
    const match = content.match(/@upstream-sha\s+([0-9a-f]{40})/);
    reqSha = match ? match[1] : null;
    details.requirementsSha = reqSha;
  } else {
    actionRequired.push('lib/core/model-requirements.js not found');
    details.requirementsSha = null;
  }

  if (shaFileContent && reqSha && shaFileContent !== reqSha) {
    actionRequired.push(
      `.omo-upstream-sha (${shaFileContent}) does not match @upstream-sha in model-requirements.js (${reqSha})`
    );
  }

  // 3. Version alignment
  const versionFile = path.join(rootDir, 'VERSION');
  let versionValue = null;
  if (fs.existsSync(versionFile)) {
    versionValue = fs.readFileSync(versionFile, 'utf8').trim();
    details.version = versionValue;
  } else {
    actionRequired.push('VERSION file missing');
    details.version = null;
  }

  const pkgPath = path.join(rootDir, 'package.json');
  let pkgVersion = null;
  if (fs.existsSync(pkgPath)) {
    pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    details.packageVersion = pkgVersion;
  } else {
    actionRequired.push('package.json missing');
    details.packageVersion = null;
  }

  const lockPath = path.join(rootDir, 'package-lock.json');
  let lockVersion = null;
  let lockPackagesVersion = null;
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lockVersion = lock.version;
    lockPackagesVersion = lock.packages && lock.packages[''] && lock.packages[''].version;
    details.lockVersion = lockVersion;
    details.lockPackagesVersion = lockPackagesVersion;
  } else {
    actionRequired.push('package-lock.json missing');
    details.lockVersion = null;
    details.lockPackagesVersion = null;
  }

  if (versionValue && pkgVersion && versionValue !== pkgVersion) {
    actionRequired.push(
      `VERSION (${versionValue}) does not match package.json version (${pkgVersion})`
    );
  }
  if (versionValue && lockVersion && versionValue !== lockVersion) {
    actionRequired.push(
      `VERSION (${versionValue}) does not match package-lock.json version (${lockVersion})`
    );
  }
  if (versionValue && lockPackagesVersion && versionValue !== lockPackagesVersion) {
    actionRequired.push(
      `VERSION (${versionValue}) does not match package-lock.json packages[""].version (${lockPackagesVersion})`
    );
  }

  // 4. .gitignore contains .omo/
  const gitignorePath = path.join(rootDir, '.gitignore');
  let hasOmoEntry = false;
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    hasOmoEntry = gi.split('\n').some(line => line.trim() === '.omo/');
    details.gitignoreHasOmo = hasOmoEntry;
  } else {
    actionRequired.push('.gitignore missing');
    details.gitignoreHasOmo = false;
  }
  if (!hasOmoEntry && fs.existsSync(gitignorePath)) {
    actionRequired.push('.gitignore does not contain .omo/');
  }

  // 5. CHANGELOG.md has version entry or [Unreleased] with content
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  let changelogOk = false;
  if (fs.existsSync(changelogPath)) {
    const cl = fs.readFileSync(changelogPath, 'utf8');
    if (versionValue && cl.includes('[' + versionValue + ']')) {
      changelogOk = true;
    } else {
      const unreleasedMatch = cl.match(/##\s*\[Unreleased\]\s*\n([\s\S]*?)(?=\n##\s|$)/);
      if (unreleasedMatch && unreleasedMatch[1].trim().length > 0) {
        changelogOk = true;
      }
    }
    details.changelogOk = changelogOk;
  } else {
    actionRequired.push('CHANGELOG.md missing');
    details.changelogOk = false;
  }
  if (!changelogOk && fs.existsSync(changelogPath)) {
    const hint = versionValue
      ? `CHANGELOG.md has no entry for ${versionValue} and no populated [Unreleased] section`
      : 'CHANGELOG.md has no populated [Unreleased] section (VERSION unknown)';
    actionRequired.push(hint);
  }

  return {
    passed: actionRequired.length === 0,
    actionRequired,
    details
  };
}

/**
 * Build unified report from all checks
 * @param {Object} healthResult - Upstream health check result
 * @param {Object} fallbackModelsResult - Fallback models test result
 * @param {Object} fallbackRoundtripResult - Fallback roundtrip test result
 * @param {Object} metadataResult - Release metadata check result
 * @returns {Object} Unified report
 */
function buildReport(healthResult, fallbackModelsResult, fallbackRoundtripResult, metadataResult) {
  const report = {
    timestamp: new Date().toISOString(),
    ready: true,
    checks: {
      upstream: {
        passed: false,
        exitCode: healthResult.exitCode,
        actionRequired: [],
        error: null
      },
      fallbackModels: {
        passed: false,
        exitCode: fallbackModelsResult.exitCode,
        error: null
      },
      fallbackRoundtrip: {
        passed: false,
        exitCode: fallbackRoundtripResult.exitCode,
        error: null
      },
      releaseMetadata: {
        passed: false,
        actionRequired: [],
        details: {}
      }
    },
    summary: {
      totalChecks: 4,
      passedChecks: 0,
      failedChecks: 0
    }
  };

  // Parse upstream health check results
  if (healthResult.parsedJson) {
    report.checks.upstream.actionRequired = healthResult.parsedJson.actionRequired || [];
    report.checks.upstream.drift = healthResult.parsedJson.drift;
    report.checks.upstream.schema = healthResult.parsedJson.schema;
  }

  if (healthResult.exitCode === 0) {
    report.checks.upstream.passed = true;
    report.summary.passedChecks++;
  } else {
    report.checks.upstream.error = healthResult.error || 'Upstream health check failed';
    report.summary.failedChecks++;
    report.ready = false;
  }

  // Parse fallback models test results
  if (fallbackModelsResult.exitCode === 0) {
    report.checks.fallbackModels.passed = true;
    report.summary.passedChecks++;
  } else {
    report.checks.fallbackModels.error = fallbackModelsResult.error || 'Fallback models test failed';
    report.summary.failedChecks++;
    report.ready = false;
  }

  // Parse fallback roundtrip test results
  if (fallbackRoundtripResult.exitCode === 0) {
    report.checks.fallbackRoundtrip.passed = true;
    report.summary.passedChecks++;
  } else {
    report.checks.fallbackRoundtrip.error = fallbackRoundtripResult.error || 'Fallback roundtrip test failed';
    report.summary.failedChecks++;
    report.ready = false;
  }

  // Parse release metadata check results
  if (metadataResult) {
    report.checks.releaseMetadata.passed = metadataResult.passed;
    report.checks.releaseMetadata.actionRequired = metadataResult.actionRequired || [];
    report.checks.releaseMetadata.details = metadataResult.details || {};
  }

  if (report.checks.releaseMetadata.passed) {
    report.summary.passedChecks++;
  } else {
    report.summary.failedChecks++;
    report.ready = false;
  }

  return report;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  if (!jsonOutput) {
    console.log(`${colors.bold}${colors.cyan}🚀 OmO Release Readiness Check${colors.reset}`);
    console.log(`${colors.gray}Running comprehensive pre-release validation...${colors.reset}`);
    console.log('');
  }

  // Step 1: Upstream health check (strict mode)
  if (!jsonOutput) {
    console.log(`${colors.cyan}[1/4] Upstream health check (strict mode)...${colors.reset}`);
  }

  const healthResult = runUpstreamHealthCheck();

  if (!jsonOutput) {
    if (healthResult.exitCode === 0) {
      console.log(`${colors.green}      ✓ Upstream health check passed${colors.reset}`);
    } else if (healthResult.exitCode === 3) {
      console.log(`${colors.red}      ✗ Upstream SHA unresolved (network error in strict mode)${colors.reset}`);
    } else if (healthResult.parsedJson && healthResult.parsedJson.actionRequired) {
      console.log(`${colors.red}      ✗ Upstream health check failed: ${healthResult.parsedJson.actionRequired.length} actions required${colors.reset}`);
    } else {
      console.log(`${colors.red}      ✗ Upstream health check failed${colors.reset}`);
    }
  }

  // Step 2: Fallback models regression tests
  if (!jsonOutput) {
    console.log(`${colors.cyan}[2/4] Fallback models regression tests...${colors.reset}`);
  }

  const fallbackModelsResult = runFallbackModelsTest();

  if (!jsonOutput) {
    if (fallbackModelsResult.exitCode === 0) {
      console.log(`${colors.green}      ✓ Fallback models tests passed${colors.reset}`);
    } else {
      console.log(`${colors.red}      ✗ Fallback models tests failed${colors.reset}`);
    }
  }

  // Step 3: Fallback config roundtrip tests
  if (!jsonOutput) {
    console.log(`${colors.cyan}[3/4] Fallback config roundtrip tests...${colors.reset}`);
  }

  const fallbackRoundtripResult = runFallbackRoundtripTest();

  if (!jsonOutput) {
    if (fallbackRoundtripResult.exitCode === 0) {
      console.log(`${colors.green}      ✓ Fallback roundtrip tests passed${colors.reset}`);
    } else {
      console.log(`${colors.red}      ✗ Fallback roundtrip tests failed${colors.reset}`);
    }
  }

  // Step 4: Release metadata consistency
  if (!jsonOutput) {
    console.log(`${colors.cyan}[4/4] Release metadata consistency...${colors.reset}`);
  }

  const rootDir = path.resolve(__dirname, '..');
  const metadataResult = runReleaseMetadataCheck(rootDir);

  if (!jsonOutput) {
    if (metadataResult.passed) {
      console.log(`${colors.green}      ✓ Release metadata consistent${colors.reset}`);
    } else {
      console.log(`${colors.red}      ✗ Release metadata issues: ${metadataResult.actionRequired.length}${colors.reset}`);
    }
  }

  // Build unified report
  const report = buildReport(healthResult, fallbackModelsResult, fallbackRoundtripResult, metadataResult);

  // JSON output
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));

    if (!report.ready) {
      if (healthResult.exitCode === 3) {
        process.exit(3);
      } else if (healthResult.exitCode !== 0) {
        process.exit(1);
      } else if (fallbackModelsResult.exitCode !== 0) {
        process.exit(2);
      } else if (fallbackRoundtripResult.exitCode !== 0) {
        process.exit(2);
      } else if (!metadataResult.passed) {
        process.exit(5);
      } else {
        process.exit(4);
      }
    }
    process.exit(0);
  }

  // Human-readable summary
  console.log('');
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}Release Readiness Summary${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log('');

  // Show detailed results
  console.log(`Checks: ${report.summary.passedChecks}/${report.summary.totalChecks} passed`);
  console.log('');

  // Upstream details
  if (report.checks.upstream.passed) {
    console.log(`  ${colors.green}✓${colors.reset} Upstream Health`);
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Upstream Health`);
    if (report.checks.upstream.actionRequired.length > 0) {
      for (const action of report.checks.upstream.actionRequired) {
        console.log(`      ${colors.yellow}•${colors.reset} ${action}`);
      }
    }
    if (report.checks.upstream.error) {
      console.log(`      ${colors.gray}Error: ${report.checks.upstream.error}${colors.reset}`);
    }
  }

  // Fallback models details
  if (report.checks.fallbackModels.passed) {
    console.log(`  ${colors.green}✓${colors.reset} Fallback Models Tests`);
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Fallback Models Tests`);
    if (report.checks.fallbackModels.error) {
      console.log(`      ${colors.gray}Error: ${report.checks.fallbackModels.error}${colors.reset}`);
    }
  }

  // Fallback roundtrip details
  if (report.checks.fallbackRoundtrip.passed) {
    console.log(`  ${colors.green}✓${colors.reset} Fallback Roundtrip Tests`);
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Fallback Roundtrip Tests`);
    if (report.checks.fallbackRoundtrip.error) {
      console.log(`      ${colors.gray}Error: ${report.checks.fallbackRoundtrip.error}${colors.reset}`);
    }
  }

  // Release metadata details
  if (report.checks.releaseMetadata.passed) {
    console.log(`  ${colors.green}✓${colors.reset} Release Metadata`);
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Release Metadata`);
    if (report.checks.releaseMetadata.actionRequired.length > 0) {
      for (const action of report.checks.releaseMetadata.actionRequired) {
        console.log(`      ${colors.yellow}•${colors.reset} ${action}`);
      }
    }
  }

  console.log('');

  // Final verdict
  if (report.ready) {
    console.log(`${colors.bold}${colors.green}✅ RELEASE READY${colors.reset}`);
    console.log(`${colors.gray}All checks passed. Safe to release.${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.bold}${colors.red}❌ NOT RELEASE READY${colors.reset}`);
    console.log(`${colors.gray}Fix the issues above before releasing.${colors.reset}`);
    console.log('');

    // Helpful guidance
    if (!report.checks.upstream.passed) {
      console.log(`${colors.cyan}To fix upstream issues:${colors.reset}`);
      console.log(`  1. Run: node scripts/drift-check.js --refresh`);
      console.log(`  2. Review any drift and update lib/core/model-requirements.js`);
      console.log(`  3. Pin the SHA: node scripts/drift-check.js --pin`);
    }

    if (!report.checks.fallbackModels.passed || !report.checks.fallbackRoundtrip.passed) {
      console.log(`${colors.cyan}To fix test failures:${colors.reset}`);
      console.log(`  1. Run: node tests/fallback-models-test.js (for details)`);
      console.log(`  2. Run: node tests/fallback-config-roundtrip-test.js (for details)`);
      console.log(`  3. Review lib/core/fallback-models.js and lib/config-manager.js`);
    }

    if (!report.checks.releaseMetadata.passed) {
      console.log(`${colors.cyan}To fix release metadata:${colors.reset}`);
      console.log(`  1. Restore .omo-upstream-sha: node scripts/drift-check.js --pin`);
      console.log(`  2. Align VERSION with package.json / package-lock.json`);
      console.log(`  3. Add .omo/ to .gitignore`);
      console.log(`  4. Add version entry to CHANGELOG.md or populate [Unreleased]`);
    }

    // Determine exit code
    if (healthResult.exitCode === 3) {
      process.exit(3); // Upstream unresolved
    } else if (healthResult.exitCode !== 0) {
      process.exit(1); // Upstream health issues
    } else if (!report.checks.fallbackModels.passed || !report.checks.fallbackRoundtrip.passed) {
      process.exit(2); // Test failures
    } else if (!report.checks.releaseMetadata.passed) {
      process.exit(5); // Metadata inconsistencies
    } else {
      process.exit(4); // Unknown error
    }
  }
}

// Export for require() consumers; CLI guard below
module.exports = { runReleaseMetadataCheck };

// Run main only when executed directly (not require()'d)
if (require.main === module) {
  main().catch(e => {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');

    const report = {
      timestamp: new Date().toISOString(),
      ready: false,
      error: e.message,
      checks: null,
      summary: {
        totalChecks: 4,
        passedChecks: 0,
        failedChecks: 4
      }
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(`${colors.red}❌ Unexpected error: ${e.message}${colors.reset}`);
    }
    process.exit(4);
  });
}
