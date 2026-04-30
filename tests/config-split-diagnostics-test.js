#!/usr/bin/env node

/**
 * Unit tests for config-split diagnostics.
 * Uses isolated HOME fixtures — never touches real ~/.config/opencode.
 * Includes checksum assertions proving diagnostics are read-only.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Isolate HOME before requiring any project modules
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'config-split-diag-test-'));
const tmpConfigDir = path.join(tmpHome, '.config', 'opencode');
fs.mkdirSync(tmpConfigDir, { recursive: true });
process.env.HOME = tmpHome;

// Clear module cache for fresh load with isolated HOME
delete require.cache[require.resolve('../lib/constants')];
delete require.cache[require.resolve('../lib/upstream-constants')];
delete require.cache[require.resolve('../lib/core/provider-diagnostics')];

const {
  buildConfigSplitDiagnostics
} = require('../lib/core/provider-diagnostics');

// Helpers
function writePrimaryConfig(content) {
  const p = path.join(tmpConfigDir, 'oh-my-opencode.jsonc');
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return p;
}

function writeSiblingConfig(content) {
  const p = path.join(tmpConfigDir, 'oh-my-openagent.jsonc');
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return p;
}

function writeOpenCodeConfig(content) {
  const p = path.join(tmpConfigDir, 'opencode.json');
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return p;
}

function clearAll() {
  const files = ['oh-my-opencode.jsonc', 'oh-my-openagent.jsonc', 'opencode.json'];
  for (const f of files) {
    const p = path.join(tmpConfigDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function fileChecksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileMtime(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtimeMs;
}

// Tests

function testNoConfigFiles() {
  console.log('  test: no config files at all');
  clearAll();

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.files.state, 'none', 'state should be none');
  assert.strictEqual(result.files.primary.exists, false, 'primary should not exist');
  assert.strictEqual(result.files.sibling.exists, false, 'sibling should not exist');
  assert.strictEqual(result.readOnly, true, 'readOnly should be true');
  assert.ok(result.warnings.some(w => w.code === 'NO_CONFIG_FOUND'), 'should warn about no config');
  assert.strictEqual(result.schema.schemaUrl, null, 'schemaUrl should be null');
  assert.strictEqual(result.schema.isStale, false, 'isStale should be false');

  console.log('    ✓ no config files handled correctly');
}

function testPrimaryOnly() {
  console.log('  test: primary file only (expected normal state)');
  clearAll();

  writePrimaryConfig({ agents: { oracle: { model: 'openai/gpt-5.5' } } });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.files.state, 'primary-only', 'state should be primary-only');
  assert.strictEqual(result.files.primary.exists, true, 'primary should exist');
  assert.strictEqual(result.files.sibling.exists, false, 'sibling should not exist');
  assert.ok(!result.warnings.some(w => w.code === 'SIBLING_FILE_EXISTS'), 'no sibling warning');

  console.log('    ✓ primary-only state detected correctly');
}

function testBothFilesExist() {
  console.log('  test: both primary and sibling files exist');
  clearAll();

  writePrimaryConfig({ agents: { sisyphus: { model: 'anthropic/claude-opus-4-7' } } });
  writeSiblingConfig({ agents: { sisyphus: { model: 'openai/gpt-5.5' } } });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.files.state, 'both', 'state should be both');
  assert.strictEqual(result.files.primary.exists, true, 'primary should exist');
  assert.strictEqual(result.files.sibling.exists, true, 'sibling should exist');
  assert.ok(result.warnings.some(w => w.code === 'SIBLING_FILE_EXISTS'), 'should warn about sibling');

  console.log('    ✓ both-files state detected correctly');
}

function testSiblingOnly() {
  console.log('  test: only sibling file exists (no primary)');
  clearAll();

  writeSiblingConfig({ agents: { oracle: { model: 'openai/gpt-5.5' } } });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.files.state, 'sibling-only', 'state should be sibling-only');
  assert.strictEqual(result.files.primary.exists, false, 'primary should not exist');
  assert.strictEqual(result.files.sibling.exists, true, 'sibling should exist');
  assert.ok(result.warnings.some(w => w.code === 'PRIMARY_CONFIG_MISSING'), 'should warn about missing primary');

  console.log('    ✓ sibling-only state detected correctly');
}

function testStaleSchemaUrl() {
  console.log('  test: stale $schema URL with old repo path');
  clearAll();

  writePrimaryConfig({
    $schema: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json',
    agents: { oracle: { model: 'openai/gpt-5.5' } }
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.schema.isStale, true, 'isStale should be true');
  assert.strictEqual(result.schema.isCanonical, false, 'isCanonical should be false');
  assert.ok(result.schema.schemaUrl.includes('oh-my-opencode/master'), 'schemaUrl should contain old path');
  assert.ok(result.warnings.some(w => w.code === 'STALE_SCHEMA_URL'), 'should warn about stale schema');

  console.log('    ✓ stale schema URL detected correctly');
}

function testStaleSchemaUrlDevBranch() {
  console.log('  test: stale $schema URL with old repo dev branch');
  clearAll();

  writePrimaryConfig({
    $schema: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/assets/oh-my-opencode.schema.json',
    agents: { oracle: { model: 'openai/gpt-5.5' } }
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.schema.isStale, true, 'isStale should be true for dev branch');
  assert.ok(result.warnings.some(w => w.code === 'STALE_SCHEMA_URL'), 'should warn about stale dev schema');

  console.log('    ✓ stale dev branch schema URL detected correctly');
}

function testCanonicalSchemaUrl() {
  console.log('  test: canonical $schema URL with new repo path');
  clearAll();

  writePrimaryConfig({
    $schema: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json',
    agents: { oracle: { model: 'openai/gpt-5.5' } }
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.schema.isStale, false, 'isStale should be false');
  assert.strictEqual(result.schema.isCanonical, true, 'isCanonical should be true');
  assert.ok(result.schema.canonicalUrl, 'canonicalUrl should be present');
  assert.ok(!result.warnings.some(w => w.code === 'STALE_SCHEMA_URL'), 'no stale schema warning');

  console.log('    ✓ canonical schema URL recognized correctly');
}

function testNoSchemaUrl() {
  console.log('  test: no $schema URL in config');
  clearAll();

  writePrimaryConfig({ agents: { oracle: { model: 'openai/gpt-5.5' } } });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.schema.schemaUrl, null, 'schemaUrl should be null');
  assert.strictEqual(result.schema.isStale, false, 'isStale should be false');
  assert.strictEqual(result.schema.isCanonical, false, 'isCanonical should be false');

  console.log('    ✓ no schema URL handled correctly');
}

function testPluginWithPluralKey() {
  console.log('  test: plural plugins key in opencode.json');
  clearAll();
  writePrimaryConfig({ agents: {} });
  writeOpenCodeConfig({
    plugins: ['oh-my-opencode', 'some-other-plugin']
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.plugins.keyUsed, 'plugins', 'keyUsed should be plugins');
  assert.strictEqual(result.plugins.hasPlugins, true, 'hasPlugins should be true');
  assert.strictEqual(result.plugins.hasPlugin, false, 'hasPlugin should be false');
  assert.ok(result.plugins.plugins.includes('oh-my-opencode'), 'should list oh-my-opencode');
  assert.strictEqual(result.plugins.hasOldPlugin, true, 'hasOldPlugin should be true');
  assert.strictEqual(result.plugins.hasNewPlugin, false, 'hasNewPlugin should be false');

  console.log('    ✓ plural plugins key detected correctly');
}

function testPluginWithSingularKey() {
  console.log('  test: singular plugin key in opencode.json');
  clearAll();
  writePrimaryConfig({ agents: {} });
  writeOpenCodeConfig({
    plugin: ['opencode-lmstudio']
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.plugins.keyUsed, 'plugin', 'keyUsed should be plugin');
  assert.strictEqual(result.plugins.hasPlugin, true, 'hasPlugin should be true');
  assert.strictEqual(result.plugins.hasPlugins, false, 'hasPlugins should be false');
  assert.ok(result.plugins.plugins.includes('opencode-lmstudio'), 'should list plugin');

  console.log('    ✓ singular plugin key detected correctly');
}

function testPluginSingularStringValue() {
  console.log('  test: singular plugin key with string value');
  clearAll();
  writePrimaryConfig({ agents: {} });
  writeOpenCodeConfig({
    plugin: 'oh-my-openagent'
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.plugins.keyUsed, 'plugin', 'keyUsed should be plugin');
  assert.strictEqual(result.plugins.hasNewPlugin, true, 'should detect new plugin name');
  assert.ok(result.plugins.newPluginNames.includes('oh-my-openagent'), 'should list oh-my-openagent');

  console.log('    ✓ singular plugin string value handled');
}

function testMixedPluginNames() {
  console.log('  test: mixed old and new plugin names');
  clearAll();
  writePrimaryConfig({ agents: {} });
  writeOpenCodeConfig({
    plugins: ['oh-my-opencode', 'oh-my-openagent']
  });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.plugins.hasOldPlugin, true, 'should detect old plugin');
  assert.strictEqual(result.plugins.hasNewPlugin, true, 'should detect new plugin');
  assert.ok(result.warnings.some(w => w.code === 'MIXED_PLUGIN_NAMES'), 'should warn about mixed names');

  console.log('    ✓ mixed plugin names detected correctly');
}

function testNoOpenCodeConfig() {
  console.log('  test: no opencode.json (plugin diagnostics)');
  clearAll();
  writePrimaryConfig({ agents: {} });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.plugins.hasPlugin, false, 'hasPlugin should be false');
  assert.strictEqual(result.plugins.hasPlugins, false, 'hasPlugins should be false');
  assert.strictEqual(result.plugins.keyUsed, null, 'keyUsed should be null');
  assert.deepEqual(result.plugins.plugins, [], 'plugins should be empty');

  console.log('    ✓ missing opencode.json handled correctly');
}

function testReadOnlyNoMutation() {
  console.log('  test: diagnostics do not mutate any files');
  clearAll();

  const primaryPath = writePrimaryConfig({
    $schema: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json',
    agents: { oracle: { model: 'openai/gpt-5.5' } }
  });
  const siblingPath = writeSiblingConfig({ agents: {} });
  const opencodePath = writeOpenCodeConfig({
    plugins: ['oh-my-opencode']
  });

  // Capture pre-diagnostic state
  const prePrimaryChecksum = fileChecksum(primaryPath);
  const preSiblingChecksum = fileChecksum(siblingPath);
  const preOpencodeChecksum = fileChecksum(opencodePath);
  const prePrimaryMtime = fileMtime(primaryPath);
  const preSiblingMtime = fileMtime(siblingPath);
  const preOpencodeMtime = fileMtime(opencodePath);

  // Run diagnostics (which should detect stale schema and old plugin)
  buildConfigSplitDiagnostics();

  // Capture post-diagnostic state
  const postPrimaryChecksum = fileChecksum(primaryPath);
  const postSiblingChecksum = fileChecksum(siblingPath);
  const postOpencodeChecksum = fileChecksum(opencodePath);
  const postPrimaryMtime = fileMtime(primaryPath);
  const postSiblingMtime = fileMtime(siblingPath);
  const postOpencodeMtime = fileMtime(opencodePath);

  // Assert no mutation
  assert.strictEqual(prePrimaryChecksum, postPrimaryChecksum, 'primary config checksum should be unchanged');
  assert.strictEqual(preSiblingChecksum, postSiblingChecksum, 'sibling config checksum should be unchanged');
  assert.strictEqual(preOpencodeChecksum, postOpencodeChecksum, 'opencode config checksum should be unchanged');
  assert.strictEqual(prePrimaryMtime, postPrimaryMtime, 'primary config mtime should be unchanged');
  assert.strictEqual(preSiblingMtime, postSiblingMtime, 'sibling config mtime should be unchanged');
  assert.strictEqual(preOpencodeMtime, postOpencodeMtime, 'opencode config mtime should be unchanged');

  console.log('    ✓ no file mutation detected (checksums + mtimes unchanged)');
}

function testMalformedPrimaryConfig() {
  console.log('  test: malformed primary config handled gracefully');
  clearAll();

  writePrimaryConfig('{ broken json }}}');
  writeOpenCodeConfig({ plugins: ['oh-my-opencode'] });

  const result = buildConfigSplitDiagnostics();

  assert.strictEqual(result.files.primary.exists, true, 'primary should exist');
  assert.strictEqual(result.schema.schemaUrl, null, 'schemaUrl should be null for malformed config');
  assert.ok(result.warnings.some(w => w.code === 'SCHEMA_CHECK_FAILED'), 'should warn about read failure');

  console.log('    ✓ malformed primary config handled gracefully');
}

function testGeneratedAtAndStructure() {
  console.log('  test: output structure has all required fields');
  clearAll();
  writePrimaryConfig({ agents: {} });

  const result = buildConfigSplitDiagnostics();

  assert.ok(result.generatedAt, 'should have generatedAt');
  assert.ok(result.files, 'should have files');
  assert.ok(result.files.primary, 'should have files.primary');
  assert.ok(result.files.sibling, 'should have files.sibling');
  assert.ok('state' in result.files, 'should have files.state');
  assert.ok(result.schema, 'should have schema');
  assert.ok(result.plugins, 'should have plugins');
  assert.ok(Array.isArray(result.warnings), 'should have warnings array');
  assert.strictEqual(result.readOnly, true, 'readOnly should be true');

  // Schema sub-object keys
  assert.ok('schemaUrl' in result.schema, 'schema should have schemaUrl');
  assert.ok('isStale' in result.schema, 'schema should have isStale');
  assert.ok('isCanonical' in result.schema, 'schema should have isCanonical');
  assert.ok('canonicalUrl' in result.schema, 'schema should have canonicalUrl');

  // Plugin sub-object keys
  assert.ok('hasPlugin' in result.plugins, 'plugins should have hasPlugin');
  assert.ok('hasPlugins' in result.plugins, 'plugins should have hasPlugins');
  assert.ok('keyUsed' in result.plugins, 'plugins should have keyUsed');
  assert.ok(Array.isArray(result.plugins.plugins), 'plugins.plugins should be array');
  assert.ok('hasOldPlugin' in result.plugins, 'plugins should have hasOldPlugin');
  assert.ok('hasNewPlugin' in result.plugins, 'plugins should have hasNewPlugin');

  console.log('    ✓ output structure has all required fields');
}

// Run

function run() {
  console.log('config-split-diagnostics-test: running...\n');

  testNoConfigFiles();
  testPrimaryOnly();
  testBothFilesExist();
  testSiblingOnly();
  testStaleSchemaUrl();
  testStaleSchemaUrlDevBranch();
  testCanonicalSchemaUrl();
  testNoSchemaUrl();
  testPluginWithPluralKey();
  testPluginWithSingularKey();
  testPluginSingularStringValue();
  testMixedPluginNames();
  testNoOpenCodeConfig();
  testReadOnlyNoMutation();
  testMalformedPrimaryConfig();
  testGeneratedAtAndStructure();

  console.log('\nconfig-split-diagnostics-test: ok');
}

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        cleanup(full);
      } else {
        fs.unlinkSync(full);
      }
    }
    fs.rmdirSync(dir);
  }
}

try {
  run();
} finally {
  cleanup(tmpHome);
}
