#!/usr/bin/env node
/**
 * Deterministic Test for drift-check --strict-upstream behavior
 * 
 * Tests:
 * 1. Happy path: resolvable upstream with strict mode (exit 0)
 * 2. Failure path: unresolvable upstream in strict mode (exit 3 + status fields)
 * 3. Non-strict mode: unresolvable upstream should still exit 0 (backward compat)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'drift-check.js');
const LOCAL_FILE = path.join(__dirname, '..', 'lib', 'core', 'model-requirements.js');
const MOCK_FILE = path.join(__dirname, 'fixtures', 'mock-https-failure.js');
const TEST_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';

function createIsolatedHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-strict-test-'));
  const cacheDir = path.join(tmpDir, '.config', 'opencode', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  return tmpDir;
}

function createCachedSnapshot(cacheDir, sha) {
  const cacheFile = path.join(cacheDir, 'upstream-snapshot.json');
  const snapshot = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceRef: {
      repo: 'code-yeongyu/oh-my-openagent',
      branch: 'dev',
      commitSha: sha
    },
    agents: {
      'test-agent': {
        fallbackChain: [{ provider: 'openai', model: 'gpt-4' }],
        gating: {}
      }
    },
    categories: {}
  };
  fs.writeFileSync(cacheFile, JSON.stringify(snapshot, null, 2));
  return cacheFile;
}

function createTestLocalRequirements() {
  const backupFile = LOCAL_FILE + '.drift-strict-test-backup';
  if (fs.existsSync(LOCAL_FILE)) {
    fs.copyFileSync(LOCAL_FILE, backupFile);
  }
  return backupFile;
}

function restoreLocalRequirements(backupFile) {
  if (backupFile && fs.existsSync(backupFile)) {
    fs.copyFileSync(backupFile, LOCAL_FILE);
    fs.unlinkSync(backupFile);
  }
}

function runDriftCheck(args = [], env = {}) {
  const fullEnv = {
    ...process.env,
    ...env
  };
  
  try {
    const output = execSync(`node "${SCRIPT}" ${args.join(' ')}`, {
      encoding: 'utf8',
      env: fullEnv,
      timeout: 30000,
      cwd: path.join(__dirname, '..')
    });
    return { success: true, output: output.trim(), status: 0 };
  } catch (e) {
    return { 
      success: false, 
      output: e.stdout?.trim() || '',
      stderr: e.stderr?.trim() || '',
      status: e.status 
    };
  }
}

function runDriftCheckWithMock(args = [], env = {}) {
  const fullEnv = {
    ...process.env,
    ...env,
    NODE_OPTIONS: `--require "${MOCK_FILE}"`
  };
  return runDriftCheck(args, fullEnv);
}

// Test 1: Happy path - resolvable upstream with strict mode (exit 0)
function testStrictModeHappyPath() {
  console.log('Test 1: Strict mode with resolvable upstream (should exit 0)');
  
  const tmpHome = createIsolatedHome();
  const cacheDir = path.join(tmpHome, '.config', 'opencode', 'cache');
  const backupFile = createTestLocalRequirements();
  
  try {
    createCachedSnapshot(cacheDir, TEST_SHA);
    
    const result = runDriftCheckWithMock(
      ['--json', '--strict-upstream'],
      { HOME: tmpHome }
    );
    
    const parsed = JSON.parse(result.output || '{}');
    
    if (result.status === 0) {
      console.log('  ✓ Exit code is 0');
    } else {
      console.log(`  ✗ Expected exit code 0, got ${result.status}`);
      console.log(`    Output: ${result.output}`);
      return false;
    }
    
    if (parsed.upstreamResolved === true) {
      console.log('  ✓ upstreamResolved is true');
    } else {
      console.log(`  ✗ Expected upstreamResolved: true, got ${parsed.upstreamResolved}`);
      return false;
    }
    
    if (parsed.unresolvedReason === null) {
      console.log('  ✓ unresolvedReason is null');
    } else {
      console.log(`  ✗ Expected unresolvedReason: null, got ${parsed.unresolvedReason}`);
      return false;
    }
    
    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    restoreLocalRequirements(backupFile);
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

// Test 2: Failure path - unresolvable upstream in strict mode (exit 3)
function testStrictModeFailurePath() {
  console.log('Test 2: Strict mode with unresolvable upstream (should exit 3)');
  
  const tmpHome = createIsolatedHome();
  const backupFile = createTestLocalRequirements();
  
  try {
    // No cache, API will fail due to mock - upstream unresolvable
    const result = runDriftCheckWithMock(
      ['--json', '--strict-upstream'],
      { HOME: tmpHome }
    );
    
    if (result.status === 3) {
      console.log('  ✓ Exit code is 3');
    } else {
      console.log(`  ✗ Expected exit code 3, got ${result.status}`);
      console.log(`    Output: ${result.output}`);
      return false;
    }
    
    const parsed = JSON.parse(result.output || '{}');
    
    if (parsed.upstreamResolved === false) {
      console.log('  ✓ upstreamResolved is false');
    } else {
      console.log(`  ✗ Expected upstreamResolved: false, got ${parsed.upstreamResolved}`);
      return false;
    }
    
    if (parsed.unresolvedReason && parsed.unresolvedReason.includes('Network unavailable')) {
      console.log('  ✓ unresolvedReason contains actionable message');
      console.log(`    Reason: ${parsed.unresolvedReason}`);
    } else {
      console.log(`  ✗ Expected unresolvedReason with 'Network unavailable', got: ${parsed.unresolvedReason}`);
      return false;
    }
    
    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    restoreLocalRequirements(backupFile);
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

// Test 3: Non-strict mode - unresolvable upstream should exit 0 (backward compat)
function testNonStrictModeBackwardCompat() {
  console.log('Test 3: Non-strict mode with unresolvable upstream (backward compat, exit 0)');
  
  const tmpHome = createIsolatedHome();
  const backupFile = createTestLocalRequirements();
  
  try {
    // No cache, API will fail - but non-strict should exit 0
    const result = runDriftCheckWithMock(
      ['--json'],
      { HOME: tmpHome }
    );
    
    if (result.status === 0) {
      console.log('  ✓ Exit code is 0 (graceful fallback)');
    } else {
      console.log(`  ✗ Expected exit code 0, got ${result.status}`);
      console.log(`    Output: ${result.output}`);
      return false;
    }
    
    const parsed = JSON.parse(result.output || '{}');
    
    // Should still report upstream not resolved
    if (parsed.upstreamResolved === false) {
      console.log('  ✓ upstreamResolved is false');
    } else {
      console.log(`  ✗ Expected upstreamResolved: false, got ${parsed.upstreamResolved}`);
      return false;
    }
    
    // Should have unresolved reason
    if (parsed.unresolvedReason) {
      console.log('  ✓ unresolvedReason present');
    } else {
      console.log(`  ✗ Expected unresolvedReason to be present`);
      return false;
    }
    
    // Should NOT have error in output for backward compat
    if (!parsed.error) {
      console.log('  ✓ No error field (backward compat)');
    } else {
      console.log(`  ✗ Unexpected error field: ${parsed.error}`);
      return false;
    }
    
    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    restoreLocalRequirements(backupFile);
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

// Test 4: Strict mode with network error in human-readable output
function testStrictModeHumanReadable() {
  console.log('Test 4: Strict mode with human-readable output (should exit 3)');
  
  const tmpHome = createIsolatedHome();
  const backupFile = createTestLocalRequirements();
  
  try {
    const result = runDriftCheckWithMock(
      ['--strict-upstream'],
      { HOME: tmpHome }
    );
    
    if (result.status === 3) {
      console.log('  ✓ Exit code is 3');
    } else {
      console.log(`  ✗ Expected exit code 3, got ${result.status}`);
      return false;
    }
    
    // Check stderr for actionable message
    const combined = (result.stderr || '') + (result.output || '');
    if (combined.includes('STRICT') && combined.includes('Upstream SHA could not be resolved')) {
      console.log('  ✓ Human-readable error contains [STRICT] marker');
    } else {
      console.log(`  ✗ Expected [STRICT] marker in output`);
      console.log(`    Output: ${combined}`);
      return false;
    }
    
    if (combined.includes('--strict-upstream')) {
      console.log('  ✓ Suggests running without --strict-upstream');
    } else {
      console.log(`  ✗ Missing suggestion to run without --strict-upstream`);
      return false;
    }
    
    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    restoreLocalRequirements(backupFile);
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

// Main
console.log('========================================');
console.log('Drift Strict Upstream Tests (Deterministic)');
console.log('========================================\n');

if (!fs.existsSync(MOCK_FILE)) {
  console.error(`✗ Mock file not found: ${MOCK_FILE}`);
  process.exit(1);
}

if (!fs.existsSync(LOCAL_FILE)) {
  console.error(`✗ Local requirements file not found: ${LOCAL_FILE}`);
  process.exit(1);
}

const results = [
  testStrictModeHappyPath(),
  testStrictModeFailurePath(),
  testNonStrictModeBackwardCompat(),
  testStrictModeHumanReadable()
];

console.log('\n========================================');
const passed = results.filter(r => r).length;
const total = results.length;
console.log(`Results: ${passed}/${total} tests passed`);
console.log('========================================');

process.exit(passed === total ? 0 : 1);
