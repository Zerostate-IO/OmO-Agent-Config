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
const tmpAuthDir = path.join(tmpHome, '.local', 'share', 'opencode');
fs.mkdirSync(tmpConfigDir, { recursive: true });
fs.mkdirSync(tmpCacheDir, { recursive: true });
fs.mkdirSync(tmpAuthDir, { recursive: true });
process.env.HOME = tmpHome;

// Clear module cache to ensure fresh load with isolated HOME
delete require.cache[require.resolve('../lib/constants')];
delete require.cache[require.resolve('../lib/core/provider-diagnostics')];

const constants = require('../lib/constants');
const {
  buildProviderDiagnostics,
  buildProviderHealthCheck,
  collectProviderAuthDiagnostics,
  collectDiscoveredProviders,
  collectExpectedProviders,
  classifyProviderMismatches,
  deriveProvidersFromModels
} = require('../lib/core/provider-diagnostics');

// Path to models cache file in isolated env
const modelsCachePath = path.join(tmpCacheDir, 'models-cache.json');
const authFilePath = path.join(tmpAuthDir, 'auth.json');

// ============================================================================
// Test helpers
// ============================================================================

function writeModelsCache(providers, timestamp = Date.now(), models = []) {
  const cache = {
    timestamp,
    providers,
    models
  };
  fs.writeFileSync(modelsCachePath, JSON.stringify(cache, null, 2));
}

function writeOpenCodeConfig(config) {
  fs.writeFileSync(path.join(tmpConfigDir, 'opencode.json'), JSON.stringify(config, null, 2));
}

function writeOhMyOpenCodeConfig(config) {
  fs.writeFileSync(path.join(tmpConfigDir, 'oh-my-opencode.jsonc'), JSON.stringify(config, null, 2));
}

function writeAuthFile(config) {
  fs.writeFileSync(authFilePath, JSON.stringify(config, null, 2));
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
  clearAuth();
  delete process.env.XAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
}

function clearAuth() {
  if (fs.existsSync(authFilePath)) fs.unlinkSync(authFilePath);
}

// ============================================================================
// Tests
// ============================================================================

async function testDryRunSkeleton() {
  console.log('  test: dryRun returns skeleton with all required keys');

  const result = await buildProviderDiagnostics({ dryRun: true });

  // Verify skeleton structure
  assert.ok(result.generatedAt, 'should have generatedAt');
  assert.ok(Array.isArray(result.normalized.discovered), 'should have normalized.discovered array');
  assert.ok(Array.isArray(result.normalized.expected), 'should have normalized.expected array');
  assert.deepEqual(result.normalized.discovered, [], 'discovered should be empty in dryRun');
  assert.deepEqual(result.normalized.expected, [], 'expected should be empty in dryRun');
  assert.ok(Array.isArray(result.mismatches.expectedButMissing), 'should have expectedButMissing array');
  assert.ok(Array.isArray(result.mismatches.discoveredNotExpected), 'should have discoveredNotExpected array');
  assert.ok(Array.isArray(result.mismatches.matched), 'should have matched array');

  // Verify cache status skeleton
  assert.strictEqual(result.cacheStatus.exists, false, 'cacheStatus.exists should be false');
  assert.strictEqual(result.cacheStatus.timestamp, null, 'cacheStatus.timestamp should be null');
  assert.strictEqual(result.cacheStatus.ageMs, null, 'cacheStatus.ageMs should be null');

  // Verify LM Studio policy
  assert.ok(result.policy.lmStudio, 'should have policy.lmStudio');
  assert.strictEqual(result.policy.lmStudio.customDetection, 'disabled', 'lmStudio.customDetection should be disabled');
  assert.ok(result.policy.lmStudio.reason, 'lmStudio.reason should be present');

  assert.ok(result.auth, 'should have auth diagnostics');
  assert.strictEqual(result.auth.readOnly, true, 'auth diagnostics should be read-only');
  assert.strictEqual(result.auth.noSecretOutput, true, 'auth diagnostics should declare no-secret-output');
  assert.strictEqual(result.auth.providers.xai.status, 'missing', 'dryRun xai auth should be missing');
  assert.strictEqual(result.auth.providers.deepseek.status, 'missing', 'dryRun deepseek auth should be missing');

  console.log('    ✓ dryRun returns valid skeleton');
}

function testAuthDiagnosticsFromAuthFile() {
  console.log('  test: auth diagnostics detect xAI OAuth and DeepSeek API key from auth file');

  clearCache();
  clearConfigs();

  const xaiAccessSecret = 'xai-access-secret-should-not-leak';
  const xaiRefreshSecret = 'xai-refresh-secret-should-not-leak';
  const deepseekSecret = 'deepseek-secret-should-not-leak';
  writeAuthFile({
    xai: {
      type: 'oauth',
      access: xaiAccessSecret,
      refresh: xaiRefreshSecret,
      expires: 9999999999999
    },
    deepseek: {
      type: 'api',
      key: deepseekSecret
    }
  });

  const result = collectProviderAuthDiagnostics();

  assert.strictEqual(result.readOnly, true, 'auth diagnostics should be read-only');
  assert.strictEqual(result.noSecretOutput, true, 'auth diagnostics should declare no-secret-output');
  assert.strictEqual(result.authFile.exists, true, 'auth file should be detected');
  assert.strictEqual(result.providers.xai.status, 'present', 'xai auth should be present');
  assert.ok(result.providers.xai.detectedAuthTypes.includes('oauth'), 'xai should detect oauth');
  assert.strictEqual(result.providers.deepseek.status, 'present', 'deepseek auth should be present');
  assert.ok(result.providers.deepseek.detectedAuthTypes.includes('api-key'), 'deepseek should detect api-key');

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(xaiAccessSecret), 'xai access token must not be emitted');
  assert.ok(!serialized.includes(xaiRefreshSecret), 'xai refresh token must not be emitted');
  assert.ok(!serialized.includes(deepseekSecret), 'deepseek API key must not be emitted');

  console.log('    ✓ auth file sources detected without leaking secrets');
}

async function testAuthDiagnosticsFromConfigAndEnv() {
  console.log('  test: auth diagnostics detect config and env sources without values');

  clearCache();
  clearConfigs();

  const xaiConfigSecret = 'xai-config-secret-should-not-leak';
  const deepseekConfigSecret = 'deepseek-config-secret-should-not-leak';
  const xaiEnvSecret = 'xai-env-secret-should-not-leak';
  const deepseekEnvSecret = 'deepseek-env-secret-should-not-leak';

  process.env.XAI_API_KEY = xaiEnvSecret;
  process.env.DEEPSEEK_API_KEY = deepseekEnvSecret;

  writeOpenCodeConfig({
    provider: {
      xai: { options: { apiKey: xaiConfigSecret } },
      deepseek: { apiKey: deepseekConfigSecret }
    }
  });

  const result = await buildProviderDiagnostics();

  assert.strictEqual(result.auth.providers.xai.status, 'present', 'xai auth should be present');
  assert.strictEqual(result.auth.providers.deepseek.status, 'present', 'deepseek auth should be present');
  assert.ok(result.auth.providers.xai.sources.some(s => s.kind === 'opencode-config'), 'xai should include config source');
  assert.ok(result.auth.providers.xai.sources.some(s => s.kind === 'environment'), 'xai should include env source');
  assert.ok(result.auth.providers.deepseek.sources.some(s => s.kind === 'opencode-config'), 'deepseek should include config source');
  assert.ok(result.auth.providers.deepseek.sources.some(s => s.kind === 'environment'), 'deepseek should include env source');

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(xaiConfigSecret), 'xai config key must not be emitted');
  assert.ok(!serialized.includes(deepseekConfigSecret), 'deepseek config key must not be emitted');
  assert.ok(!serialized.includes(xaiEnvSecret), 'xai env key must not be emitted');
  assert.ok(!serialized.includes(deepseekEnvSecret), 'deepseek env key must not be emitted');

  console.log('    ✓ config and env auth sources detected without leaking secrets');
}

async function testProviderHealthCheckNonLive() {
  console.log('  test: provider health check non-live reports configured, visible, auth-present');

  clearCache();
  clearConfigs();

  const xaiSecret = 'xai-health-secret-should-not-leak';
  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: xaiSecret },
      openai: { apiKey: 'openai-health-secret-should-not-leak' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' },
      hephaestus: { model: 'openai/gpt-5.5' }
    }
  });
  writeModelsCache(['xai', 'openai'], Date.now(), [
    { id: 'xai/grok-4.3', providerID: 'xai', name: 'Grok 4.3' },
    { id: 'openai/gpt-5.5', providerID: 'openai', name: 'GPT 5.5' }
  ]);

  const result = await buildProviderHealthCheck({ live: false });
  const xai = result.providers.find(p => p.provider === 'xai');
  const openai = result.providers.find(p => p.provider === 'openai');

  assert.strictEqual(result.optIn, true, 'health check should be opt-in');
  assert.strictEqual(result.noSecretOutput, true, 'health check should declare no-secret-output');
  assert.strictEqual(result.liveRequested, false, 'non-live health check should not request live probe');
  assert.ok(xai, 'xai should be included');
  assert.ok(openai, 'openai should be included');
  assert.strictEqual(xai.configured, true, 'xai should be configured');
  assert.strictEqual(xai.visible, true, 'xai should be visible');
  assert.strictEqual(xai.authPresent, true, 'xai auth should be present');
  assert.strictEqual(xai.liveStatus, 'not-requested', 'xai live status should not be requested');
  assert.strictEqual(openai.authPresent, true, 'openai auth should be detected from config');
  assert.ok(!JSON.stringify(result).includes(xaiSecret), 'health check must not emit API key values');

  console.log('    ✓ non-live health check reports safe status');
}

async function testProviderHealthCheckLiveWithInjectedProbe() {
  console.log('  test: provider health check live uses injected probe and classifies failures');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: 'xai-live-secret-should-not-leak' },
      deepseek: { apiKey: 'deepseek-live-secret-should-not-leak' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      atlas: { model: 'xai/grok-4.3' },
      explore: { model: 'deepseek/deepseek-v4-flash' }
    }
  });

  const result = await buildProviderHealthCheck({
    live: true,
    providers: ['xai', 'deepseek', 'anthropic'],
    modelsResult: {
      providers: ['xai', 'deepseek'],
      models: [
        { id: 'xai/grok-4.3', providerID: 'xai' },
        { id: 'deepseek/deepseek-v4-flash', providerID: 'deepseek' }
      ]
    },
    probeModel: async (modelId) => {
      if (modelId.startsWith('deepseek/')) {
        return { ok: false, reason: 'OpenCode probe failed', errorCategory: 'auth' };
      }
      return { ok: true };
    }
  });

  const xai = result.providers.find(p => p.provider === 'xai');
  const deepseek = result.providers.find(p => p.provider === 'deepseek');
  const anthropic = result.providers.find(p => p.provider === 'anthropic');

  assert.strictEqual(result.liveRequested, true, 'live health check should report live requested');
  assert.strictEqual(xai.liveOk, true, 'xai probe should succeed');
  assert.strictEqual(xai.liveStatus, 'ok', 'xai live status should be ok');
  assert.strictEqual(deepseek.liveOk, false, 'deepseek probe should fail');
  assert.strictEqual(deepseek.liveStatus, 'failed', 'deepseek live status should be failed');
  assert.strictEqual(deepseek.errorCategory, 'auth', 'deepseek failure should be classified');
  assert.strictEqual(anthropic.liveStatus, 'skipped', 'missing visible model should skip live probe');
  assert.ok(!JSON.stringify(result).includes('should-not-leak'), 'live health check must not emit secret values');

  console.log('    ✓ live health check handles injected probe results');
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
  assert.strictEqual(mismatches.matched.length, 1, 'should have one alias-normalized match');
  assert.strictEqual(mismatches.matched[0].provider, 'fireworks-ai', 'match should be for canonical provider');

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

async function testLMStudioPolicyFieldPresence() {
  console.log('  test: LM Studio policy field presence');

  let result = await buildProviderDiagnostics({ dryRun: true });
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

  result = await buildProviderDiagnostics();
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
      sisyphus: { model: 'anthropic/claude-opus-4-6' },
      oracle: { model: 'openai/gpt-5.4' },
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

function testSingularOpenCodeSchemaExtraction() {
  console.log('  test: singular OpenCode schema extraction (provider/plugin)');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    provider: {
      fireworks: { apiKey: 'fw-key' },
      openai: { apiKey: 'oa-key' }
    },
    plugin: ['opencode-antigravity-auth', { name: 'oh-my-opencode' }]
  });

  const { expected, fromConfig } = collectExpectedProviders();

  assert.ok(fromConfig.providersNormalized.includes('fireworks-ai'), 'singular provider key should normalize fireworks -> fireworks-ai');
  assert.ok(fromConfig.providersNormalized.includes('openai'), 'singular provider key should include openai');
  assert.ok(fromConfig.pluginHints.includes('opencode-antigravity-auth'), 'singular plugin list should include string entry');
  assert.ok(fromConfig.pluginHints.includes('oh-my-opencode'), 'singular plugin list should include named entry');
  assert.ok(expected.includes('fireworks-ai'), 'expected should include normalized fireworks provider');

  console.log('    ✓ singular schema extracted correctly');
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

  // matched: anthropic (in both)
  assert.strictEqual(mismatches.matched.length, 1, 'should have one matched');
  assert.strictEqual(mismatches.matched[0].provider, 'anthropic', 'anthropic should be matched');

  // Verify severity levels
  assert.strictEqual(mismatches.expectedButMissing[0].severity, 'warning', 'expectedButMissing should have warning severity');
  assert.strictEqual(mismatches.discoveredNotExpected[0].severity, 'info', 'discoveredNotExpected should have info severity');
  assert.strictEqual(mismatches.matched[0].severity, 'info', 'matched should have info severity');

  console.log('    ✓ mismatches classified correctly');
}

async function testBuildDiagnosticsUsesStructuredExpectedSources() {
  console.log('  test: buildProviderDiagnostics returns structured expected sources');

  clearCache();
  clearConfigs();

  writeModelsCache(['openai', 'fireworks-ai']);
  writeOpenCodeConfig({
    provider: {
      fireworks: { apiKey: 'fw-key' }
    },
    plugin: 'oh-my-opencode'
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'openai/gpt-5.4' }
    }
  });

  const result = await buildProviderDiagnostics();

  assert.ok(Array.isArray(result.sources.fromConfig.providersNormalized), 'fromConfig should expose providersNormalized');
  assert.ok(result.sources.fromConfig.providersNormalized.includes('fireworks-ai'), 'fromConfig should include normalized Fireworks provider');
  assert.ok(Array.isArray(result.sources.fromConfig.pluginHints), 'fromConfig should expose pluginHints');
  assert.ok(result.sources.fromConfig.pluginHints.includes('oh-my-opencode'), 'fromConfig should include singular plugin hint');
  assert.ok(Array.isArray(result.sources.fromAssignments.sources), 'fromAssignments should expose structured sources');

  console.log('    ✓ buildProviderDiagnostics returns expected structured sources');
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
  const matchedNames = mismatches.matched.map(m => m.provider);

  // Should be alphabetically sorted
  assert.deepEqual(expectedButMissingNames, [...expectedButMissingNames].sort(), 'expectedButMissing should be sorted');
  assert.deepEqual(discoveredNotExpectedNames, [...discoveredNotExpectedNames].sort(), 'discoveredNotExpected should be sorted');
  assert.deepEqual(matchedNames, [...matchedNames].sort(), 'matched should be sorted');

  console.log('    ✓ output is deterministically sorted');
}

function testVercelProviderNormalization() {
  console.log('  test: vercel provider normalization');

  // Vercel should normalize to itself (canonical)
  assert.strictEqual(constants.normalizeProviderName('vercel'), 'vercel', 'vercel should normalize to vercel');
  assert.strictEqual(constants.normalizeProviderName('Vercel'), 'vercel', 'Vercel (capitalized) should normalize to vercel');
  assert.strictEqual(constants.normalizeProviderName('VERCEL'), 'vercel', 'VERCEL (uppercase) should normalize to vercel');

  // Test mismatch classification with vercel
  const discovered = ['vercel', 'openai'];
  const expected = ['vercel', 'openai'];
  const mismatches = classifyProviderMismatches(discovered, expected);

  assert.strictEqual(mismatches.expectedButMissing.length, 0, 'vercel should not be missing');
  assert.strictEqual(mismatches.discoveredNotExpected.length, 0, 'vercel should not be unexpected');
  assert.strictEqual(mismatches.matched.length, 2, 'both providers should match');

  console.log('    ✓ vercel provider normalizes correctly');
}

async function testVercelProviderInDiagnostics() {
  console.log('  test: vercel provider in full diagnostics');

  clearCache();
  clearConfigs();

  writeModelsCache(['vercel', 'openai']);
  writeOpenCodeConfig({
    providers: {
      openai: { apiKey: 'test-key' },
      vercel: { apiKey: 'vercel-key' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      sisyphus: { model: 'vercel/claude-opus-4-7' },
      oracle: { model: 'openai/gpt-5.5' }
    }
  });

  const result = await buildProviderDiagnostics();

  // Vercel should be discovered
  assert.ok(result.normalized.discovered.includes('vercel'), 'vercel should be in discovered');
  // Vercel should be expected from both config and assignments
  assert.ok(result.normalized.expected.includes('vercel'), 'vercel should be in expected');
  // No mismatches for vercel
  assert.ok(!result.mismatches.expectedButMissing.some(m => m.provider === 'vercel'), 'vercel should not be in expectedButMissing');

  console.log('    ✓ vercel provider handled correctly in full diagnostics');
}

async function testDryRunHasConfigSplitField() {
  console.log('  test: dryRun includes configSplit field (null)');

  const result = await buildProviderDiagnostics({ dryRun: true });

  assert.ok('configSplit' in result, 'dryRun result should have configSplit field');
  assert.strictEqual(result.configSplit, null, 'dryRun configSplit should be null');

  console.log('    ✓ dryRun has configSplit field');
}

async function testProviderDiagnosticsIncludesConfigSplit() {
  console.log('  test: buildProviderDiagnostics includes configSplit sub-object');

  clearCache();
  clearConfigs();

  writeModelsCache(['openai']);
  writeOpenCodeConfig({ providers: { openai: { apiKey: 'test' } } });
  writeOhMyOpenCodeConfig({ agents: { oracle: { model: 'openai/gpt-5.5' } } });

  const result = await buildProviderDiagnostics();

  assert.ok(result.configSplit, 'should have configSplit sub-object');
  assert.strictEqual(result.configSplit.readOnly, true, 'configSplit.readOnly should be true');
  assert.ok(result.configSplit.files, 'configSplit should have files');
  assert.ok(result.configSplit.schema, 'configSplit should have schema');
  assert.ok(result.configSplit.plugins, 'configSplit should have plugins');
  assert.ok(Array.isArray(result.configSplit.warnings), 'configSplit should have warnings array');

  console.log('    ✓ buildProviderDiagnostics includes configSplit');
}

async function testConfigSplitWarningsSurfaceInHints() {
  console.log('  test: config-split warnings surface as hint strings in provider diagnostics');

  clearCache();
  clearConfigs();

  writeModelsCache(['openai']);
  writeOpenCodeConfig({ providers: { openai: { apiKey: 'test' } } });
  writeOhMyOpenCodeConfig({
    $schema: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json',
    agents: { oracle: { model: 'openai/gpt-5.5' } }
  });

  const siblingPath = path.join(tmpConfigDir, 'oh-my-openagent.jsonc');
  fs.writeFileSync(siblingPath, JSON.stringify({ agents: {} }, null, 2));

  const result = await buildProviderDiagnostics();

  // Hints should contain config-split warning strings with [CODE] prefix
  assert.ok(Array.isArray(result.hints), 'should have hints array');
  const staleHint = result.hints.find(h => h.includes('[STALE_SCHEMA_URL]'));
  assert.ok(staleHint, 'hints should include STALE_SCHEMA_URL warning');
  const siblingHint = result.hints.find(h => h.includes('[SIBLING_FILE_EXISTS]'));
  assert.ok(siblingHint, 'hints should include SIBLING_FILE_EXISTS warning');

  // Verify the warning objects are also in configSplit
  assert.ok(result.configSplit.warnings.some(w => w.code === 'STALE_SCHEMA_URL'), 'configSplit should have stale schema warning');
  assert.ok(result.configSplit.warnings.some(w => w.code === 'SIBLING_FILE_EXISTS'), 'configSplit should have sibling warning');

  // Cleanup sibling
  if (fs.existsSync(siblingPath)) fs.unlinkSync(siblingPath);

  console.log('    ✓ config-split warnings surface in provider diagnostics hints');
}

async function testProviderDiagnosticsConfigSplitWithOldPlugin() {
  console.log('  test: config-split detects old plugin name through provider diagnostics');

  clearCache();
  clearConfigs();

  writeModelsCache(['openai']);
  writeOpenCodeConfig({
    providers: { openai: { apiKey: 'test' } },
    plugins: ['oh-my-opencode']
  });
  writeOhMyOpenCodeConfig({ agents: { oracle: { model: 'openai/gpt-5.5' } } });

  const result = await buildProviderDiagnostics();

  assert.ok(result.configSplit.plugins.hasOldPlugin, 'should detect old plugin');
  const oldPluginHint = result.hints.find(h => h.includes('[OLD_PLUGIN_ONLY]'));
  assert.ok(oldPluginHint, 'hints should include OLD_PLUGIN_ONLY warning');

  console.log('    ✓ old plugin detected through provider diagnostics');
}

function writeLegacyModelsCache(models, timestamp = Date.now()) {
  const cache = { timestamp, models };
  fs.writeFileSync(modelsCachePath, JSON.stringify(cache, null, 2));
}

function testDeriveProvidersFromModelsBasic() {
  console.log('  test: deriveProvidersFromModels extracts canonical providers');

  const models = [
    { id: 'anthropic/claude-opus-4-6', providerID: 'anthropic' },
    { id: 'openai/gpt-5.5', providerID: 'openai' },
    { id: 'fireworks/accounts/fw/models/qwen-3' }
  ];

  const providers = deriveProvidersFromModels(models);

  assert.ok(providers.includes('anthropic'), 'should include anthropic');
  assert.ok(providers.includes('openai'), 'should include openai');
  assert.ok(providers.includes('fireworks-ai'), 'fireworks should normalize to fireworks-ai');
  assert.strictEqual(providers.length, 3, 'should have exactly 3 providers');

  console.log('    ✓ deriveProvidersFromModels extracts and normalizes providers');
}

function testDeriveProvidersFromModelsEdgeCases() {
  console.log('  test: deriveProvidersFromModels edge cases');

  // Empty/null
  assert.deepEqual(deriveProvidersFromModels([]), [], 'empty array returns empty');
  assert.deepEqual(deriveProvidersFromModels(null), [], 'null returns empty');
  assert.deepEqual(deriveProvidersFromModels(undefined), [], 'undefined returns empty');

  // Models without providerID use id prefix
  const noProviderID = [
    { id: 'deepseek/deepseek-v4' }
  ];
  const result = noProviderID && deriveProvidersFromModels(noProviderID);
  assert.ok(result.includes('deepseek'), 'should derive from id prefix');

  // Null/invalid model entries skipped
  const withNulls = [null, undefined, {}, { id: 123 }, { id: 'anthropic/claude-test' }];
  const derived = deriveProvidersFromModels(withNulls);
  assert.ok(derived.includes('anthropic'), 'should include anthropic from valid entry');
  assert.strictEqual(derived.length, 1, 'should skip null/invalid entries');

  // providerID-only (no id field)
  const providerIDOnly = [
    { providerID: 'anthropic' },
    { providerID: 'openai', id: null },
    { providerID: '', id: 'deepseek/v4' }
  ];
  const pidResult = deriveProvidersFromModels(providerIDOnly);
  assert.ok(pidResult.includes('anthropic'), 'should derive from providerID without id');
  assert.ok(pidResult.includes('openai'), 'should derive from providerID when id is null');
  assert.ok(pidResult.includes('deepseek'), 'should fall back to id prefix when providerID is empty');
  assert.strictEqual(pidResult.length, 3, 'should have 3 providers');

  // Deduplication
  const dupes = [
    { id: 'anthropic/claude-a' },
    { id: 'anthropic/claude-b', providerID: 'anthropic' },
    { id: 'Anthropic/claude-c', providerID: 'Anthropic' }
  ];
  const deduped = deriveProvidersFromModels(dupes);
  assert.strictEqual(deduped.length, 1, 'should dedupe normalized providers');

  console.log('    ✓ deriveProvidersFromModels handles edge cases');
}

function testLegacyCacheDiscoveredProviders() {
  console.log('  test: collectDiscoveredProviders derives providers from legacy cache (no providers key)');

  clearCache();
  clearConfigs();

  writeLegacyModelsCache([
    { id: 'anthropic/claude-test', providerID: 'anthropic' },
    { id: 'openai/gpt-test', providerID: 'openai' }
  ]);

  const result = collectDiscoveredProviders();

  assert.ok(result.discovered.includes('anthropic'), 'discovered should include anthropic');
  assert.ok(result.discovered.includes('openai'), 'discovered should include openai');
  assert.strictEqual(result.discovered.length, 2, 'should have exactly 2 discovered providers');
  assert.ok(result.warnings.some(w => w.includes('derived providers from model entries')),
    'should warn about derived providers');

  console.log('    ✓ legacy cache providers derived from model entries');
}

async function testLegacyCacheHealthCheckNonLive() {
  console.log('  test: resolveHealthModels derives providers from legacy cache in health check');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    providers: {
      anthropic: { apiKey: 'test-key' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'anthropic/claude-test' }
    }
  });
  writeLegacyModelsCache([
    { id: 'anthropic/claude-test', providerID: 'anthropic' }
  ]);

  const result = await buildProviderHealthCheck({ live: false });
  const anthropic = result.providers.find(p => p.provider === 'anthropic');

  assert.ok(anthropic, 'anthropic should be in health check results');
  assert.strictEqual(anthropic.visible, true, 'anthropic should be visible from derived providers');
  assert.ok(!JSON.stringify(result).includes('test-key'), 'must not emit API key values');

  console.log('    ✓ health check sees providers from legacy cache');
}

function testEmptyCacheHandling() {
  console.log('  test: empty models cache (no providers, no models) returns empty discovered');

  clearCache();
  clearConfigs();

  fs.writeFileSync(modelsCachePath, JSON.stringify({ timestamp: Date.now() }));

  const result = collectDiscoveredProviders();

  assert.strictEqual(result.discovered.length, 0, 'empty cache should yield empty discovered');
  assert.strictEqual(result.providersNormalized.length, 0, 'empty cache should yield empty providersNormalized');
  assert.strictEqual(result.cacheStatus.exists, true, 'cache should be detected as existing');

  console.log('    ✓ empty cache handled correctly');
}

async function testRefreshUsesInjectedModels() {
  console.log('  test: refresh=true uses injected fresh models');

  clearCache();
  clearConfigs();

  writeModelsCache(['anthropic'], Date.now(), [
    { id: 'anthropic/claude-test', providerID: 'anthropic' }
  ]);
  writeOpenCodeConfig({ providers: { anthropic: { apiKey: 'test' } } });
  writeOhMyOpenCodeConfig({ agents: { oracle: { model: 'anthropic/claude-test' } } });

  const result = await buildProviderDiagnostics({
    refresh: true,
    loadModels: async () => ({
      models: [{ id: 'xai/grok-4', providerID: 'xai' }],
      providers: ['xai'],
      warnings: []
    })
  });

  assert.ok(result.normalized.discovered.includes('xai'), 'refreshed discovered should include xai from injected loader');
  assert.ok(!result.normalized.discovered.includes('anthropic'), 'refreshed discovered should NOT include anthropic from cache');
  assert.ok(result.hints.length === 0 || !result.hints.some(h => h.includes('refresh failed')),
    'should have no refresh-failure warning');

  console.log('    ✓ refresh=true uses injected models');
}

async function testNoRefreshRemainsCacheOnly() {
  console.log('  test: no refresh remains cache-only');

  clearCache();
  clearConfigs();

  writeModelsCache(['anthropic'], Date.now(), [
    { id: 'anthropic/claude-test', providerID: 'anthropic' }
  ]);
  writeOpenCodeConfig({ providers: { anthropic: { apiKey: 'test' } } });
  writeOhMyOpenCodeConfig({ agents: { oracle: { model: 'anthropic/claude-test' } } });

  const result = await buildProviderDiagnostics({
    refresh: false,
    loadModels: async () => ({
      models: [{ id: 'xai/grok-4', providerID: 'xai' }],
      providers: ['xai'],
      warnings: []
    })
  });

  assert.ok(result.normalized.discovered.includes('anthropic'), 'cache-only discovered should include anthropic');
  assert.ok(!result.normalized.discovered.includes('xai'), 'cache-only discovered should NOT include xai from loader');

  console.log('    ✓ no refresh remains cache-only');
}

async function testRefreshFallsBackToCache() {
  console.log('  test: refresh failure falls back to cached diagnostics with warning');

  clearCache();
  clearConfigs();

  writeModelsCache(['openai'], Date.now(), [
    { id: 'openai/gpt-test', providerID: 'openai' }
  ]);
  writeOpenCodeConfig({ providers: { openai: { apiKey: 'test' } } });
  writeOhMyOpenCodeConfig({ agents: { oracle: { model: 'openai/gpt-test' } } });

  const result = await buildProviderDiagnostics({
    refresh: true,
    loadModels: async () => { throw new Error('simulated refresh failure'); }
  });

  assert.ok(result.normalized.discovered.includes('openai'), 'fallback discovered should include openai from cache');
  assert.ok(result.hints.some(h => h.includes('Model refresh failed')), 'hints should include refresh-failure warning');
  assert.ok(result.hints.some(h => h.includes('simulated refresh failure')), 'warning should include error detail');

  console.log('    ✓ refresh failure falls back to cache with warning');
}

async function testHealthCheckRefreshSuggestionForConfiguredAuthNotVisible() {
  console.log('  test: live health check adds suggestion=refresh_discovery for configured+auth+not-visible provider');

  clearCache();
  clearConfigs();

  // Configure xai with auth, but modelsResult has NO xai models (not visible)
  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: 'xai-suggestion-secret-should-not-leak' },
      openai: { apiKey: 'openai-secret-should-not-leak' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' },
      hephaestus: { model: 'openai/gpt-5.5' }
    }
  });

  // Only openai is visible, xai is NOT visible
  const result = await buildProviderHealthCheck({
    live: true,
    modelsResult: {
      providers: ['openai'],
      models: [
        { id: 'openai/gpt-5.5', providerID: 'openai' }
      ]
    },
    probeModel: async (modelId) => ({ ok: true })
  });

  const xai = result.providers.find(p => p.provider === 'xai');
  const openai = result.providers.find(p => p.provider === 'openai');

  // xai: configured=true, authPresent=true, visible=false
  assert.ok(xai, 'xai should be included');
  assert.strictEqual(xai.configured, true, 'xai should be configured');
  assert.strictEqual(xai.authPresent, true, 'xai auth should be present');
  assert.strictEqual(xai.visible, false, 'xai should NOT be visible');
  assert.strictEqual(xai.liveStatus, 'skipped', 'xai live status should be skipped');
  assert.strictEqual(xai.suggestion, 'refresh_discovery', 'xai should have suggestion=refresh_discovery');
  assert.ok(xai.reason.includes('refresh model discovery'), 'reason should mention refreshing model discovery');
  assert.strictEqual(xai.liveOk, null, 'xai liveOk should remain null');

  // openai: visible, should be probed normally
  assert.strictEqual(openai.configured, true, 'openai should be configured');
  assert.strictEqual(openai.visible, true, 'openai should be visible');
  assert.strictEqual(openai.liveStatus, 'ok', 'openai live probe should succeed');
  assert.strictEqual(openai.liveOk, true, 'openai liveOk should be true');
  assert.ok(!openai.suggestion, 'openai should not have suggestion');

  // No secrets leaked
  assert.ok(!JSON.stringify(result).includes('should-not-leak'), 'health check must not emit secret values');

  console.log('    ✓ refresh_discovery suggestion added for configured+auth+not-visible');
}

async function testHealthCheckRefreshSuggestionProbeNotCalled() {
  console.log('  test: live health check does NOT call probe when provider is not visible');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: 'xai-no-probe-secret' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' }
    }
  });

  // Track probe calls
  let probeCallCount = 0;
  const trackingProbe = async (modelId) => {
    probeCallCount++;
    throw new Error('Probe should NOT have been called for non-visible provider');
  };

  const result = await buildProviderHealthCheck({
    live: true,
    modelsResult: {
      providers: ['openai'], // xai NOT in providers
      models: [
        { id: 'openai/gpt-5.5', providerID: 'openai' }
      ]
    },
    probeModel: trackingProbe
  });

  const xai = result.providers.find(p => p.provider === 'xai');

  assert.strictEqual(xai.liveStatus, 'skipped', 'xai should be skipped');
  assert.strictEqual(xai.suggestion, 'refresh_discovery', 'xai should have suggestion');
  assert.strictEqual(probeCallCount, 0, 'probe should NOT have been called for non-visible provider');

  console.log('    ✓ probe not called for non-visible provider');
}

async function testHealthCheckNoSuggestionWhenNotConfiguredOrNoAuth() {
  console.log('  test: no refresh_discovery suggestion when provider is not configured or lacks auth');

  clearCache();
  clearConfigs();

  // No opencode.json provider config for xai, but agent assigns it
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' }
    }
  });

  const result = await buildProviderHealthCheck({
    live: true,
    modelsResult: {
      providers: ['openai'],
      models: [{ id: 'openai/gpt-5.5', providerID: 'openai' }]
    },
    probeModel: async () => ({ ok: true })
  });

  const xai = result.providers.find(p => p.provider === 'xai');

  // xai is expected from assignment but not configured in opencode.json and no auth
  assert.strictEqual(xai.visible, false, 'xai should not be visible');
  assert.strictEqual(xai.liveStatus, 'skipped', 'xai should be skipped');
  assert.ok(!xai.suggestion, 'xai should NOT have refresh_discovery (no config+auth)');
  assert.strictEqual(xai.liveOk, null, 'liveOk should be null');

  console.log('    ✓ no suggestion when provider lacks config or auth');
}

async function testLiveHealthCheckOmittedRefreshModelsDoesNotRefresh() {
  console.log('  test: live health check with omitted refreshModels does NOT refresh model discovery');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: 'test-key-omit-refresh' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' }
    }
  });
  writeModelsCache(['xai'], Date.now(), [
    { id: 'xai/grok-4.3', providerID: 'xai' }
  ]);

  // Prove the fix: omitted refreshModels must NOT auto-refresh even when live=true
  // (the old bug was: body.refreshModels === undefined ? live : body.refreshModels === true)

  let loaderCalled = false;
  const result = await buildProviderHealthCheck({
    live: true,
    modelsResult: {
      providers: ['xai'],
      models: [{ id: 'xai/grok-4.3', providerID: 'xai' }]
    },
    loadModels: async () => {
      loaderCalled = true;
      throw new Error('loadModels should NOT have been called');
    },
    probeModel: async () => ({ ok: true })
  });

  const xai = result.providers.find(p => p.provider === 'xai');

  assert.strictEqual(loaderCalled, false, 'loadModels should NOT be called when refreshModels is omitted');
  assert.strictEqual(xai.liveStatus, 'ok', 'xai probe should succeed using cache-only modelsResult');
  assert.strictEqual(xai.visible, true, 'xai should be visible from modelsResult');
  assert.strictEqual(result.liveRequested, true, 'live should be true');

  console.log('    ✓ omitted refreshModels does not trigger model refresh even with live=true');
}

async function testLiveHealthCheckExplicitRefreshModelsTrueDoesRefresh() {
  console.log('  test: live health check with explicit refreshModels=true uses fresh models');

  clearCache();
  clearConfigs();

  writeOpenCodeConfig({
    providers: {
      xai: { apiKey: 'test-key-explicit-refresh' }
    }
  });
  writeOhMyOpenCodeConfig({
    agents: {
      oracle: { model: 'xai/grok-4.3' }
    }
  });

  // Cache has stale data (openai only)
  writeModelsCache(['openai'], Date.now(), [
    { id: 'openai/gpt-5.5', providerID: 'openai' }
  ]);

  // modelsResult simulates fresh data after refresh — xai now visible
  const result = await buildProviderHealthCheck({
    live: true,
    refreshModels: true,
    modelsResult: {
      providers: ['xai', 'openai'],
      models: [
        { id: 'xai/grok-4.3-refreshed', providerID: 'xai' },
        { id: 'openai/gpt-5.5', providerID: 'openai' }
      ]
    },
    probeModel: async () => ({ ok: true })
  });

  const xai = result.providers.find(p => p.provider === 'xai');

  assert.strictEqual(xai.visible, true, 'xai should be visible from refreshed modelsResult');
  assert.strictEqual(xai.liveStatus, 'ok', 'xai should be probed successfully');
  assert.strictEqual(result.liveRequested, true, 'live should be true');

  console.log('    ✓ explicit refreshModels=true uses fresh models');
}

function testRouteBuildProviderHealthOptionsOmittedRefreshModels() {
  console.log('  test: buildProviderHealthOptions maps omitted refreshModels to false even with live=true');

  const { buildProviderHealthOptions } = require('../lib/server');

  const opts = buildProviderHealthOptions({ live: true });

  assert.strictEqual(opts.live, true, 'live should be true');
  assert.strictEqual(opts.refreshModels, false, 'refreshModels should be false when omitted');
  assert.strictEqual(opts.timeoutMs, 15000, 'timeoutMs should default to 15000');
  assert.strictEqual(opts.providers, undefined, 'providers should be undefined when omitted');

  console.log('    ✓ omitted refreshModels → false (route-level)');
}

function testRouteBuildProviderHealthOptionsExplicitRefreshTrue() {
  console.log('  test: buildProviderHealthOptions maps explicit refreshModels=true to true');

  const { buildProviderHealthOptions } = require('../lib/server');

  const opts = buildProviderHealthOptions({ live: true, refreshModels: true });

  assert.strictEqual(opts.live, true, 'live should be true');
  assert.strictEqual(opts.refreshModels, true, 'refreshModels should be true when explicitly set');
  assert.strictEqual(opts.timeoutMs, 15000, 'timeoutMs should default to 15000');

  console.log('    ✓ explicit refreshModels=true → true (route-level)');
}

function testRouteBuildProviderHealthOptionsExplicitRefreshFalse() {
  console.log('  test: buildProviderHealthOptions maps explicit refreshModels=false to false');

  const { buildProviderHealthOptions } = require('../lib/server');

  const opts = buildProviderHealthOptions({ live: true, refreshModels: false });

  assert.strictEqual(opts.live, true, 'live should be true');
  assert.strictEqual(opts.refreshModels, false, 'refreshModels should be false when explicitly false');

  console.log('    ✓ explicit refreshModels=false → false (route-level)');
}

function testRouteBuildProviderHealthOptionsNoLive() {
  console.log('  test: buildProviderHealthOptions defaults live=false, refreshModels=false');

  const { buildProviderHealthOptions } = require('../lib/server');

  const opts = buildProviderHealthOptions({});

  assert.strictEqual(opts.live, false, 'live should default to false');
  assert.strictEqual(opts.refreshModels, false, 'refreshModels should default to false');
  assert.strictEqual(opts.timeoutMs, 15000, 'timeoutMs should default to 15000');
  assert.strictEqual(opts.providers, undefined, 'providers should be undefined');

  console.log('    ✓ empty body defaults both to false (route-level)');
}

function testRouteBuildProviderHealthOptionsCustomTimeout() {
  console.log('  test: buildProviderHealthOptions passes through custom timeoutMs and providers');

  const { buildProviderHealthOptions } = require('../lib/server');

  const opts = buildProviderHealthOptions({
    live: false,
    timeoutMs: 5000,
    providers: ['xai', 'openai']
  });

  assert.strictEqual(opts.timeoutMs, 5000, 'timeoutMs should use provided value');
  assert.deepEqual(opts.providers, ['xai', 'openai'], 'providers should use provided value');

  console.log('    ✓ custom timeoutMs and providers pass through (route-level)');
}

// ============================================================================
// Run all tests
// ============================================================================

async function run() {
  console.log('provider-diagnostics-test: running...\n');

  await testDryRunSkeleton();
  testAuthDiagnosticsFromAuthFile();
  await testAuthDiagnosticsFromConfigAndEnv();
  await testProviderHealthCheckNonLive();
  await testProviderHealthCheckLiveWithInjectedProbe();
  testFireworksAliasNormalization();
  testMissingProviderWarning();
  testMalformedConfigHandling();
  testCacheStatusHandling();
  await testLMStudioPolicyFieldPresence();
  testExpectedSourcesExtraction();
  testSingularOpenCodeSchemaExtraction();
  testMismatchClassification();
  await testBuildDiagnosticsUsesStructuredExpectedSources();
  testDeterministicSorting();
  testVercelProviderNormalization();
  await testVercelProviderInDiagnostics();
  await testDryRunHasConfigSplitField();
  await testProviderDiagnosticsIncludesConfigSplit();
  await testConfigSplitWarningsSurfaceInHints();
  await testProviderDiagnosticsConfigSplitWithOldPlugin();
  testDeriveProvidersFromModelsBasic();
  testDeriveProvidersFromModelsEdgeCases();
  testLegacyCacheDiscoveredProviders();
  await testLegacyCacheHealthCheckNonLive();
  testEmptyCacheHandling();

  await testRefreshUsesInjectedModels();
  await testNoRefreshRemainsCacheOnly();
  await testRefreshFallsBackToCache();

  await testHealthCheckRefreshSuggestionForConfiguredAuthNotVisible();
  await testHealthCheckRefreshSuggestionProbeNotCalled();
  await testHealthCheckNoSuggestionWhenNotConfiguredOrNoAuth();

  await testLiveHealthCheckOmittedRefreshModelsDoesNotRefresh();
  await testLiveHealthCheckExplicitRefreshModelsTrueDoesRefresh();

  testRouteBuildProviderHealthOptionsOmittedRefreshModels();
  testRouteBuildProviderHealthOptionsExplicitRefreshTrue();
  testRouteBuildProviderHealthOptionsExplicitRefreshFalse();
  testRouteBuildProviderHealthOptionsNoLive();
  testRouteBuildProviderHealthOptionsCustomTimeout();

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

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => cleanup(tmpHome));
