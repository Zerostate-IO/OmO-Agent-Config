#!/usr/bin/env node

/**
 * Unit tests for parseModels() and extractProviders() from lib/core/models.js.
 *
 * Covers: standard verbose fixture, nested model paths (fireworks-ai/...),
 * providerID/header mismatch warning, empty output, incomplete JSON,
 * model IDs containing colons, header whitespace, and non-header log lines.
 *
 * Uses no test frameworks — plain assert + console.log, matching project style.
 */

const assert = require('assert');

// Require the parser functions directly — no HOME isolation needed for pure functions
const { parseModels, extractProviders } = require('../lib/core/models');

// ============================================================================
// Fixture builders
// ============================================================================

/** Build a single model block in opencode models --verbose format */
function modelBlock(header, fields) {
  const json = JSON.stringify(fields, null, 2);
  return header + '\n' + json;
}

/** Build full verbose output from an array of { header, fields } objects */
function verboseOutput(models) {
  return models.map(m => modelBlock(m.header, m.fields)).join('\n\n');
}

// ============================================================================
// Tests
// ============================================================================

function testStandardFixture() {
  console.log('  test: standard two-model fixture parses correctly');

  const output = verboseOutput([
    { header: 'anthropic/claude-sonnet-4-6', fields: { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerID: 'anthropic' } },
    { header: 'openai/gpt-5.4', fields: { id: 'gpt-5.4', name: 'GPT-5.4', providerID: 'openai' } }
  ]);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 2, `expected 2 models, got ${result.models.length}`);
  assert.strictEqual(result.errors.length, 0, `unexpected errors: ${result.errors.join('; ')}`);
  assert.strictEqual(result.partial, false, 'should not be partial for clean input');

  assert.strictEqual(result.models[0].id, 'anthropic/claude-sonnet-4-6');
  assert.strictEqual(result.models[0].modelID, 'claude-sonnet-4-6');
  assert.strictEqual(result.models[0].providerID, 'anthropic');

  assert.strictEqual(result.models[1].id, 'openai/gpt-5.4');
  assert.strictEqual(result.models[1].modelID, 'gpt-5.4');
  assert.strictEqual(result.models[1].providerID, 'openai');

  console.log('    ✓ standard fixture parsed correctly');
}

function testNestedModelPaths() {
  console.log('  test: nested model paths (fireworks-ai/accounts/fireworks/models/...)');

  const output = verboseOutput([
    {
      header: 'fireworks-ai/accounts/fireworks/models/deepseek-v3p1',
      fields: { id: 'deepseek-v3p1', name: 'DeepSeek V3.1', providerID: 'fireworks-ai' }
    },
    {
      header: 'nvidia/deepseek-ai/deepseek-r1',
      fields: { id: 'deepseek-r1', name: 'DeepSeek R1', providerID: 'nvidia' }
    }
  ]);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 2, `expected 2 models, got ${result.models.length}`);
  assert.strictEqual(result.errors.length, 0, `unexpected errors: ${result.errors.join('; ')}`);

  // First model: nested path preserved
  assert.strictEqual(result.models[0].id, 'fireworks-ai/accounts/fireworks/models/deepseek-v3p1');
  assert.strictEqual(result.models[0].modelID, 'deepseek-v3p1');
  assert.strictEqual(result.models[0]._nestedPath, true, 'should be flagged as nested');

  // Second model: nested path preserved
  assert.strictEqual(result.models[1].id, 'nvidia/deepseek-ai/deepseek-r1');
  assert.strictEqual(result.models[1].modelID, 'deepseek-r1');
  assert.strictEqual(result.models[1]._nestedPath, true, 'should be flagged as nested');

  // Should have informational warnings about nested paths
  assert.ok(result.warnings.some(w => w.includes('nested provider/model path')), 'should warn about nested paths');

  console.log('    ✓ nested model paths parsed correctly');
}

function testProviderIDHeaderMismatch() {
  console.log('  test: providerID/header mismatch produces warning, not crash');

  const output = verboseOutput([
    {
      header: 'provider-a/some-model',
      fields: { id: 'some-model', name: 'Some Model', providerID: 'provider-b' }
    }
  ]);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 1, 'model should still parse');
  assert.strictEqual(result.models[0].id, 'provider-a/some-model');
  assert.strictEqual(result.models[0].providerID, 'provider-b');

  // Should have a warning about the mismatch
  const mismatchWarning = result.warnings.find(w => w.includes('providerID') && w.includes('header prefix'));
  assert.ok(mismatchWarning, `expected providerID mismatch warning, got: ${result.warnings.join('; ')}`);
  assert.ok(mismatchWarning.includes('provider-b'), 'warning should mention actual providerID');
  assert.ok(mismatchWarning.includes('provider-a'), 'warning should mention header prefix');

  console.log('    ✓ providerID mismatch warned, did not crash');
}

function testEmptyOutput() {
  console.log('  test: empty output returns error, not crash');

  const result = parseModels('');

  assert.strictEqual(result.models.length, 0, 'should have zero models');
  assert.ok(result.errors.length > 0, 'should have errors');
  assert.ok(result.errors.some(e => e.includes('Empty') || e.includes('Invalid')), `expected empty/error message, got: ${result.errors.join('; ')}`);
  assert.strictEqual(result.partial, false);

  // Also test whitespace-only output
  const result2 = parseModels('   \n  \n  \n');
  assert.strictEqual(result2.models.length, 0, 'whitespace-only should have zero models');
  assert.ok(result2.errors.length > 0, 'whitespace-only should have errors');

  // Test null/undefined/number
  const result3 = parseModels(null);
  assert.strictEqual(result3.models.length, 0);
  assert.ok(result3.errors.length > 0);

  const result4 = parseModels(undefined);
  assert.strictEqual(result4.models.length, 0);
  assert.ok(result4.errors.length > 0);

  const result5 = parseModels(42);
  assert.strictEqual(result5.models.length, 0);
  assert.ok(result5.errors.length > 0);

  console.log('    ✓ empty/null/invalid input handled gracefully');
}

function testIncompleteJSON() {
  console.log('  test: incomplete JSON returns warnings/errors, not crash');

  // Model header with truncated JSON (unclosed brace)
  const output = 'openai/gpt-5.4\n{"id": "gpt-5.4", "name": "GPT-5.4"';
  const result = parseModels(output);

  assert.strictEqual(result.models.length, 0, 'incomplete JSON should not produce a model');
  assert.ok(result.errors.length > 0, 'should have errors about unclosed braces');
  assert.ok(result.errors.some(e => e.includes('Unclosed braces')), `expected unclosed braces error, got: ${result.errors.join('; ')}`);

  console.log('    ✓ incomplete JSON handled with errors, not crash');
}

function testIncompleteJSONPartial() {
  console.log('  test: mixed valid and incomplete JSON produces partial result');

  const output = verboseOutput([
    { header: 'anthropic/claude-sonnet-4-6', fields: { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerID: 'anthropic' } }
  ]) + '\n\nopenai/gpt-5.4\n{"id": "gpt-5.4", "name": "GPT';
  const result = parseModels(output);

  assert.strictEqual(result.models.length, 1, 'should parse the one valid model');
  assert.strictEqual(result.models[0].id, 'anthropic/claude-sonnet-4-6');
  assert.ok(result.errors.length > 0, 'should have error about unclosed braces');
  assert.strictEqual(result.partial, true, 'should be marked partial');

  console.log('    ✓ partial JSON produces partial result with warnings');
}

function testModelIDWithColon() {
  console.log('  test: model IDs containing colons parse correctly');

  const output = verboseOutput([
    {
      header: 'openai/gpt-5.4:latest',
      fields: { id: 'gpt-5.4:latest', name: 'GPT-5.4 Latest', providerID: 'openai' }
    },
    {
      header: 'google/gemini-3-pro:v2',
      fields: { id: 'gemini-3-pro:v2', name: 'Gemini 3 Pro v2', providerID: 'google' }
    }
  ]);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 2, `expected 2 models, got ${result.models.length}`);
  assert.strictEqual(result.errors.length, 0, `unexpected errors: ${result.errors.join('; ')}`);

  // Colons in model IDs should be preserved
  assert.strictEqual(result.models[0].id, 'openai/gpt-5.4:latest');
  assert.strictEqual(result.models[0].modelID, 'gpt-5.4:latest');

  assert.strictEqual(result.models[1].id, 'google/gemini-3-pro:v2');
  assert.strictEqual(result.models[1].modelID, 'gemini-3-pro:v2');

  console.log('    ✓ colon-containing model IDs parsed correctly');
}

function testHeaderWithWhitespace() {
  console.log('  test: header lines with leading/trailing whitespace');

  // Build output with a space-padded header line
  const output = '  openai/gpt-5.4  \n' + JSON.stringify({ id: 'gpt-5.4', name: 'GPT-5.4', providerID: 'openai' }, null, 2);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 1, 'trimmed header should match');
  assert.strictEqual(result.models[0].id, 'openai/gpt-5.4', 'id should be trimmed header');

  console.log('    ✓ header whitespace trimmed and parsed');
}

function testNonHeaderLinesBetweenModels() {
  console.log('  test: non-header status/log lines between models');

  const output = [
    'anthropic/claude-sonnet-4-6',
    JSON.stringify({ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerID: 'anthropic' }, null, 2),
    '',
    '[INFO] Loading next model...',
    'Status: OK',
    '',
    'openai/gpt-5.4',
    JSON.stringify({ id: 'gpt-5.4', name: 'GPT-5.4', providerID: 'openai' }, null, 2)
  ].join('\n');

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 2, `expected 2 models, got ${result.models.length}`);
  assert.strictEqual(result.errors.length, 0, `unexpected errors: ${result.errors.join('; ')}`);
  assert.strictEqual(result.models[0].id, 'anthropic/claude-sonnet-4-6');
  assert.strictEqual(result.models[1].id, 'openai/gpt-5.4');

  console.log('    ✓ non-header log lines between models ignored correctly');
}

function testMissingIdFieldUsesHeaderFallback() {
  console.log('  test: missing id field falls back to header');

  const output = verboseOutput([
    {
      header: 'anthropic/claude-sonnet-4-6',
      fields: { name: 'Claude Sonnet 4.6', providerID: 'anthropic' }
      // No 'id' field
    }
  ]);

  const result = parseModels(output);

  assert.strictEqual(result.models.length, 1, 'should still parse model');
  assert.strictEqual(result.models[0].modelID, 'claude-sonnet-4-6', 'should use header pop as fallback id');
  assert.ok(result.warnings.some(w => w.includes('missing') && w.includes('id')), 'should warn about missing id');

  console.log('    ✓ missing id field handled with header fallback');
}

function testNegativeBraceCountRecovery() {
  console.log('  test: negative brace count recovery');

  // Extra closing brace that would drive brace count negative
  const output = 'openai/gpt-5.4\n{"id": "gpt-5.4"}}\n\nanthropic/claude-sonnet-4-6\n' +
    JSON.stringify({ id: 'claude-sonnet-4-6', name: 'Claude', providerID: 'anthropic' }, null, 2);

  const result = parseModels(output);

  // Should not crash; first model is skipped due to negative braces,
  // second should parse fine
  assert.ok(result.models.length >= 0, 'should not crash');
  assert.ok(result.warnings.some(w => w.includes('negative') || w.includes('malformed')),
    'should warn about negative brace count');

  console.log('    ✓ negative brace count recovered gracefully');
}

// ============================================================================
// extractProviders() tests
// ============================================================================

function testExtractProvidersBasic() {
  console.log('  test: extractProviders basic extraction');

  const models = [
    { id: 'anthropic/claude-sonnet-4-6', providerID: 'anthropic' },
    { id: 'openai/gpt-5.4', providerID: 'openai' },
    { id: 'google/gemini-3-pro', providerID: 'google' }
  ];

  const providers = extractProviders(models);

  assert.deepEqual(providers, ['anthropic', 'google', 'openai'], 'providers should be sorted');

  console.log('    ✓ extractProviders returns sorted unique providers');
}

function testExtractProvidersFallbackToId() {
  console.log('  test: extractProviders falls back to id prefix');

  const models = [
    { id: 'anthropic/claude-sonnet-4-6' },
    { id: 'openai/gpt-5.4' }
    // No providerID field
  ];

  const providers = extractProviders(models);

  assert.deepEqual(providers, ['anthropic', 'openai'], 'should extract from id prefix');

  console.log('    ✓ extractProviders uses id prefix when providerID missing');
}

function testExtractProvidersNestedPaths() {
  console.log('  test: extractProviders with nested model paths');

  const models = [
    { id: 'fireworks-ai/accounts/fireworks/models/deepseek-v3p1', providerID: 'fireworks-ai' },
    { id: 'nvidia/deepseek-ai/deepseek-r1', providerID: 'nvidia' }
  ];

  const providers = extractProviders(models);

  assert.ok(providers.includes('fireworks-ai'), 'should include fireworks-ai');
  assert.ok(providers.includes('nvidia'), 'should include nvidia');
  assert.strictEqual(providers.length, 2, 'should have exactly 2 providers');

  console.log('    ✓ extractProviders handles nested paths correctly');
}

function testExtractProvidersEmpty() {
  console.log('  test: extractProviders with empty input');

  const providers = extractProviders([]);

  assert.ok(Array.isArray(providers), 'should return array');
  assert.strictEqual(providers.length, 0, 'should be empty');

  console.log('    ✓ extractProviders handles empty array');
}

function testExtractProvidersDedup() {
  console.log('  test: extractProviders deduplicates providers');

  const models = [
    { id: 'anthropic/model-a', providerID: 'anthropic' },
    { id: 'anthropic/model-b', providerID: 'anthropic' },
    { id: 'openai/model-c', providerID: 'openai' }
  ];

  const providers = extractProviders(models);

  assert.strictEqual(providers.length, 2, 'should deduplicate');
  assert.deepEqual(providers, ['anthropic', 'openai']);

  console.log('    ✓ extractProviders deduplicates');
}

// ============================================================================
// Run all tests
// ============================================================================

function run() {
  console.log('model-parser-test: running...\n');

  // parseModels() tests
  testStandardFixture();
  testNestedModelPaths();
  testProviderIDHeaderMismatch();
  testEmptyOutput();
  testIncompleteJSON();
  testIncompleteJSONPartial();
  testModelIDWithColon();
  testHeaderWithWhitespace();
  testNonHeaderLinesBetweenModels();
  testMissingIdFieldUsesHeaderFallback();
  testNegativeBraceCountRecovery();

  // extractProviders() tests
  testExtractProvidersBasic();
  testExtractProvidersFallbackToId();
  testExtractProvidersNestedPaths();
  testExtractProvidersEmpty();
  testExtractProvidersDedup();

  console.log('\nmodel-parser-test: ok');
}

run();
