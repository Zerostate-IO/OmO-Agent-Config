#!/usr/bin/env node
/**
 * Deterministic Test for drift-check --pin fallback behavior
 * 
 * Uses isolated HOME + NODE_OPTIONS monkey patch to force HTTPS failure.
 * Tests:
 * 1. --pin succeeds with cached snapshot fallback when API fails
 * 2. --pin fails gracefully (exit 2) when no cache and API fails
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'drift-check.js');
const PINNED_SHA_FILE = path.join(__dirname, '..', '.omo-upstream-sha');
const MOCK_FILE = path.join(__dirname, 'fixtures', 'mock-https-failure.js');
const TEST_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd'; // Valid 40-hex SHA

// Create temporary directory with isolated cache
function createIsolatedHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-pin-test-'));
  const cacheDir = path.join(tmpDir, '.config', 'opencode', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  return tmpDir;
}

// Create a valid cached snapshot
function createCachedSnapshot(cacheDir, sha) {
  const cacheFile = path.join(cacheDir, 'upstream-snapshot.json');
  const snapshot = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceRef: {
      repo: 'code-yeongyu/oh-my-opencode',
      branch: 'dev',
      commitSha: sha
    },
    agents: {},
    categories: {}
  };
  fs.writeFileSync(cacheFile, JSON.stringify(snapshot, null, 2));
  return cacheFile;
}

// Clean up pinned SHA file
function cleanupPinnedSha() {
  if (fs.existsSync(PINNED_SHA_FILE)) {
    fs.unlinkSync(PINNED_SHA_FILE);
  }
}

// Run drift-check --pin with isolated environment
function runPin(env = {}) {
  const fullEnv = {
    ...process.env,
    ...env,
    // Force HTTPS failure via monkey patch
    NODE_OPTIONS: `--require "${MOCK_FILE}"`
  };
  
  try {
    const output = execSync(`node "${SCRIPT}" --pin --json`, {
      encoding: 'utf8',
      env: fullEnv,
      timeout: 30000
    });
    return { success: true, output: JSON.parse(output.trim()) };
  } catch (e) {
    try {
      // Try to parse error JSON output
      return { 
        success: false, 
        output: JSON.parse(e.stdout?.trim() || '{}'), 
        error: e.message,
        status: e.status 
      };
    } catch {
      return { success: false, output: {}, error: e.message, status: e.status };
    }
  }
}

// Test 1: --pin succeeds with cached snapshot fallback when API fails
function testPinWithCachedSnapshot() {
  console.log('Test 1: --pin with cached snapshot fallback (API forced to fail)');
  
  cleanupPinnedSha();
  const tmpHome = createIsolatedHome();
  const cacheDir = path.join(tmpHome, '.config', 'opencode', 'cache');
  
  try {
    // Seed a valid cached snapshot
    createCachedSnapshot(cacheDir, TEST_SHA);
    
    // Run with isolated HOME (API will fail due to NODE_OPTIONS mock)
    const result = runPin({ HOME: tmpHome });
    
    if (result.success) {
      console.log('  ✓ --pin succeeded');
      console.log(`    Source: ${result.output.source}`);
      console.log(`    SHA: ${result.output.pinnedSha}`);
      
      // Verify source is cached-snapshot
      if (result.output.source === 'cached-snapshot') {
        console.log('  ✓ Source is cached-snapshot (fallback worked)');
      } else {
        console.log(`  ✗ Expected source 'cached-snapshot', got '${result.output.source}'`);
        return false;
      }
      
      // Verify the SHA matches
      if (result.output.pinnedSha === TEST_SHA) {
        console.log('  ✓ SHA matches cached value');
      } else {
        console.log(`  ✗ SHA mismatch: expected ${TEST_SHA}, got ${result.output.pinnedSha}`);
        return false;
      }
      
      // Verify the pinned SHA file was created
      if (fs.existsSync(PINNED_SHA_FILE)) {
        console.log('  ✓ Pinned SHA file created');
        const sha = fs.readFileSync(PINNED_SHA_FILE, 'utf8').trim();
        if (sha === TEST_SHA) {
          console.log('  ✓ SHA file content matches');
        } else {
          console.log('  ✗ SHA file content mismatch');
          return false;
        }
      } else {
        console.log('  ✗ Pinned SHA file not created');
        return false;
      }
      
      return true;
    } else {
      console.log(`  ✗ --pin failed: ${result.error}`);
      console.log(`    Output: ${JSON.stringify(result.output)}`);
      return false;
    }
  } finally {
    // Cleanup
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
    cleanupPinnedSha();
  }
}

// Test 2: --pin fails gracefully when no cache and API fails
function testPinFailsWithoutCache() {
  console.log('Test 2: --pin fails without cache (API forced to fail)');
  
  cleanupPinnedSha();
  const tmpHome = createIsolatedHome();
  
  try {
    // Run with isolated HOME but no cache (API will fail due to mock)
    const result = runPin({ HOME: tmpHome });
    
    if (!result.success) {
      console.log('  ✓ --pin failed as expected');
      console.log(`    Exit status: ${result.status}`);
      
      // Verify exit code is 2
      if (result.status === 2) {
        console.log('  ✓ Exit code is 2');
      } else {
        console.log(`  ✗ Expected exit code 2, got ${result.status}`);
        return false;
      }
      
      // Verify error message
      if (result.output.error) {
        console.log(`  ✓ Error message: ${result.output.error}`);
      } else {
        console.log('  ✗ No error message in output');
        return false;
      }
      
      // Verify pinned SHA file was NOT created
      if (!fs.existsSync(PINNED_SHA_FILE)) {
        console.log('  ✓ Pinned SHA file not created');
      } else {
        console.log('  ✗ Pinned SHA file should not exist');
        return false;
      }
      
      return true;
    } else {
      console.log('  ✗ --pin should have failed');
      console.log(`    Output: ${JSON.stringify(result.output)}`);
      return false;
    }
  } finally {
    // Cleanup
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
    cleanupPinnedSha();
  }
}

// Test 3: --pin fails with invalid SHA in cache
function testPinFailsWithInvalidCachedSha() {
  console.log('Test 3: --pin fails with invalid SHA in cache');
  
  cleanupPinnedSha();
  const tmpHome = createIsolatedHome();
  const cacheDir = path.join(tmpHome, '.config', 'opencode', 'cache');
  
  try {
    // Seed an invalid cached snapshot (SHA not 40-hex)
    createCachedSnapshot(cacheDir, 'invalid-sha');
    
    const result = runPin({ HOME: tmpHome });
    
    if (!result.success) {
      console.log('  ✓ --pin failed as expected with invalid SHA');
      console.log(`    Exit status: ${result.status}`);
      
      // Verify exit code is 2
      if (result.status === 2) {
        console.log('  ✓ Exit code is 2');
      } else {
        console.log(`  ✗ Expected exit code 2, got ${result.status}`);
        return false;
      }
      
      return true;
    } else {
      console.log('  ✗ --pin should have failed with invalid SHA');
      return false;
    }
  } finally {
    // Cleanup
    try { fs.rmSync(tmpHome, { recursive: true }); } catch (e) { /* ignore */ }
    cleanupPinnedSha();
  }
}

// Main
console.log('========================================');
console.log('Drift Pin Reliability Tests (Deterministic)');
console.log('========================================\n');

// Verify mock file exists
if (!fs.existsSync(MOCK_FILE)) {
  console.error(`✗ Mock file not found: ${MOCK_FILE}`);
  process.exit(1);
}

cleanupPinnedSha();

const results = [
  testPinWithCachedSnapshot(),
  testPinFailsWithoutCache(),
  testPinFailsWithInvalidCachedSha()
];

cleanupPinnedSha();

console.log('\n========================================');
const passed = results.filter(r => r).length;
const total = results.length;
console.log(`Results: ${passed}/${total} tests passed`);
console.log('========================================');

process.exit(passed === total ? 0 : 1);
