#!/usr/bin/env node

/**
 * Test fallback_models normalization logic in isolation.
 * 
 * Tests cover:
 * - Happy path: valid provider/model IDs
 * - Edge case: malformed entries (no slash, empty string, non-string, duplicates)
 * - Edge case: whitespace trimming
 * - Edge case: empty array resulting in key removal
 */

const assert = require('assert');
const {
  isProviderModelId,
  normalizeFallbackModels,
  sanitizeAgentFallbackConfig
} = require('../lib/core/fallback-models');

function run() {
  // ========================================
  // isProviderModelId tests
  // ========================================
  
  console.log('Testing isProviderModelId...');
  
  // Happy path
  assert.strictEqual(isProviderModelId('openai/gpt-4'), true, 'openai/gpt-4 should be valid');
  assert.strictEqual(isProviderModelId('google/gemini-pro'), true, 'google/gemini-pro should be valid');
  assert.strictEqual(isProviderModelId('anthropic/claude-opus-4'), true, 'anthropic/claude-opus-4 should be valid');
  assert.strictEqual(isProviderModelId('fireworks-ai/llama-3'), true, 'fireworks-ai/llama-3 should be valid');
  assert.strictEqual(isProviderModelId('groq/llama-3.1-8b'), true, 'groq/llama-3.1-8b should be valid');
  assert.strictEqual(isProviderModelId('azure/gpt-4o:latest'), true, 'azure/gpt-4o:latest should be valid (colon in model)');
  
  // Edge cases: invalid format
  assert.strictEqual(isProviderModelId(''), false, 'empty string should be invalid');
  assert.strictEqual(isProviderModelId('   '), false, 'whitespace only should be invalid');
  assert.strictEqual(isProviderModelId('openai'), false, 'missing slash should be invalid');
  assert.strictEqual(isProviderModelId('/gpt-4'), false, 'missing provider should be invalid');
  assert.strictEqual(isProviderModelId('openai/'), false, 'trailing slash should be invalid');
  assert.strictEqual(isProviderModelId('/'), false, 'just slash should be invalid');
  assert.strictEqual(isProviderModelId('openai/gpt/4'), false, 'multiple slashes should be invalid');
  assert.strictEqual(isProviderModelId('provider with space/model'), false, 'space in provider should be invalid');
  
  // Edge cases: wrong types
  assert.strictEqual(isProviderModelId(null), false, 'null should be invalid');
  assert.strictEqual(isProviderModelId(undefined), false, 'undefined should be invalid');
  assert.strictEqual(isProviderModelId(123), false, 'number should be invalid');
  assert.strictEqual(isProviderModelId({}), false, 'object should be invalid');
  assert.strictEqual(isProviderModelId([]), false, 'array should be invalid');
  
  // Edge cases: whitespace handling
  assert.strictEqual(isProviderModelId('  openai/gpt-4  '), true, 'valid with whitespace');
  assert.strictEqual(isProviderModelId('\topenai/gpt-4\n'), true, 'valid with tabs/newlines');
  
  console.log('isProviderModelId: PASS');
  
  // ========================================
  // normalizeFallbackModels tests
  // ========================================
  
  console.log('Testing normalizeFallbackModels...');
  
  // Happy path: valid array
  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'google/gemini-pro']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro'], 'should preserve valid entries');
  }
  
  // Happy path: single string converted to array
  {
    const result = normalizeFallbackModels('anthropic/claude-opus-4');
    assert.deepStrictEqual(result, ['anthropic/claude-opus-4'], 'single string should become array');
  }
  
  // Edge case: deduplication (preserves order)
  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro'], 'should deduplicate while preserving order');
  }
  
  // Edge case: whitespace trimming
  {
    const result = normalizeFallbackModels(['  openai/gpt-4  ', '\tgoogle/gemini-pro\t']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro'], 'should trim whitespace');
  }
  
  // Edge case: filter out invalid entries
  {
    const result = normalizeFallbackModels(['openai/gpt-4', 'invalid', 'google/gemini-pro', '']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro'], 'should filter invalid entries');
  }
  
  // Edge case: filter non-strings
  {
    const result = normalizeFallbackModels(['openai/gpt-4', 123, null, undefined, {}, [], 'google/gemini-pro']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro'], 'should filter non-strings');
  }
  
  // Edge case: null/undefined input
  {
    const result = normalizeFallbackModels(null);
    assert.deepStrictEqual(result, [], 'null should return empty array');
  }
  {
    const result = normalizeFallbackModels(undefined);
    assert.deepStrictEqual(result, [], 'undefined should return empty array');
  }
  
  // Edge case: invalid type
  {
    const result = normalizeFallbackModels({ provider: 'openai', model: 'gpt-4' });
    assert.deepStrictEqual(result, [], 'object should return empty array');
  }
  {
    const result = normalizeFallbackModels(123);
    assert.deepStrictEqual(result, [], 'number should return empty array');
  }
  
  // Edge case: empty array
  {
    const result = normalizeFallbackModels([]);
    assert.deepStrictEqual(result, [], 'empty array should return empty array');
  }
  
  // Edge case: all invalid entries
  {
    const result = normalizeFallbackModels(['invalid', '', null, 123]);
    assert.deepStrictEqual(result, [], 'all invalid should return empty array');
  }
  
  console.log('normalizeFallbackModels: PASS');
  
  // ========================================
  // sanitizeAgentFallbackConfig tests
  // ========================================
  
  console.log('Testing sanitizeAgentFallbackConfig...');
  
  // Happy path: normalize valid fallback_models
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: ['  google/gemini-pro  ', 'anthropic/claude-opus-4']
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.model, 'openai/gpt-4', 'model should be preserved');
    assert.deepStrictEqual(result.fallback_models, ['google/gemini-pro', 'anthropic/claude-opus-4'], 'fallback_models should be normalized');
    assert.notStrictEqual(result, input, 'should return new object');
  }
  
  // Edge case: remove empty fallback_models
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: []
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.model, 'openai/gpt-4', 'model should be preserved');
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false, 'empty fallback_models should be removed');
  }
  
  // Edge case: remove fallback_models when all entries invalid
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: ['invalid', '', null, 123]
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false, 'invalid fallback_models should be removed');
  }
  
  // Edge case: no fallback_models key
  {
    const input = {
      model: 'openai/gpt-4'
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.model, 'openai/gpt-4', 'model should be preserved');
    assert.strictEqual(result.hasOwnProperty('fallback_models'), false, 'no fallback_models key should not be added');
  }
  
  // Edge case: single string fallback_models
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: 'google/gemini-pro'
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.deepStrictEqual(result.fallback_models, ['google/gemini-pro'], 'single string should be normalized to array');
  }
  
  // Edge case: preserve other config properties
  {
    const input = {
      model: 'openai/gpt-4',
      fallback_models: ['google/gemini-pro'],
      variant: 'high',
      temperature: 0.7
    };
    const result = sanitizeAgentFallbackConfig(input);
    assert.strictEqual(result.model, 'openai/gpt-4', 'model should be preserved');
    assert.deepStrictEqual(result.fallback_models, ['google/gemini-pro'], 'fallback_models should be normalized');
    assert.strictEqual(result.variant, 'high', 'variant should be preserved');
    assert.strictEqual(result.temperature, 0.7, 'temperature should be preserved');
  }
  
  // Edge case: null/undefined input
  {
    const result = sanitizeAgentFallbackConfig(null);
    assert.deepStrictEqual(result, {}, 'null should return empty object');
  }
  {
    const result = sanitizeAgentFallbackConfig(undefined);
    assert.deepStrictEqual(result, {}, 'undefined should return empty object');
  }
  
  // Edge case: non-object input
  {
    const result = sanitizeAgentFallbackConfig('invalid');
    assert.deepStrictEqual(result, {}, 'string should return empty object');
  }
  {
    const result = sanitizeAgentFallbackConfig(123);
    assert.deepStrictEqual(result, {}, 'number should return empty object');
  }
  
  console.log('sanitizeAgentFallbackConfig: PASS');
  
  console.log('\nAll tests passed!');
}

run();
