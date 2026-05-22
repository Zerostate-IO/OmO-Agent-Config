#!/usr/bin/env node

/**
 * Deterministic tests for release-readiness metadata validation.
 *
 * Validates runReleaseMetadataCheck(rootDir) from scripts/release-readiness-check.js
 * against fixture directories.
 *
 * Covers:
 *   1. Healthy metadata passes when all files are consistent
 *   2. Missing .omo-upstream-sha fails
 *   3. .omo-upstream-sha mismatch with @upstream-sha fails
 *   4. VERSION mismatch with package.json fails
 *   5. VERSION mismatch with package-lock.json fails
 *   6. Missing .omo/ entry in .gitignore fails
 *   7. Missing CHANGELOG version entry fails
 *
 * Uses temp fixture directories under os.tmpdir(). Node built-ins only.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { runReleaseMetadataCheck } = require('../scripts/release-readiness-check');

let testsPassed = 0;
let testsFailed = 0;
const cleanupQueue = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    testsPassed++;
  } catch (e) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${e.message}`);
    testsFailed++;
  }
}

function createTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'rrc-test-'));
  cleanupQueue.push(dir);
  return dir;
}

function cleanup() {
  for (const dir of cleanupQueue) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

const GOOD_SHA = 'abc123def4567890abcdef1234567890abcdef12';
const GOOD_VERSION = '1.2.3';

function writeHealthyFixture(dir) {
  fs.writeFileSync(path.join(dir, '.omo-upstream-sha'), GOOD_SHA + '\n');

  const reqDir = path.join(dir, 'lib', 'core');
  fs.mkdirSync(reqDir, { recursive: true });
  fs.writeFileSync(path.join(reqDir, 'model-requirements.js'),
    '/**\n * @upstream-sha ' + GOOD_SHA + '\n */\n');

  fs.writeFileSync(path.join(dir, 'VERSION'), GOOD_VERSION + '\n');

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'omo-agent-config',
    version: GOOD_VERSION
  }, null, 2));

  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({
    name: 'omo-agent-config',
    version: GOOD_VERSION,
    lockfileVersion: 3,
    packages: { '': { version: GOOD_VERSION } }
  }, null, 2));

  fs.writeFileSync(path.join(dir, '.gitignore'),
    'node_modules/\n.omo/\n.sisyphus/\n');

  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'),
    '# Changelog\n\n## [' + GOOD_VERSION + '] - 2026-01-15\n\n### Added\n- Something\n');
}

console.log('Release Readiness Metadata Check Tests');
console.log('='.repeat(50));
console.log('');

test('healthy fixture: all metadata consistent', () => {
  const dir = createTempDir('rrc-healthy-');
  writeHealthyFixture(dir);

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, true, `Expected passed=true, got: ${JSON.stringify(result.actionRequired)}`);
  assert.strictEqual(result.actionRequired.length, 0);
  assert.strictEqual(result.details.shaFile, GOOD_SHA);
  assert.strictEqual(result.details.version, GOOD_VERSION);
  assert.strictEqual(result.details.packageVersion, GOOD_VERSION);
  assert.strictEqual(result.details.lockVersion, GOOD_VERSION);
  assert.strictEqual(result.details.lockPackagesVersion, GOOD_VERSION);
  assert.strictEqual(result.details.gitignoreHasOmo, true);
  assert.strictEqual(result.details.changelogOk, true);
});

test('missing .omo-upstream-sha fails', () => {
  const dir = createTempDir('rrc-nosha-');
  writeHealthyFixture(dir);
  fs.unlinkSync(path.join(dir, '.omo-upstream-sha'));

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('.omo-upstream-sha missing')),
    'Should report missing .omo-upstream-sha');
});

test('.omo-upstream-sha mismatch with @upstream-sha fails', () => {
  const dir = createTempDir('rrc-shamismatch-');
  writeHealthyFixture(dir);

  const WRONG_SHA = '0000000000000000000000000000000000000000';
  fs.writeFileSync(path.join(dir, '.omo-upstream-sha'), WRONG_SHA + '\n');

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('does not match @upstream-sha')),
    'Should report SHA mismatch');
});

test('VERSION mismatch with package.json fails', () => {
  const dir = createTempDir('rrc-pkgmismatch-');
  writeHealthyFixture(dir);

  fs.writeFileSync(path.join(dir, 'VERSION'), '9.9.9\n');

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('VERSION') && a.includes('package.json')),
    'Should report VERSION vs package.json mismatch');
});

test('VERSION mismatch with package-lock.json fails', () => {
  const dir = createTempDir('rrc-lockmismatch-');
  writeHealthyFixture(dir);

  const lockPath = path.join(dir, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = '0.0.0';
  lock.packages[''].version = '0.0.0';
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('VERSION') && a.includes('package-lock.json')),
    'Should report VERSION vs package-lock.json mismatch');
});

test('missing .omo/ in .gitignore fails', () => {
  const dir = createTempDir('rrc-gitignore-');
  writeHealthyFixture(dir);

  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.sisyphus/\n');

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('.gitignore') && a.includes('.omo/')),
    'Should report missing .omo/ in .gitignore');
});

test('missing CHANGELOG version entry detected', () => {
  const dir = createTempDir('rrc-changelogmiss-');
  writeHealthyFixture(dir);

  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'),
    '# Changelog\n\n## [0.0.1] - 2020-01-01\n\n### Added\n- Init\n');

  const result = runReleaseMetadataCheck(dir);
  assert.strictEqual(result.passed, false);
  assert(result.actionRequired.some(a => a.includes('CHANGELOG')),
    'Should report missing CHANGELOG version entry');
});

console.log('');
console.log('='.repeat(50));
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);

cleanup();

if (testsFailed > 0) {
  process.exit(1);
}

console.log('');
console.log('All tests passed!');
process.exit(0);
