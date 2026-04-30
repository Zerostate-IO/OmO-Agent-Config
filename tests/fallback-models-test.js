#!/usr/bin/env node

const assert = require('assert');
const {
  isProviderModelId,
  extractModelId,
  normalizeFallbackModels,
  normalizeFallbackModelsRich,
  formatFallbackLabel,
  formatUpstreamFallbackLabel,
  sanitizeAgentFallbackConfig
} = require('../lib/core/fallback-models');

function run() {
  // ========================================
  // isProviderModelId tests
  // ========================================

  console.log('Testing isProviderModelId...');

  assert.strictEqual(isProviderModelId('openai/gpt-4'), true);
  assert.strictEqual(isProviderModelId('google/gemini-pro'), true);
  assert.strictEqual(isProviderModelId('anthropic/claude-opus-4'), true);
  assert.strictEqual(isProviderModelId('fireworks-ai/llama-3'), true);
  assert.strictEqual(isProviderModelId('fireworks-ai/accounts/fireworks/models/deepseek-v3p1'), true);
  assert.strictEqual(isProviderModelId('groq/llama-3.1-8b'), true);
  assert.strictEqual(isProviderModelId('azure/gpt-4o:latest'), true);
  assert.strictEqual(isProviderModelId(''), false);
  assert.strictEqual(isProviderModelId('   '), false);
  assert.strictEqual(isProviderModelId('openai'), false);
  assert.strictEqual(isProviderModelId('/gpt-4'), false);
  assert.strictEqual(isProviderModelId('openai/'), false);
  assert.strictEqual(isProviderModelId('/'), false);
  assert.strictEqual(isProviderModelId('provider with space/model'), false);
  assert.strictEqual(isProviderModelId(null), false);
  assert.strictEqual(isProviderModelId(undefined), false);
  assert.strictEqual(isProviderModelId(123), false);
  assert.strictEqual(isProviderModelId({}), false);
  assert.strictEqual(isProviderModelId([]), false);
  assert.strictEqual(isProviderModelId('  openai/gpt-4  '), true);
  assert.strictEqual(isProviderModelId('\topenai/gpt-4\n'), true);

  console.log('isProviderModelId: PASS');

  // ========================================
  // extractModelId tests
  // ========================================

  console.log('Testing extractModelId...');

  assert.strictEqual(extractModelId('openai/gpt-4'), 'openai/gpt-4');
  assert.strictEqual(extractModelId('  openai/gpt-4  '), 'openai/gpt-4');
  assert.strictEqual(extractModelId({ model: 'openai/gpt-4' }), 'openai/gpt-4');
  assert.strictEqual(extractModelId({ model: '  anthropic/claude-opus-4  ' }), 'anthropic/claude-opus-4');
  assert.strictEqual(extractModelId({ model: 'openai/gpt-4', variant: 'high' }), 'openai/gpt-4');
  assert.strictEqual(extractModelId(null), null);
  assert.strictEqual(extractModelId(undefined), null);
  assert.strictEqual(extractModelId(''), null);
  assert.strictEqual(extractModelId('invalid'), null);
  assert.strictEqual(extractModelId({}), null);
  assert.strictEqual(extractModelId({ model: '' }), null);
  assert.strictEqual(extractModelId({ model: 'invalid' }), null);
  assert.strictEqual(extractModelId({ model: 123 }), null);
  assert.strictEqual(extractModelId(123), null);
  assert.strictEqual(extractModelId([]), null);

  console.log('extractModelId: PASS');

  // ========================================
  // normalizeFallbackModels tests (backward compat)
  // ========================================

  console.log('Testing normalizeFallbackModels...');

  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'google/gemini-pro']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  {
    const result = normalizeFallbackModels('anthropic/claude-opus-4');
    assert.deepStrictEqual(result, ['anthropic/claude-opus-4']);
  }

  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  {
    const result = normalizeFallbackModels(['  openai/gpt-4  ', '\tgoogle/gemini-pro\t']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'invalid', 'google/gemini-pro', '']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  {
    const result = normalizeFallbackModels(['openai/gpt-4', 123, null, undefined, {}, [], 'google/gemini-pro']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  {
    const result = normalizeFallbackModels(null);
    assert.deepStrictEqual(result, []);
  }

  {
    const result = normalizeFallbackModels(undefined);
    assert.deepStrictEqual(result, []);
  }

  {
    const result = normalizeFallbackModels({ provider: 'openai', model: 'gpt-4' });
    assert.deepStrictEqual(result, []);
  }

  {
    const result = normalizeFallbackModels(123);
    assert.deepStrictEqual(result, []);
  }

  {
    const result = normalizeFallbackModels([]);
    assert.deepStrictEqual(result, []);
  }

  {
    const result = normalizeFallbackModels(['invalid', '', null, 123]);
    assert.deepStrictEqual(result, []);
  }

  // Objects with .model property now extract string IDs
  {
    const result = normalizeFallbackModels([
      { model: 'openai/gpt-4', variant: 'high' },
      'google/gemini-pro',
      { model: 'anthropic/claude-sonnet-4', temperature: 0.7 }
    ]);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet-4']);
  }

  // Dedup by model ID: object with same model as string
  {
    const result = normalizeFallbackModels([
      'openai/gpt-4',
      { model: 'openai/gpt-4', variant: 'high' }
    ]);
    assert.deepStrictEqual(result, ['openai/gpt-4']);
  }

  console.log('normalizeFallbackModels: PASS');

  // ========================================
  // normalizeFallbackModelsRich tests
  // ========================================

  console.log('Testing normalizeFallbackModelsRich...');

  // Strings preserved as strings
  {
    const result = normalizeFallbackModelsRich(['openai/gpt-4', 'google/gemini-pro']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
  }

  // Single string becomes array
  {
    const result = normalizeFallbackModelsRich('anthropic/claude-opus-4');
    assert.deepStrictEqual(result, ['anthropic/claude-opus-4']);
  }

  // Objects preserved with all properties
  {
    const input = [
      { model: 'openai/gpt-4', variant: 'high', reasoningEffort: 'extended' },
      { model: 'anthropic/claude-sonnet', temperature: 0.7, top_p: 0.9 }
    ];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].model, 'openai/gpt-4');
    assert.strictEqual(result[0].variant, 'high');
    assert.strictEqual(result[0].reasoningEffort, 'extended');
    assert.strictEqual(result[1].model, 'anthropic/claude-sonnet');
    assert.strictEqual(result[1].temperature, 0.7);
    assert.strictEqual(result[1].top_p, 0.9);
  }

  // Mixed string and object entries
  {
    const input = [
      'google/gemini-pro',
      { model: 'openai/gpt-4', variant: 'high' },
      'anthropic/claude-sonnet'
    ];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(typeof result[0], 'string');
    assert.strictEqual(result[0], 'google/gemini-pro');
    assert.strictEqual(typeof result[1], 'object');
    assert.strictEqual(result[1].model, 'openai/gpt-4');
    assert.strictEqual(result[1].variant, 'high');
    assert.strictEqual(typeof result[2], 'string');
    assert.strictEqual(result[2], 'anthropic/claude-sonnet');
  }

  // Dedup by model ID, preserving first occurrence shape
  {
    const input = [
      { model: 'openai/gpt-4', variant: 'high' },
      'openai/gpt-4'
    ];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(typeof result[0], 'object');
    assert.strictEqual(result[0].variant, 'high');
  }

  // Unknown fields preserved
  {
    const input = [
      { model: 'openai/gpt-4', customField: 'preserved', nested: { deep: true } }
    ];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result[0].customField, 'preserved');
    assert.deepStrictEqual(result[0].nested, { deep: true });
  }

  // All known fields preserved: variant, reasoningEffort, temperature, top_p, maxTokens, thinking
  {
    const input = [{
      model: 'openai/gpt-4',
      variant: 'high',
      reasoningEffort: 'extended',
      temperature: 0.5,
      top_p: 0.95,
      maxTokens: 4096,
      thinking: true,
      customExtra: 'unknown'
    }];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result[0].variant, 'high');
    assert.strictEqual(result[0].reasoningEffort, 'extended');
    assert.strictEqual(result[0].temperature, 0.5);
    assert.strictEqual(result[0].top_p, 0.95);
    assert.strictEqual(result[0].maxTokens, 4096);
    assert.strictEqual(result[0].thinking, true);
    assert.strictEqual(result[0].customExtra, 'unknown');
  }

  // Invalid entries filtered
  {
    const input = [
      'valid/model',
      { model: 'also/valid' },
      { noModel: true },
      'invalid',
      '',
      null,
      123,
      { model: '' },
      { model: 'no-slash' }
    ];
    const result = normalizeFallbackModelsRich(input);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(typeof result[0], 'string');
    assert.strictEqual(result[0], 'valid/model');
    assert.strictEqual(result[1].model, 'also/valid');
  }

  // Null/undefined return empty
  {
    assert.deepStrictEqual(normalizeFallbackModelsRich(null), []);
    assert.deepStrictEqual(normalizeFallbackModelsRich(undefined), []);
  }

  // Shallow clone: mutation of original doesn't affect result
  {
    const original = { model: 'openai/gpt-4', variant: 'high' };
    const input = [original];
    const result = normalizeFallbackModelsRich(input);
    original.variant = 'changed';
    assert.strictEqual(result[0].variant, 'high');
  }

  console.log('normalizeFallbackModelsRich: PASS');

  // ========================================
  // formatFallbackLabel tests
  // ========================================

  console.log('Testing formatFallbackLabel...');

  assert.strictEqual(formatFallbackLabel('openai/gpt-4'), 'openai/gpt-4');
  assert.strictEqual(formatFallbackLabel({ model: 'openai/gpt-4' }), 'openai/gpt-4');
  assert.strictEqual(formatFallbackLabel({ model: 'openai/gpt-4', variant: 'high' }), 'openai/gpt-4 (high)');
  assert.strictEqual(formatFallbackLabel({ model: 'openai/gpt-4', variant: 'high', reasoningEffort: 'extended' }), 'openai/gpt-4 (high, reasoning:extended)');
  assert.strictEqual(formatFallbackLabel({ model: 'openai/gpt-4', temperature: 0.7 }), 'openai/gpt-4');
  assert.strictEqual(formatFallbackLabel(null), '');
  assert.strictEqual(formatFallbackLabel(undefined), '');
  assert.strictEqual(formatFallbackLabel(''), '');
  assert.strictEqual(formatFallbackLabel({}), '(unknown)');

  // Never returns [object Object]
  assert.strictEqual(formatFallbackLabel({ model: 'test/model' }).includes('[object Object]'), false);
  assert.strictEqual(formatFallbackLabel({}).includes('[object Object]'), false);

  console.log('formatFallbackLabel: PASS');

  // ========================================
  // formatUpstreamFallbackLabel tests
  // ========================================

  console.log('Testing formatUpstreamFallbackLabel...');

  assert.strictEqual(formatUpstreamFallbackLabel('openai/gpt-4'), 'openai/gpt-4');
  assert.strictEqual(formatUpstreamFallbackLabel({ model: 'claude-opus-4', providers: ['anthropic', 'github-copilot'] }), 'claude-opus-4 via anthropic, github-copilot');
  assert.strictEqual(formatUpstreamFallbackLabel({ model: 'claude-opus-4', providers: ['anthropic'], variant: 'max' }), 'claude-opus-4 via anthropic max');
  assert.strictEqual(formatUpstreamFallbackLabel({ model: 'gpt-4', provider: 'openai' }), 'gpt-4 via openai');
  assert.strictEqual(formatUpstreamFallbackLabel(null), '');
  assert.strictEqual(formatUpstreamFallbackLabel({}), '{}');

  // Never returns [object Object]
  assert.strictEqual(formatUpstreamFallbackLabel({}).includes('[object Object]'), false);
  assert.strictEqual(formatUpstreamFallbackLabel({ model: 'test', providers: ['a'] }).includes('[object Object]'), false);

  console.log('formatUpstreamFallbackLabel: PASS');

  // ========================================
  // sanitizeAgentFallbackConfig tests
  // ========================================

  console.log('Testing sanitizeAgentFallbackConfig...');

  // Strings normalized
  {
    const input = { model: 'openai/gpt-4', fallback_models: ['  google/gemini-pro  ', 'anthropic/claude-opus-4'] };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.model, 'openai/gpt-4');
    assert.deepStrictEqual(result.fallback_models, ['google/gemini-pro', 'anthropic/claude-opus-4']);
  }

  // Objects preserved through sanitize
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: [
        { model: 'google/gemini-pro', variant: 'high', temperature: 0.5 },
        'anthropic/claude-sonnet'
      ]
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.fallback_models.length, 2);
    assert.strictEqual(result.fallback_models[0].model, 'google/gemini-pro');
    assert.strictEqual(result.fallback_models[0].variant, 'high');
    assert.strictEqual(result.fallback_models[0].temperature, 0.5);
    assert.strictEqual(result.fallback_models[1], 'anthropic/claude-sonnet');
  }

  // Empty fallback removed
  {
    const input = { model: 'openai/gpt-4', fallback_models: [] };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false);
  }

  // Invalid entries filtered, key removed
  {
    const input = { model: 'openai/gpt-4', fallback_models: ['invalid', '', null, 123] };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false);
  }

  // No fallback_models key: not added
  {
    const input = { model: 'openai/gpt-4' };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false);
  }

  // Single string normalized
  {
    const input = { model: 'openai/gpt-4', fallback_models: 'google/gemini-pro' };
    const result = sanitizeAgentFallbackConfig(input);
    assert.deepStrictEqual(result.fallback_models, ['google/gemini-pro']);
  }

  // Other config properties preserved
  {
    const input = { model: 'openai/gpt-4', fallback_models: ['google/gemini-pro'], variant: 'high', temperature: 0.7 };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.variant, 'high');
    assert.strictEqual(result.temperature, 0.7);
  }

  // Null/undefined input
  {
    assert.deepStrictEqual(sanitizeAgentFallbackConfig(null), {});
    assert.deepStrictEqual(sanitizeAgentFallbackConfig(undefined), {});
  }

  // Non-object input
  {
    assert.deepStrictEqual(sanitizeAgentFallbackConfig('invalid'), {});
    assert.deepStrictEqual(sanitizeAgentFallbackConfig(123), {});
  }

  console.log('sanitizeAgentFallbackConfig: PASS');

  console.log('\nAll unit tests passed!');
}

run();
