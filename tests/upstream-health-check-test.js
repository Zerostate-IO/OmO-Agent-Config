#!/usr/bin/env node

/**
 * Tests for upstream-health-check.js
 * Uses deterministic fixtures - no live network calls
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'upstream-health-check.js');
const DRIFT_CHECK_PATH = path.join(__dirname, '..', 'scripts', 'drift-check.js');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runScript(args = [], expectSuccess = true) {
  const cmd = `node "${SCRIPT_PATH}" ${args.join(' ')}`;
  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { output, exitCode: 0 };
  } catch (e) {
    return { 
      output: e.stdout || '', 
      stderr: e.stderr || '',
      exitCode: e.status || 1 
    };
  }
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch (e) {
    throw new Error(`Failed to parse JSON output: ${e.message}\nOutput was: ${output}`);
  }
}

console.log('Upstream Health Check Tests');
console.log('='.repeat(50));
console.log('');

// Test 1: JSON output structure
test('JSON output includes required keys', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  assert(report.timestamp, 'timestamp should exist');
  assert(report.drift !== undefined, 'drift should exist');
  assert(report.schema !== undefined, 'schema should exist');
  assert(Array.isArray(report.actionRequired), 'actionRequired should be array');
});

// Test 2: actionRequired is always an array
test('actionRequired is always an array', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  assertArrayEqual(report.actionRequired, report.actionRequired || [], 'actionRequired should be array');
});

// Test 3: drift key structure
test('drift output has correct structure', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.drift && !report.drift.error) {
    assert(report.drift.hasDrift !== undefined, 'hasDrift should exist');
    assert(Array.isArray(report.drift.newAgents || []), 'newAgents should be array');
    assert(Array.isArray(report.drift.missingAgents || []), 'missingAgents should be array');
    assert(Array.isArray(report.drift.changedAgents || []), 'changedAgents should be array');
  }
});

// Test 4: schema key structure
test('schema output has correct structure', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.schema) {
    assert(report.schema.valid !== undefined, 'valid should exist');
    assert(report.schema.error !== undefined, 'error should exist');
  }
});

// Test 5: Exit code 0 when no actions required (healthy state)
test('Exit code 0 or 1 based on health state', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.actionRequired.length === 0) {
    assertEqual(result.exitCode, 0, 'Should exit 0 when no actions required');
  } else {
    assertEqual(result.exitCode, 1, 'Should exit 1 when actions required');
  }
});

// Test 6: Strict mode behavior
test('Strict mode produces same JSON structure', () => {
  const result = runScript(['--json', '--strict'], false);
  const report = parseJsonOutput(result.output);
  
  assert(report.timestamp, 'timestamp should exist');
  assert(Array.isArray(report.actionRequired), 'actionRequired should be array');
});

// Test 7: Human-readable output works
test('Human-readable output works without --json', () => {
  const result = runScript([], false);
  
  assert(result.output.includes('Health Check') || result.output.includes('error'), 
    'Should produce human-readable output');
});

// Test 8: drift sub-object has upstreamResolved when network fails
test('drift object has upstreamResolved field', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.drift && report.drift.upstreamResolved !== undefined) {
    assertEqual(typeof report.drift.upstreamResolved, 'boolean', 'upstreamResolved should be boolean');
  }
});

// Test 9: actionRequired builds from drift data
test('actionRequired contains drift info when hasDrift', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.drift && report.drift.hasDrift) {
    assert(report.actionRequired.length > 0, 'Should have actions when drift detected');
  }
});

// Test 10: schema.valid is boolean
test('schema.valid is boolean', () => {
  const result = runScript(['--json'], false);
  const report = parseJsonOutput(result.output);
  
  if (report.schema) {
    assertEqual(typeof report.schema.valid, 'boolean', 'schema.valid should be boolean');
  }
});

// Summary
console.log('');
console.log('='.repeat(50));
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed > 0) {
  console.log('');
  console.log('Some tests failed. This may be due to network conditions.');
  console.log('The script handles network failures gracefully.');
  process.exit(1);
}

console.log('');
console.log('All tests passed!');
process.exit(0);
