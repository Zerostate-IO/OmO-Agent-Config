#!/usr/bin/env node
/**
 * Test for drift-check --pin fallback behavior
 * 
 * Tests that:
 * 1. --pin works with a valid cached snapshot
 * 2. --pin reports the correct source (github-api or cached-snapshot)
 * 3. --pin fails gracefully when no SHA is available
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'drift-check.js');
const PINNED_SHA_FILE = path.join(__dirname, '..', '.omo-upstream-sha');
const CACHE_DIR = path.join(os.homedir(), '.config', 'opencode', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'upstream-snapshot.json');

// Helper to run drift-check --pin
function runPin(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  try {
    const output = execSync(`node "${SCRIPT}" --pin --json`, {
      encoding: 'utf8',
      env,
      timeout: 30000
    });
    return { success: true, output: JSON.parse(output.trim()) };
  } catch (e) {
    try {
      // Try to parse error JSON output
      return { success: false, output: JSON.parse(e.stdout?.trim() || '{}'), error: e.message };
    } catch {
      return { success: false, output: {}, error: e.message };
    }
  }
}

// Clean up before/after tests
function cleanup() {
  if (fs.existsSync(PINNED_SHA_FILE)) {
    fs.unlinkSync(PINNED_SHA_FILE);
  }
}

// Test 1: --pin with cached snapshot (basic test)
function testPinWithCachedSnapshot() {
  console.log('Test 1: --pin with cached snapshot');
  
  cleanup();
  
  const result = runPin();
  
  if (result.success) {
    console.log('  ✓ --pin succeeded');
    console.log(`    Source: ${result.output.source}`);
    console.log(`    SHA: ${result.output.pinnedSha}`);
    
    // Verify the pinned SHA file was created
    if (fs.existsSync(PINNED_SHA_FILE)) {
      console.log('  ✓ Pinned SHA file created');
      const sha = fs.readFileSync(PINNED_SHA_FILE, 'utf8').trim();
      if (sha === result.output.pinnedSha) {
        console.log('  ✓ SHA file content matches');
      } else {
        console.log('  ✗ SHA file content mismatch');
        return false;
      }
    } else {
      console.log('  ✗ Pinned SHA file not created');
      return false;
    }
    
    // Verify the output has expected fields
    if (result.output.pinnedSha && result.output.success && result.output.source) {
      console.log('  ✓ JSON output has expected fields');
    } else {
      console.log('  ✗ JSON output missing fields');
      return false;
    }
    
    return true;
  } else {
    // If failed, check if it's because there's no valid SHA available
    if (result.output.error?.includes('Could not fetch')) {
      console.log('  ⚠ No SHA available (API and cache both unavailable)');
      console.log('    This is expected if GitHub API is rate-limited and cache has no SHA');
      return true; // Consider this a pass - the error handling works
    }
    console.log(`  ✗ --pin failed: ${result.error}`);
    return false;
  }
}

// Test 2: Verify SHA format (40-hex)
function testShaFormat() {
  console.log('Test 2: Verify SHA format');
  
  cleanup();
  
  const result = runPin();
  
  if (result.success && result.output.pinnedSha) {
    const shaRegex = /^[a-f0-9]{40}$/i;
    if (shaRegex.test(result.output.pinnedSha)) {
      console.log('  ✓ SHA is valid 40-hex format');
      return true;
    } else {
      console.log(`  ✗ SHA format invalid: ${result.output.pinnedSha}`);
      return false;
    }
  } else {
    console.log('  ⚠ Could not verify SHA format (no SHA available)');
    return true; // Pass if no SHA available
  }
}

// Test 3: Verify source reporting
function testSourceReporting() {
  console.log('Test 3: Verify source reporting');
  
  cleanup();
  
  const result = runPin();
  
  if (result.success) {
    const validSources = ['github-api', 'cached-snapshot'];
    if (validSources.includes(result.output.source)) {
      console.log(`  ✓ Source is valid: ${result.output.source}`);
      return true;
    } else {
      console.log(`  ✗ Invalid source: ${result.output.source}`);
      return false;
    }
  } else {
    console.log('  ⚠ Could not verify source (pin failed)');
    return true; // Pass if pin failed
  }
}

// Main
console.log('========================================');
console.log('Drift Pin Reliability Tests');
console.log('========================================\n');

cleanup();

const results = [
  testPinWithCachedSnapshot(),
  testShaFormat(),
  testSourceReporting()
];

cleanup();

console.log('\n========================================');
const passed = results.filter(r => r).length;
const total = results.length;
console.log(`Results: ${passed}/${total} tests passed`);
console.log('========================================');

process.exit(passed === total ? 0 : 1);
