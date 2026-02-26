#!/usr/bin/env node

/**
 * Unit tests for provider diagnostics core module.
 * Tests normalization, expected-source extraction, mismatch classification,
 * cache status handling, and LM Studio policy field presence.
 *
 * Uses isolated HOME fixtures to avoid coupling to live user config.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================================================
// Test fixture setup - isolate HOME before requiring any project modules
// ============================================================================

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-diagnostics-test-'));
const tmpConfigDir = path.join(tmpHome, '.config', 'opencode');
const tmpCacheDir = path.join(tmpConfigDir, 'cache');
fs.mkdirSync(tmpConfigDir, { recursive: true });
fs.mkdirSync(tmpCacheDir, { recursive: true });
process.env.HOME = tmpHome;

// Clear module cache to ensure fresh load with isolated HOME
delete require.cache[require.resolve('../lib/constants')];
delete require.cache[require.resolve('../lib/core/provider-diagnostics')];

const constants = require('../lib/constants');
const {
  buildProviderDiagnostics,
  collectDiscoveredProviders,
  collectExpectedProviders,
  classifyProviderMismatches
} = require('../lib/core/provider-diagnostics');

// Path to models cache file in isolated env
const modelsCachePath = path.join(tmpCacheDir, 'models-cache.json');

// ============================================================================
// Test helpers
// ============================================================================

function writeModelsCache(providers, timestamp = Date.now()) {
  const cache = {
    timestamp,
    providers,
    models: []
  };
  fs.writeFileSync(modelsCachePath, JSON.stringify(cache, null, 2));
}

function writeOpenCodeConfig(config) {
  fs.writeFileSync(path.join(tmpConfigDir, 'opencode.json'), JSON.stringify(config, null, 2));
}

function writeOhMyOpenCodeConfig(config) {
  fs.writeFileSync(path.join(tmpConfigDir, 'oh-my-opencode.jsonc'), JSON.stringify(config, null, 2));
}

function clearCache() {
  if (fs.existsSync(modelsCachePath)) {
    fs.unlinkSync(modelsCachePath);
  }
}

function clearConfigs() {
  const opencodePath = path.join(tmpConfigDir, 'opencode.json');
  const omoPath = path.join(tmpConfigDir, 'oh-my-opencode.jsonc');
  if (fs.existsSync(opencodePath)) fs.unlinkSync(opencodePath);
  if (fs.existsSync(omoPath)) fs.unlinkSync(omoPath);
}

// ============================================================================
// Tests
// ============================================================================

function testDryRunSkeleton() {
  console.log('  test: dryRun returns skeleton with all required keys');
  
  const result = buildProviderDiagnostics({ dryRun: true });
  
  // Verify skeleton structure
  assert.ok(result.generatedAt, 'should have generatedAt');
  assert.ok(Array.isArray(result.normalized.discovered), 'should have normalized.discovered array');
  assert.ok(Array.isArray(result.normalized.expected), 'should have normalized.expected array');
  assert.deepEqual(result.normalized.discovered, [], 'discovered should be empty in dryRun');
  assert.deepEqual(result.normalized.expected, [], 'expected should be empty in dryRun');
  assert.ok(Array.isArray(result.mismatches.expectedButMissing), 'should have expectedButMissing array');
  assert.ok(Array.isArray(result.mismatches.discoveredNotExpected), 'should have discoveredNotExpected array');
  assert.ok(Array.isArray(result.mismatches.aliasNormalizedMatches), 'should have aliasNormalizedMatches array');
  
  // Verify cache status skeleton
  assert.strictEqual(result.cacheStatus.exists, false, 'cacheStatus.exists should be false');
  assert.strictEqual(result.cacheStatus.timestamp, null, 'cacheStatus.timestamp should be null');
  assert.strictEqual(result.cacheStatus.ageMs, null, 'cacheStatus.ageMs should be null');
  
  // Verify LM Studio policy
  assert.ok(result.policy.lmStudio, 'should have policy.lmStudio');
  assert.strictEqual(result.policy.lmStudio.customDetection, 'disabled', 'lmStudio.customDetection should be disabled');
  assert.ok(result.policy.lmStudio.reason, 'lmStudio.reason should be present');
  
  console.log('    ✓ dryRun returns valid skeleton');
}

function testFireworksAliasNormalization() {
  console.log('  test: fireworks alias normalization');
  
  // Test via constants.normalizeProviderName
  assert.strictEqual(constants.normalizeProviderName('fireworks'), 'fireworks-ai', 'fireworks should normalize to fireworks-ai');
  assert.strictEqual(constants.normalizeProviderName('Fireworks'), 'fireworks-ai', 'Fireworks (capitalized) should normalize to fireworks-ai');
  assert.strictEqual(constants.normalizeProviderName('FIREWORKS'), 'fireworks-ai', 'FIREWORKS (uppercase) should normalize to fireworks-ai');
  assert.strictEqual(constants.normalizeProviderName('fireworks-ai'), 'fireworks-ai', 'fireworks-ai should stay as fireworks-ai');
  
  // Test via mismatch classifier with aliased discovered provider
  const discovered = ['fireworks']; // raw alias
  const expected = ['fireworks-ai']; // canonical
  const mismatches = classifyProviderMismatches(discovered, expected);
  
  // After normalization, fireworks should match fireworks-ai
  assert.strictEqual(mismatches.expectedButMissing.length, 0, 'fireworks-ai should not be missing when fireworks discovered');
  assert.strictEqual(mismatches.discoveredNotExpected.length, 0, 'fireworks should not be unexpected when fireworks-ai expected');
  assert.strictEqual(mismatches.aliasNormalizedMatches.length, 1, 'should have one alias-normalized match');
  assert.strictEqual(mismatches.aliasNormalizedMatches[0].provider, 'fireworks-ai', 'match should be for canonical provider');
  
  console.log('    ✓ fireworks alias normalizes correctly');
}

function testMissingProviderWarning() {
  console.log('  test: missing provider warning case');
  
  clearCache();
  clearConfigs();
  
  // Configure a provider in opencode.json but don't have it in cache
  writeOpenCodeConfig({
    providers: {
      anthropic: { apiKey: 'test-key' }
    }
  });
  
  // No models cache - discovered will be empty
  const { discovered, warnings } = collectDiscoveredProviders();
  const { expected } = collectExpectedProviders();
  
  // Should have warning about missing cache
  assert.ok(warnings.length > 0, 'should have warning about missing cache');
  assert.ok(warnings.some(w => w.includes('No models cache')), 'warning should mention missing cache');
  
  // Expected should include anthropic
  assert.ok(expected.includes('anthropic'), 'expected should include anthropic from config');
  
  // Discovered should be empty
  assert.deepEqual(discovered, [], 'discovered should be empty when no cache');
  
  // Classify mismatches - anthropic should be expected but missing
  const mismatches = classifyProviderMismatches(discovered, expected);
  assert.strictEqual(mismatches.expectedButMissing.length, 1, 'anthropic should be expected but missing');
  assert.strictEqual(mismatches.expectedButMissing[0].provider, 'anthropic', 'missing provider should be anthropic');
  assert.strictEqual(mismatches.expectedButMissing[0].severity, 'warning', 'missing provider should have warning severity');
  
  console.log('    ✓ missing provider warning detected correctly');
}

function testMalformedConfigHandling() {
  console.log('  test: malformed config handling (non-fatal)');
  
  clearCache();
  clearConfigs();
  
  // Write malformed opencode.json
  fs.writeFileSync(path.join(tmpConfigDir, 'opencode.json'), '{ invalid json }');
  
  // Write malformed oh-my-opencode.jsonc
  fs.writeFileSync(path.join(tmpConfigDir, 'oh-my-opencode.jsonc'), '{ broken');
  
  // Should not throw, should return warnings
  const { expected, fromConfig, fromAssignments } = collectExpectedProviders();
  
  // Should have warnings about malformed configs
  assert.ok(fromConfig.warnings.length > 0, 'fromConfig should have warnings');
  assert.ok(fromConfig.warnings.some(w => w.includes('Failed to read/parse')), 'warning should mention parse failure');
  assert.ok(fromAssignments.warnings.length > 0, 'fromAssignments should have warnings');
  
  // Expected should still be an array (empty)
  assert.ok(Array.isArray(expected), 'expected should still be an array');
  
  console.log('    ✓ malformed config handled non-fatally');
}

function testCacheStatusHandling() {
  console.log('  test: cache status handling');
  
  clearCache();
  
  // Test with no cache
  let result = collectDiscoveredProviders();
  assert.strictEqual(result.cacheStatus.exists, false, 'cacheStatus.exists should be false when no cache');
  assert.strictEqual(result.cacheStatus.timestamp, null, 'cacheStatus.timestamp should be null when no cache');
  assert.strictEqual(result.cacheStatus.ageMs, null, 'cacheStatus.ageMs should be null when no cache');
  
  // Test with cache
  const timestamp = Date.now() - 60000; // 1 minute ago
  writeModelsCache(['anthropic', 'openai'], timestamp);
  
  result = collectDiscoveredProviders();
  assert.strictEqual(result.cacheStatus.exists, true, 'cacheStatus.exists should be true when cache exists');
  assert.strictEqual(result.cacheStatus.timestamp, timestamp, 'cacheStatus.timestamp should match cache timestamp');
  assert.ok(result.cacheStatus.ageMs >= 60000, 'cacheStatus.ageMs should be at least 60 seconds');
  assert.ok(result.cacheStatus.ageMs < 70000, 'cacheStatus.ageMs should be less than 70 seconds');
  
  // Discovered providers should include normalized names
  assert.ok(result.discovered.includes('anthropic'), 'discovered should include anthropic');
  assert.ok(result.discovered.includes('openai'), 'discovered should include openai');
  
  console.log('    ✓ cache status handled correctly');
}

function testLMStudioPolicyFieldPresence() {
  console.log('  test: LM Studio policy field presence');
  
  // Test in dryRun mode
  let result = buildProviderDiagnostics({ dryRun: true });
  assert.strictEqual(result.policy.lmStudio.customDetection, 'disabled', 'dryRun should have lmStudio.customDetection disabled');
  assert.strictEqual(
    result.policy.lmStudio.reason,
    'LMStudio provider requires local server detection which is not implemented',
    'dryRun should have correct lmStudio reason'
  );
  
  // Test with full build (needs cache)
  clearCache();
  clearConfigs();
  writeModelsCache(['openai']);
  writeOpenCodeConfig({ providers: { openai: { apiKey: 'test' } } });
  
  result = buildProviderDiagnostics();
  assert.strictEqual(result.policy.lmStudio.customDetection, 'disabled', 'full build should have lmStudio.customDetection disabled');
  assert.ok(result.policy.lmStudio.reason, 'full build should have lmStudio.reason');
  
  console.log('    ✓ LM Studio policy fields present');
}

function testExpectedSourcesExtraction() {
  console.log('  test: expected sources extraction (fromConfig, fromAssignments)');
  
  clearCache();
  clearConfigs();
  
  // Setup: config with providers and plugin hints
  writeOpenCodeConfig({
    providers: {
      anthropic: { apiKey: 'key1' },
      openai: { apiKey: 'key2' }
    },
    plugins: ['plugin-one', { name: 'plugin-two' }]
  });
  
  // Setup: oh-my-opencode with agent assignments
  writeOhMyOpenCodeConfig({
    agents: {
      sisyphus: { model: 'anthropic/claude-opus-4-5' },
      oracle: { model: 'openai/gpt-5.2' },
      librarian: { model: 'google/gemini-3-flash' }
    }
  });
  
  const { expected, fromConfig, fromAssignments } = collectExpectedProviders();
  
  // fromConfig should have normalized providers from opencode.json
  assert.ok(fromConfig.providersNormalized.includes('anthropic'), 'fromConfig should include anthropic');
  assert.ok(fromConfig.providersNormalized.includes('openai'), 'fromConfig should include openai');
  
  // pluginHints should be extracted but NOT in expected
  assert.ok(fromConfig.pluginHints.includes('plugin-one'), 'fromConfig should include plugin hints');
  assert.ok(fromConfig.pluginHints.includes('plugin-two'), 'fromConfig should include plugin-two');
  
  // fromAssignments should have providers from model prefixes
  assert.ok(fromAssignments.providersNormalized.includes('anthropic'), 'fromAssignments should include anthropic');
  assert.ok(fromAssignments.providersNormalized.includes('openai'), 'fromAssignments should include openai');
  assert.ok(fromAssignments.providersNormalized.includes('google'), 'fromAssignments should include google');
  
  // expected should include all hard expected (config + assignments)
  assert.ok(expected.includes('anthropic'), 'expected should include anthropic');
  assert.ok(expected.includes('openai'), 'expected should include openai');
  assert.ok(expected.includes('google'), 'expected should include google');
  
  // Verify source tracking in fromAssignments
  assert.ok(fromAssignments.sources.length > 0, 'fromAssignments should have sources array');
  const anthropicSource = fromAssignments.sources.find(s => s.provider === 'anthropic');
  assert.ok(anthropicSource, 'anthropic should have source tracking');
  assert.ok(anthropicSource.modelRefCount >= 1, 'anthropic should have modelRefCount');
  
  console.log('    ✓ expected sources extracted correctly');
}

function testMismatchClassification() {
  console.log('  test: mismatch classification logic');
  
  clearCache();
  clearConfigs();
  
  // Scenario: discovered has [a, b, c], expected has [a, d]
  const discovered = ['anthropic', 'google', 'openai'];
  const expected = ['anthropic', 'fireworks-ai'];
  
  const mismatches = classifyProviderMismatches(discovered, expected);
  
  // expectedButMissing: fireworks-ai (in expected but not discovered)
  assert.strictEqual(mismatches.expectedButMissing.length, 1, 'should have one expected but missing');
  assert.strictEqual(mismatches.expectedButMissing[0].provider, 'fireworks-ai', 'fireworks-ai should be missing');
  
  // discoveredNotExpected: google, openai (in discovered but not expected)
  assert.strictEqual(mismatches.discoveredNotExpected.length, 2, 'should have two discovered not expected');
  const unexpectedProviders = mismatches.discoveredNotExpected.map(m => m.provider);
  assert.ok(unexpectedProviders.includes('google'), 'google should be discovered not expected');
  assert.ok(unexpectedProviders.includes('openai'), 'openai should be discovered not expected');
  
  // aliasNormalizedMatches: anthropic (in both)
  assert.strictEqual(mismatches.aliasNormalizedMatches.length, 1, 'should have one matched');
  assert.strictEqual(mismatches.aliasNormalizedMatches[0].provider, 'anthropic', 'anthropic should be matched');
  
  // Verify severity levels
  assert.strictEqual(mismatches.expectedButMissing[0].severity, 'warning', 'expectedButMissing should have warning severity');
  assert.strictEqual(mismatches.discoveredNotExpected[0].severity, 'info', 'discoveredNotExpected should have info severity');
  assert.strictEqual(mismatches.aliasNormalizedMatches[0].severity, 'info', 'aliasNormalizedMatches should have info severity');
  
  console.log('    ✓ mismatches classified correctly');
}

function testDeterministicSorting() {
  console.log('  test: deterministic sorting for stable output');
  
  // Use unsorted input
  const discovered = ['zebra', 'alpha', 'gamma'];
  const expected = ['beta', 'alpha', 'gamma'];
  
  const mismatches = classifyProviderMismatches(discovered, expected);
  
  // Verify sorted output
  const expectedButMissingNames = mismatches.expectedButMissing.map(m => m.provider);
  const discoveredNotExpectedNames = mismatches.discoveredNotExpected.map(m => m.provider);
  const matchedNames = mismatches.aliasNormalizedMatches.map(m => m.provider);
  
  // Should be alphabetically sorted
  assert.deepEqual(expectedButMissingNames, [...expectedButMissingNames].sort(), 'expectedButMissing should be sorted');
  assert.deepEqual(discoveredNotExpectedNames, [...discoveredNotExpectedNames].sort(), 'discoveredNotExpected should be sorted');
  assert.deepEqual(matchedNames, [...matchedNames].sort(), 'aliasNormalizedMatches should be sorted');
  
  console.log('    ✓ output is deterministically sorted');
}

// ============================================================================
// Run all tests
// ============================================================================

function run() {
  console.log('provider-diagnostics-test: running...\n');
  
  testDryRunSkeleton();
  testFireworksAliasNormalization();
  testMissingProviderWarning();
  testMalformedConfigHandling();
  testCacheStatusHandling();
  testLMStudioPolicyFieldPresence();
  testExpectedSourcesExtraction();
  testMismatchClassification();
  testDeterministicSorting();
  
  console.log('\nprovider-diagnostics-test: ok');
}

// ============================================================================
// Cleanup
// ============================================================================

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

// Run tests
try {
  run();
} finally {
  cleanup(tmpHome);
}
