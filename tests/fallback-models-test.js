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
  assert.strictEqual(isProviderModelId('fireworks-ai/accounts/fireworks/models/deepseek-v3p1'), true, 'nested Fireworks model IDs should be valid');
  assert.strictEqual(isProviderModelId('groq/llama-3.1-8b'), true, 'groq/llama-3.1-8b should be valid');
  assert.strictEqual(isProviderModelId('azure/gpt-4o:latest'), true, 'azure/gpt-4o:latest should be valid (colon in model)');
  
  // Edge cases: invalid format
  assert.strictEqual(isProviderModelId(''), false, 'empty string should be invalid');
  assert.strictEqual(isProviderModelId('   '), false, 'whitespace only should be invalid');
  assert.strictEqual(isProviderModelId('openai'), false, 'missing slash should be invalid');
  assert.strictEqual(isProviderModelId('/gpt-4'), false, 'missing provider should be invalid');
  assert.strictEqual(isProviderModelId('openai/'), false, 'trailing slash should be invalid');
  assert.strictEqual(isProviderModelId('/'), false, 'just slash should be invalid');
  assert.strictEqual(isProviderModelId('provider with space/model'), false, 'space in provider should be invalid');
  assert.strictEqual(isProviderModelId('openai/model with space'), false, 'space in model should be invalid');
  
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
  
  {
    const result = normalizeFallbackModels(['fireworks-ai/accounts/fireworks/models/deepseek-v3p1']);
    assert.deepStrictEqual(result, ['fireworks-ai/accounts/fireworks/models/deepseek-v3p1'], 'should preserve nested model paths');
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
  
  console.log('\nAll unit tests passed!');
}

// ========================================
// API-level tests (only run if TEST_PORT is set)
// ========================================

async function runApiTests() {
  const http = require('http');
  const PORT = process.env.TEST_PORT;
  
  if (!PORT) {
    console.log('\nSkipping API tests (TEST_PORT not set)');
    return;
  }
  
  const HOST = 'localhost';
  console.log(`\n${'='.repeat(60)}`);
  console.log('API-level tests for fallback sanitization');
  console.log(`${'='.repeat(60)}\n`);
  
  function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: method,
        timeout: 10000,
        headers: body ? { 'Content-Type': 'application/json' } : {}
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ 
              status: res.statusCode, 
              body: data ? JSON.parse(data) : null 
            });
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
  
  // Get initial config to restore later
  const initialConfig = await makeRequest('/api/config');
  const originalConfig = initialConfig.body;
  
  try {
    // ========================================
    // Test 1: Valid fallback_models array
    // ========================================
    
    console.log('Test 1: Valid fallback_models array...');
    
    const validConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    const saveResponse = await makeRequest('/api/config', 'POST', validConfig);
    assert.strictEqual(saveResponse.status, 200, 'POST /api/config should return 200');
    assert.strictEqual(saveResponse.body.success, true, 'Save should succeed');
    
    // Verify persisted by reading back via /api/agents
    const agentsResponse = await makeRequest('/api/agents');
    assert.strictEqual(agentsResponse.status, 200, 'GET /api/agents should return 200');
    
    const oracleAgent = agentsResponse.body.agents.find(a => a.name === 'oracle');
    assert.ok(oracleAgent, 'Oracle agent should exist');
    assert.deepStrictEqual(
      oracleAgent.configuredFallbackModels,
      ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
      'Valid fallback_models should be persisted and returned'
    );
    
    console.log('  ✓ Valid fallback_models array persisted correctly\n');
    
    // ========================================
    // Test 2: Invalid entries sanitized
    // ========================================
    
    console.log('Test 2: Invalid fallback_models entries sanitized...');
    
    const invalidEntriesConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: [
            'openai/gpt-4',     // valid
            'invalid-model',     // invalid (no slash)
            '',                  // invalid (empty)
            'google/gemini-pro', // valid
            null,                // invalid
            123,                 // invalid
            'anthropic/claude-sonnet' // valid
          ]
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', invalidEntriesConfig);
    
    const agentsResponse2 = await makeRequest('/api/agents');
    const oracleAgent2 = agentsResponse2.body.agents.find(a => a.name === 'oracle');
    
    // Invalid entries should be filtered out by normalizeFallbackModels
    assert.deepStrictEqual(
      oracleAgent2.configuredFallbackModels,
      ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
      'Invalid entries should be sanitized'
    );
    
    console.log('  ✓ Invalid entries filtered during read\n');
    
    // ========================================
    // Test 3: String format converted to array
    // ========================================
    
    console.log('Test 3: String fallback_models converted to array...');
    
    const stringConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: 'google/gemini-pro'  // single string
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', stringConfig);
    
    const agentsResponse3 = await makeRequest('/api/agents');
    const oracleAgent3 = agentsResponse3.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent3.configuredFallbackModels,
      ['google/gemini-pro'],
      'String fallback_models should be converted to array'
    );
    
    console.log('  ✓ String format converted to array\n');
    
    // ========================================
    // Test 4: Whitespace trimmed
    // ========================================
    
    console.log('Test 4: Whitespace in fallback_models trimmed...');
    
    const whitespaceConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['  openai/gpt-4  ', '\tgoogle/gemini-pro\t', '\nanthropic/claude-sonnet\n']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', whitespaceConfig);
    
    const agentsResponse4 = await makeRequest('/api/agents');
    const oracleAgent4 = agentsResponse4.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent4.configuredFallbackModels,
      ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
      'Whitespace should be trimmed from fallback_models'
    );
    
    console.log('  ✓ Whitespace trimmed from entries\n');
    
    // ========================================
    // Test 5: Duplicates removed while preserving order
    // ========================================
    
    console.log('Test 5: Duplicate fallback_models deduplicated...');
    
    const duplicateConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4', 'anthropic/claude-sonnet']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', duplicateConfig);
    
    const agentsResponse5 = await makeRequest('/api/agents');
    const oracleAgent5 = agentsResponse5.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent5.configuredFallbackModels,
      ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
      'Duplicates should be removed while preserving order'
    );
    
    console.log('  ✓ Duplicates removed, order preserved\n');
    
    // ========================================
    // Test 6: Unrelated config data preserved
    // ========================================
    
    console.log('Test 6: Unrelated config data preserved...');
    
    const configWithExtras = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4'],
          temperature: 0.7,
          max_tokens: 4096
        },
        sisyphus: {
          model: 'google/gemini-pro',
          fallback_models: ['anthropic/claude-sonnet'],
          variant: 'high'
        }
      },
      customTopLevel: 'preserved-value',
      nestedCustom: {
        deep: {
          value: 'also-preserved'
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', configWithExtras);
    
    // Read back the config
    const configResponse = await makeRequest('/api/config');
    
    assert.strictEqual(
      configResponse.body.customTopLevel,
      'preserved-value',
      'Top-level custom field should be preserved'
    );
    assert.deepStrictEqual(
      configResponse.body.nestedCustom,
      { deep: { value: 'also-preserved' } },
      'Nested custom field should be preserved'
    );
    assert.strictEqual(
      configResponse.body.agents.oracle.temperature,
      0.7,
      'Agent temperature should be preserved'
    );
    assert.strictEqual(
      configResponse.body.agents.oracle.max_tokens,
      4096,
      'Agent max_tokens should be preserved'
    );
    assert.strictEqual(
      configResponse.body.agents.sisyphus.variant,
      'high',
      'Agent variant should be preserved'
    );
    
    console.log('  ✓ Unrelated config data preserved\n');
    
    // ========================================
    // Test 7: Empty fallback_models array results in empty array
    // ========================================
    
    console.log('Test 7: Empty fallback_models array handled...');
    
    const emptyConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: []
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', emptyConfig);
    
    const agentsResponse7 = await makeRequest('/api/agents');
    const oracleAgent7 = agentsResponse7.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent7.configuredFallbackModels,
      [],
      'Empty fallback_models should result in empty array'
    );
    
    console.log('  ✓ Empty array handled correctly\n');
    
    // ========================================
    // Test 8: All invalid entries result in empty array
    // ========================================
    
    console.log('Test 8: All invalid entries result in empty array...');
    
    const allInvalidConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['invalid', '', null, 123, {}, []]
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', allInvalidConfig);
    
    const agentsResponse8 = await makeRequest('/api/agents');
    const oracleAgent8 = agentsResponse8.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent8.configuredFallbackModels,
      [],
      'All invalid entries should result in empty array'
    );
    
    console.log('  ✓ All invalid entries sanitized to empty array\n');
    
    // ========================================
    // Test 9: mcps section preserved during fallback_models updates
    // ========================================
    
    console.log('Test 9: mcps section preserved during fallback_models updates...');
    
    const configWithMcps = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4']
        }
      },
      mcps: {
        websearch_exa: {
          url: 'https://api.exa.ai/{env:EXA_API_KEY}',
          enabled: true
        },
        custom_mcp: {
          url: 'https://custom.mcp.server',
          enabled: false
        }
      }
    };
    
    await makeRequest('/api/config', 'POST', configWithMcps);
    
    const verifyMcps = await makeRequest('/api/config');
    
    assert.ok(
      verifyMcps.body.mcps,
      'mcps section should exist'
    );
    assert.deepStrictEqual(
      verifyMcps.body.mcps.websearch_exa,
      { url: 'https://api.exa.ai/{env:EXA_API_KEY}', enabled: true },
      'websearch_exa MCP should be preserved'
    );
    assert.deepStrictEqual(
      verifyMcps.body.mcps.custom_mcp,
      { url: 'https://custom.mcp.server', enabled: false },
      'custom_mcp MCP should be preserved'
    );
    assert.deepStrictEqual(
      verifyMcps.body.agents.oracle.fallback_models,
      ['openai/gpt-4'],
      'fallback_models should be persisted alongside mcps'
    );
    
    console.log('  ✓ mcps section preserved\n');
    
    // ========================================
    // Test 10: Multiple agents with different fallback_models
    // ========================================
    
    console.log('Test 10: Multiple agents with different fallback_models...');
    
    const multiAgentConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro']
        },
        sisyphus: {
          model: 'anthropic/claude-opus-4-6',
          fallback_models: ['openai/gpt-5.4']
        },
        librarian: {
          model: 'google/gemini-3-flash',
          fallback_models: ['anthropic/claude-sonnet-4-6']
        },
        hephaestus: {
          model: 'anthropic/claude-3-opus',
          fallback_models: [] // Empty array
        },
        metis: {
          model: 'google/gemini-3.1-pro'
          // No fallback_models key
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', multiAgentConfig);
    
    const agentsResponse10 = await makeRequest('/api/agents');
    
    const oracle10 = agentsResponse10.body.agents.find(a => a.name === 'oracle');
    const sisyphus10 = agentsResponse10.body.agents.find(a => a.name === 'sisyphus');
    const librarian10 = agentsResponse10.body.agents.find(a => a.name === 'librarian');
    const hephaestus10 = agentsResponse10.body.agents.find(a => a.name === 'hephaestus');
    const metis10 = agentsResponse10.body.agents.find(a => a.name === 'metis');
    
    assert.deepStrictEqual(
      oracle10.configuredFallbackModels,
      ['openai/gpt-4', 'google/gemini-pro'],
      'Oracle fallback_models should be correct'
    );
    assert.deepStrictEqual(
      sisyphus10.configuredFallbackModels,
      ['openai/gpt-5.4'],
      'Sisyphus fallback_models should be correct'
    );
    assert.deepStrictEqual(
      librarian10.configuredFallbackModels,
      ['anthropic/claude-sonnet-4-6'],
      'Librarian fallback_models should be correct'
    );
    assert.deepStrictEqual(
      hephaestus10.configuredFallbackModels,
      [],
      'Hephaestus empty fallback_models should be empty array'
    );
    assert.deepStrictEqual(
      metis10.configuredFallbackModels,
      [],
      'Metis without fallback_models key should return empty array'
    );
    
    console.log('  ✓ Multiple agents handled correctly\n');
    
    // ========================================
    // Test 11: Large fallback_models array
    // ========================================
    
    console.log('Test 11: Large fallback_models array performance...');
    
    // Create a large array of valid fallback models
    const largeFallbackArray = [];
    for (let i = 0; i < 50; i++) {
      largeFallbackArray.push(`provider${i}/model-${i}`);
    }
    
    const largeConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: largeFallbackArray
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    const startSave = Date.now();
    await makeRequest('/api/config', 'POST', largeConfig);
    const saveDuration = Date.now() - startSave;
    
    const startRead = Date.now();
    const agentsResponse11 = await makeRequest('/api/agents');
    const readDuration = Date.now() - startRead;
    
    const oracle11 = agentsResponse11.body.agents.find(a => a.name === 'oracle');
    
    assert.strictEqual(
      oracle11.configuredFallbackModels.length,
      50,
      'All 50 fallback_models should be persisted'
    );
    assert.strictEqual(
      oracle11.configuredFallbackModels[0],
      'provider0/model-0',
      'First fallback_model should be correct'
    );
    assert.strictEqual(
      oracle11.configuredFallbackModels[49],
      'provider49/model-49',
      'Last fallback_model should be correct'
    );
    
    // Performance check (should be fast)
    assert.ok(
      saveDuration < 2000,
      `Save should complete in < 2s (took ${saveDuration}ms)`
    );
    assert.ok(
      readDuration < 2000,
      `Read should complete in < 2s (took ${readDuration}ms)`
    );
    
    console.log(`  ✓ Large array handled (save: ${saveDuration}ms, read: ${readDuration}ms)\n`);
    
    // ========================================
    // Test 12: Fallback_models with special characters in model names
    // ========================================
    
    console.log('Test 12: Fallback_models with special characters...');
    
    const specialCharsConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: [
            'azure/gpt-4o:latest', // Colon in model name
            'custom-ai/model_v2.0', // Underscore and dot
            'provider-with-hyphen/model-name',
            'x.y.z/model' // Dots in provider
          ]
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeRequest('/api/config', 'POST', specialCharsConfig);
    
    const agentsResponse12 = await makeRequest('/api/agents');
    const oracle12 = agentsResponse12.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracle12.configuredFallbackModels,
      [
        'azure/gpt-4o:latest',
        'custom-ai/model_v2.0',
        'provider-with-hyphen/model-name',
        'x.y.z/model'
      ],
      'Special characters should be handled correctly'
    );
    
    console.log('  ✓ Special characters handled correctly\n');
    
    console.log('='.repeat(60));
    console.log('All API tests passed!');
    console.log('='.repeat(60));
    
  } finally {
    // Restore original config
    if (originalConfig) {
      await makeRequest('/api/config', 'POST', originalConfig);
    }
  }
}

// Run unit tests first, then API tests if TEST_PORT is set
run();
runApiTests().catch(err => {
  console.error('API test error:', err.message);
  process.exit(1);
});
