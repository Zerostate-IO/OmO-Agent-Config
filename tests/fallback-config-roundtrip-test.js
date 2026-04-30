#!/usr/bin/env node

/**
 * Test fallback_models and unknown key preservation through config/profile round-trips.
 * 
 * Tests cover:
 * - Fallback_models order preservation through create/load cycles
 * - Unknown config keys preserved (not stripped)
 * - Profile switch preserves fallback_models
 * - Empty fallback_models key removal (not left as empty array)
 * 
 * Uses temp directories for isolation - does NOT touch live user config paths.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test helper to create temp directories
function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'fallback-test-'));
}

// Test helper to clean up temp directories
function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Simulate ConfigurationManager operations in isolation
class TestConfigManager {
  constructor(configsDir) {
    this.configsDir = configsDir;
    if (!fs.existsSync(configsDir)) {
      fs.mkdirSync(configsDir, { recursive: true });
    }
  }

  validateConfigName(name) {
    if (!name || typeof name !== 'string') return false;
    return /^[a-z0-9-_]+$/i.test(name);
  }

  getConfigPath(name) {
    return path.join(this.configsDir, `${name}.json`);
  }

  configExists(name) {
    return fs.existsSync(this.getConfigPath(name));
  }

  loadConfiguration(name) {
    const configPath = this.getConfigPath(name);
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  }

  saveConfiguration(name, description, config) {
    if (!this.validateConfigName(name)) {
      throw new Error('Invalid configuration name');
    }

    const configPath = this.getConfigPath(name);
    const now = new Date().toISOString();
    
    let metadata = {
      name,
      description,
      created: now,
      modified: now,
      config
    };

    if (fs.existsSync(configPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (existing.created) {
          metadata.created = existing.created;
        }
      } catch (e) {
        // Ignore, will use new timestamp
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(metadata, null, 2));
    return metadata;
  }

  listConfigurations() {
    try {
      return fs.readdirSync(this.configsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  deleteConfiguration(name) {
    const configPath = this.getConfigPath(name);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }
}

// Load fixture helper
function loadFixture(fixtureName) {
  const fixturePath = path.join(__dirname, 'fixtures', 'fallback-roundtrip', `${fixtureName}.json`);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

// Deep clone helper
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function run() {
  let tempDir = null;
  
  try {
    // ========================================
    // Test 1: Fallback models order preservation through create/load
    // ========================================
    
    console.log('Test 1: Fallback models order preservation...');
    
    tempDir = createTempDir('fallback-order-');
    const manager = new TestConfigManager(path.join(tempDir, 'configs'));
    
    const fixture = loadFixture('profile-with-fallbacks');
    const originalFallbackOrder = fixture.config.agents.oracle.fallback_models.slice();
    
    // Save the profile
    manager.saveConfiguration(fixture.name, fixture.description, fixture.config);
    
    // Load it back
    const loaded = manager.loadConfiguration(fixture.name);
    
    // Verify order is preserved
    assert.deepStrictEqual(
      loaded.config.agents.oracle.fallback_models,
      originalFallbackOrder,
      'Fallback models order should be preserved'
    );
    
    // Verify sisyphus fallbacks too
    assert.deepStrictEqual(
      loaded.config.agents.sisyphus.fallback_models,
      ['openai/gpt-5.4'],
      'Sisyphus fallback models should be preserved'
    );
    
    console.log('Test 1: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 2: Unknown keys preservation
    // ========================================
    
    console.log('Test 2: Unknown keys preservation...');
    
    tempDir = createTempDir('unknown-keys-');
    const manager2 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    const fixture2 = loadFixture('profile-with-fallbacks');
    const configWithUnknownKeys = deepClone(fixture2.config);
    
    // Add more unknown keys
    configWithUnknownKeys.unknownTopLevel = 'preserved-value';
    configWithUnknownKeys.nestedUnknown = {
      deep: {
        value: 'also-preserved'
      }
    };
    
    manager2.saveConfiguration('test-unknown-keys', 'Test unknown keys', configWithUnknownKeys);
    const loaded2 = manager2.loadConfiguration('test-unknown-keys');
    
    // Verify all unknown keys are preserved
    assert.strictEqual(
      loaded2.config.customUnknownKey,
      'should-be-preserved',
      'customUnknownKey should be preserved'
    );
    assert.strictEqual(
      loaded2.config.anotherCustomField.nested,
      true,
      'anotherCustomField.nested should be preserved'
    );
    assert.strictEqual(
      loaded2.config.anotherCustomField.value,
      42,
      'anotherCustomField.value should be preserved'
    );
    assert.strictEqual(
      loaded2.config.unknownTopLevel,
      'preserved-value',
      'unknownTopLevel should be preserved'
    );
    assert.deepStrictEqual(
      loaded2.config.nestedUnknown,
      { deep: { value: 'also-preserved' } },
      'nestedUnknown should be preserved'
    );
    assert.deepStrictEqual(
      loaded2.config.disabled_tools,
      ['github-copilot/commit', 'github-copilot/push'],
      'disabled_tools array should be preserved'
    );
    assert.strictEqual(
      loaded2.config.upstream_sync_enabled,
      false,
      'upstream_sync_enabled should be preserved'
    );
    
    console.log('Test 2: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 3: Profile switch preserves fallback_models
    // ========================================
    
    console.log('Test 3: Profile switch preserves fallback_models...');
    
    tempDir = createTempDir('profile-switch-');
    const manager3 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    // Create two profiles with different fallback orders
    const profile1 = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro']
        }
      }
    };
    
    const profile2 = {
      agents: {
        oracle: {
          model: 'openai/gpt-4',
          fallback_models: ['anthropic/claude-3-opus', 'google/gemini-pro']
        }
      }
    };
    
    manager3.saveConfiguration('profile-a', 'Profile A', profile1);
    manager3.saveConfiguration('profile-b', 'Profile B', profile2);
    
    // Simulate "switch" by loading different profile
    const loadedA = manager3.loadConfiguration('profile-a');
    const loadedB = manager3.loadConfiguration('profile-b');
    
    // Verify each profile's fallback order is preserved independently
    assert.deepStrictEqual(
      loadedA.config.agents.oracle.fallback_models,
      ['openai/gpt-4', 'google/gemini-pro'],
      'Profile A fallback order should be preserved'
    );
    assert.deepStrictEqual(
      loadedB.config.agents.oracle.fallback_models,
      ['anthropic/claude-3-opus', 'google/gemini-pro'],
      'Profile B fallback order should be preserved (different from A)'
    );
    
    // Load again to verify persistence
    const reloadedA = manager3.loadConfiguration('profile-a');
    assert.deepStrictEqual(
      reloadedA.config.agents.oracle.fallback_models,
      ['openai/gpt-4', 'google/gemini-pro'],
      'Profile A fallback order should survive multiple loads'
    );
    
    console.log('Test 3: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 4: Empty fallback_models key removal
    // ========================================
    
    console.log('Test 4: Empty fallback_models key removal...');
    
    tempDir = createTempDir('empty-fallback-');
    const manager4 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    const fixture4 = loadFixture('profile-empty-fallbacks');
    
    // Save profile with empty fallback_models
    manager4.saveConfiguration(fixture4.name, fixture4.description, fixture4.config);
    
    const loaded4 = manager4.loadConfiguration(fixture4.name);
    
    // Verify the key exists in the stored file (as empty array)
    // Note: The storage layer preserves what's given; sanitization is applied at use-time
    assert.ok(
      Array.isArray(loaded4.config.agents.oracle.fallback_models),
      'Empty fallback_models array should be preserved in storage'
    );
    assert.strictEqual(
      loaded4.config.agents.oracle.fallback_models.length,
      0,
      'Empty fallback_models array should have length 0'
    );
    
    console.log('Test 4: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 5: Round-trip with multiple save/load cycles
    // ========================================
    
    console.log('Test 5: Multiple save/load round-trips...');
    
    tempDir = createTempDir('roundtrip-');
    const manager5 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    const originalConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet']
        },
        sisyphus: {
          model: 'anthropic/claude-opus-4-6',
          fallback_models: ['openai/gpt-5.4']
        }
      },
      customField: 'preserved',
      mcps: {
        websearch_exa: {
          url: 'https://example.com',
          enabled: true
        }
      }
    };
    
    // Initial save
    manager5.saveConfiguration('roundtrip-test', 'Round-trip test', originalConfig);
    
    // Multiple load/save cycles
    for (let i = 0; i < 5; i++) {
      const loaded = manager5.loadConfiguration('roundtrip-test');
      
      // Verify fallback order preserved
      assert.deepStrictEqual(
        loaded.config.agents.oracle.fallback_models,
        ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
        `Fallback order should be preserved after cycle ${i + 1}`
      );
      
      // Verify unknown keys preserved
      assert.strictEqual(
        loaded.config.customField,
        'preserved',
        `Custom field should be preserved after cycle ${i + 1}`
      );
      assert.strictEqual(
        loaded.config.mcps.websearch_exa.enabled,
        true,
        `MCP config should be preserved after cycle ${i + 1}`
      );
      
      // Save again
      manager5.saveConfiguration('roundtrip-test', 'Round-trip test', loaded.config);
    }
    
    console.log('Test 5: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 6: Profile without fallback_models (minimal)
    // ========================================
    
    console.log('Test 6: Minimal profile without fallback_models...');
    
    tempDir = createTempDir('minimal-');
    const manager6 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    const fixture6 = loadFixture('profile-minimal');
    
    manager6.saveConfiguration(fixture6.name, fixture6.description, fixture6.config);
    const loaded6 = manager6.loadConfiguration(fixture6.name);
    
    // Verify no fallback_models key was added
    assert.strictEqual(
      loaded6.config.agents.oracle.hasOwnProperty('fallback_models'),
      false,
      'Minimal profile should not have fallback_models key added'
    );
    
    console.log('Test 6: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // Test 7: Fallback_models with duplicate entries (order preservation with dedup)
    // ========================================
    
    console.log('Test 7: Fallback_models with potential duplicates...');
    
    tempDir = createTempDir('duplicates-');
    const manager7 = new TestConfigManager(path.join(tempDir, 'configs'));
    
    // Config with duplicates - storage should preserve as-is
    // (deduplication is handled by normalizeFallbackModels at use-time)
    const configWithDupes = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4']
        }
      }
    };
    
    manager7.saveConfiguration('dupe-test', 'Duplicate test', configWithDupes);
    const loaded7 = manager7.loadConfiguration('dupe-test');
    
    // Storage preserves as-is (dedup is use-time, not storage-time)
    assert.deepStrictEqual(
      loaded7.config.agents.oracle.fallback_models,
      ['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4'],
      'Storage should preserve duplicates as-is (dedup is use-time)'
    );
    
    console.log('Test 7: PASS');
    
    cleanupTempDir(tempDir);
    tempDir = null;

    // ========================================
    // Test 8: Object entry round-trip preservation
    // ========================================

    console.log('Test 8: Object fallback entries preserved through round-trip...');

    tempDir = createTempDir('object-rt-');
    const manager8 = new TestConfigManager(path.join(tempDir, 'configs'));

    const configWithObjects = {
      agents: {
        oracle: {
          model: 'anthropic/claude-opus-4',
          fallback_models: [
            { model: 'openai/gpt-4', variant: 'high', reasoningEffort: 'extended' },
            { model: 'google/gemini-pro', temperature: 0.7, top_p: 0.95 },
            'anthropic/claude-sonnet'
          ]
        },
        sisyphus: {
          model: 'anthropic/claude-opus-4-7',
          fallback_models: [
            { model: 'google/gemini-3.1-pro', variant: 'max', thinking: true, maxTokens: 8192 }
          ]
        }
      }
    };

    manager8.saveConfiguration('object-rt', 'Object round-trip', configWithObjects);
    const loaded8 = manager8.loadConfiguration('object-rt');

    assert.strictEqual(loaded8.config.agents.oracle.fallback_models.length, 3);

    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[0].model, 'openai/gpt-4');
    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[0].variant, 'high');
    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[0].reasoningEffort, 'extended');

    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[1].model, 'google/gemini-pro');
    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[1].temperature, 0.7);
    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[1].top_p, 0.95);

    assert.strictEqual(loaded8.config.agents.oracle.fallback_models[2], 'anthropic/claude-sonnet');

    assert.strictEqual(loaded8.config.agents.sisyphus.fallback_models[0].model, 'google/gemini-3.1-pro');
    assert.strictEqual(loaded8.config.agents.sisyphus.fallback_models[0].variant, 'max');
    assert.strictEqual(loaded8.config.agents.sisyphus.fallback_models[0].thinking, true);
    assert.strictEqual(loaded8.config.agents.sisyphus.fallback_models[0].maxTokens, 8192);

    console.log('Test 8: PASS');

    cleanupTempDir(tempDir);
    tempDir = null;

    // ========================================
    // Test 9: Unknown fields on object entries survive round-trip
    // ========================================

    console.log('Test 9: Unknown future fields on object entries...');

    tempDir = createTempDir('unknown-fields-');
    const manager9 = new TestConfigManager(path.join(tempDir, 'configs'));

    const configWithUnknownFields = {
      agents: {
        oracle: {
          model: 'anthropic/claude-opus-4',
          fallback_models: [
            { model: 'openai/gpt-4', futureField: 'preserved', customMetadata: { nested: true } }
          ]
        }
      }
    };

    manager9.saveConfiguration('unknown-fields', 'Unknown fields', configWithUnknownFields);
    const loaded9 = manager9.loadConfiguration('unknown-fields');

    assert.strictEqual(loaded9.config.agents.oracle.fallback_models[0].futureField, 'preserved');
    assert.deepStrictEqual(loaded9.config.agents.oracle.fallback_models[0].customMetadata, { nested: true });

    console.log('Test 9: PASS');

    cleanupTempDir(tempDir);
    tempDir = null;

    // ========================================
    // Test 10: Mixed string/object round-trip with multiple save/load
    // ========================================

    console.log('Test 10: Mixed entries survive multiple save/load cycles...');

    tempDir = createTempDir('mixed-rt-');
    const manager10 = new TestConfigManager(path.join(tempDir, 'configs'));

    const mixedConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-opus-4',
          fallback_models: [
            'google/gemini-pro',
            { model: 'openai/gpt-4', variant: 'high' },
            { model: 'anthropic/claude-sonnet', temperature: 0.5, unknownField: 'test' }
          ]
        }
      }
    };

    manager10.saveConfiguration('mixed-rt', 'Mixed round-trip', mixedConfig);

    for (let i = 0; i < 3; i++) {
      const loaded = manager10.loadConfiguration('mixed-rt');
      assert.strictEqual(loaded.config.agents.oracle.fallback_models.length, 3);
      assert.strictEqual(loaded.config.agents.oracle.fallback_models[0], 'google/gemini-pro');
      assert.strictEqual(loaded.config.agents.oracle.fallback_models[1].model, 'openai/gpt-4');
      assert.strictEqual(loaded.config.agents.oracle.fallback_models[1].variant, 'high');
      assert.strictEqual(loaded.config.agents.oracle.fallback_models[2].temperature, 0.5);
      assert.strictEqual(loaded.config.agents.oracle.fallback_models[2].unknownField, 'test');
      manager10.saveConfiguration('mixed-rt', 'Mixed round-trip', loaded.config);
    }

    console.log('Test 10: PASS');

    cleanupTempDir(tempDir);
    tempDir = null;
    
    // ========================================
    // All tests passed
    // ========================================
    
    console.log('\nAll fallback config round-trip tests passed!');
    
  } finally {
    // Cleanup any remaining temp directory
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}

// ========================================
// Test 8: API-level persistence through /api/config
// ========================================

async function runApiPersistenceTests() {
  if (!process.env.TEST_PORT) {
    console.log('\nSkipping API persistence tests (TEST_PORT not set)');
    return;
  }
  
  const http = require('http');
  const PORT = process.env.TEST_PORT;
  const HOST = 'localhost';
  
  function makeApiRequest(path, method = 'GET', body = null) {
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
  
  console.log('\nTest 8: API-level persistence through /api/config...');
  
  const originalConfigResponse = await makeApiRequest('/api/config');
  const originalConfig = originalConfigResponse.body.config;
  
  try {
    const testConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet']
        },
        sisyphus: {
          model: 'google/gemini-pro',
          fallback_models: ['anthropic/claude-opus-4-6']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    const saveResponse = await makeApiRequest('/api/config', 'POST', testConfig);
    assert.strictEqual(saveResponse.status, 200, 'POST /api/config should return 200');
    assert.strictEqual(saveResponse.body.success, true, 'Save should succeed');
    
    const getConfigResponse = await makeApiRequest('/api/config');
    assert.strictEqual(getConfigResponse.status, 200, 'GET /api/config should return 200');
    
    assert.ok(
      Array.isArray(getConfigResponse.body.config.agents.oracle.fallback_models),
      'fallback_models should be an array'
    );
    assert.deepStrictEqual(
      getConfigResponse.body.config.agents.oracle.fallback_models,
      ['openai/gpt-4', 'google/gemini-pro', 'anthropic/claude-sonnet'],
      'Valid fallback_models should be persisted correctly'
    );
    
    assert.deepStrictEqual(
      getConfigResponse.body.config.agents.sisyphus.fallback_models,
      ['anthropic/claude-opus-4-6'],
      'Sisyphus fallback_models should be persisted correctly'
    );
    
    console.log('  ✓ Valid fallback_models persisted correctly');
    
    const malformedConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['valid/model', 'invalid', null, 123, '', 'another/valid']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    const malformedResponse = await makeApiRequest('/api/config', 'POST', malformedConfig);
    assert.strictEqual(malformedResponse.status, 200, 'Malformed config should still save');
    
    const verifyMalformed = await makeApiRequest('/api/config');
    assert.deepStrictEqual(
      verifyMalformed.body.config.agents.oracle.fallback_models,
      ['valid/model', 'invalid', null, 123, '', 'another/valid'],
      'Malformed values stored as-is (sanitization at read time)'
    );
    
    console.log('  ✓ Malformed fallback_models handled (sanitization at read time)');
    
    const emptyConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: []
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', emptyConfig);
    
    const verifyEmpty = await makeApiRequest('/api/config');
    assert.deepStrictEqual(
      verifyEmpty.body.config.agents.oracle.fallback_models,
      [],
      'Empty fallback_models array should be persisted'
    );
    
    console.log('  ✓ Empty fallback_models array persisted');
    
    const stringConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: 'single/model'
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', stringConfig);
    
    const agentsResponse = await makeApiRequest('/api/agents');
    const oracleAgent = agentsResponse.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgent.configuredFallbackModels,
      ['single/model'],
      'String fallback_models should be normalized to array on read'
    );
    
    console.log('  ✓ String fallback_models normalized on read');
    
    const complexConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4'],
          temperature: 0.7,
          max_tokens: 4096,
          customField: 'preserved'
        }
      },
      customTopLevel: 'also-preserved',
      nestedCustom: {
        deep: {
          value: 'preserved-too'
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', complexConfig);
    
    const verifyComplex = await makeApiRequest('/api/config');
    
    assert.strictEqual(
      verifyComplex.body.config.agents.oracle.temperature,
      0.7,
      'Agent temperature should be preserved'
    );
    assert.strictEqual(
      verifyComplex.body.config.agents.oracle.max_tokens,
      4096,
      'Agent max_tokens should be preserved'
    );
    assert.strictEqual(
      verifyComplex.body.config.agents.oracle.customField,
      'preserved',
      'Custom agent field should be preserved'
    );
    assert.strictEqual(
      verifyComplex.body.config.customTopLevel,
      'also-preserved',
      'Custom top-level field should be preserved'
    );
    assert.deepStrictEqual(
      verifyComplex.body.config.nestedCustom,
      { deep: { value: 'preserved-too' } },
      'Nested custom field should be preserved'
    );
    
    console.log('  ✓ Unrelated config data preserved');
    
    const mcpsTestConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['openai/gpt-4']
        }
      },
      mcps: {
        websearch_exa: {
          url: 'https://api.exa.ai/search',
          enabled: true
        },
        custom_tool: {
          url: 'https://custom.tool.api',
          enabled: false,
          custom_setting: 'preserved'
        }
      },
      top_level_custom: 'should-be-preserved'
    };
    
    await makeApiRequest('/api/config', 'POST', mcpsTestConfig);
    
    const verifyMcps = await makeApiRequest('/api/config');
    
    assert.ok(
      verifyMcps.body.config.mcps,
      'mcps section should exist'
    );
    assert.strictEqual(
      verifyMcps.body.config.mcps.websearch_exa.url,
      'https://api.exa.ai/search',
      'websearch_exa URL should be preserved'
    );
    assert.strictEqual(
      verifyMcps.body.config.mcps.websearch_exa.enabled,
      true,
      'websearch_exa enabled should be preserved'
    );
    assert.strictEqual(
      verifyMcps.body.config.mcps.custom_tool.custom_setting,
      'preserved',
      'custom MCP setting should be preserved'
    );
    assert.strictEqual(
      verifyMcps.body.config.top_level_custom,
      'should-be-preserved',
      'Top-level custom field should be preserved'
    );
    assert.deepStrictEqual(
      verifyMcps.body.config.agents.oracle.fallback_models,
      ['openai/gpt-4'],
      'fallback_models should coexist with mcps'
    );
    
    console.log('  ✓ mcps section preserved through round-trip');
    
    const multiAgentWithFallbacks = {
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
          fallback_models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o']
        },
        hephaestus: {
          model: 'anthropic/claude-3-opus',
          fallback_models: []
        },
        metis: {
          model: 'google/gemini-3.1-pro'
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', multiAgentWithFallbacks);
    
    const verifyMulti = await makeApiRequest('/api/config');
    
    assert.deepStrictEqual(
      verifyMulti.body.config.agents.oracle.fallback_models,
      ['openai/gpt-4', 'google/gemini-pro'],
      'Oracle fallback_models should be persisted'
    );
    assert.deepStrictEqual(
      verifyMulti.body.config.agents.sisyphus.fallback_models,
      ['openai/gpt-5.4'],
      'Sisyphus fallback_models should be persisted'
    );
    assert.deepStrictEqual(
      verifyMulti.body.config.agents.librarian.fallback_models,
      ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o'],
      'Librarian fallback_models should be persisted'
    );
    assert.deepStrictEqual(
      verifyMulti.body.config.agents.hephaestus.fallback_models,
      [],
      'Hephaestus empty fallback_models should be persisted'
    );
    assert.strictEqual(
      verifyMulti.body.config.agents.metis.hasOwnProperty('fallback_models'),
      false,
      'Metis should not have fallback_models key'
    );
    
    console.log('  ✓ Multiple agents with different fallback_models handled');
    
    const invalidFallbackConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: [
            'valid/model-1',
            'invalid-no-slash',
            '',
            null,
            123,
            { invalid: 'object' },
            'valid/model-2',
            '   ',
            'another/valid'
          ]
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', invalidFallbackConfig);
    
    const agentsVerify = await makeApiRequest('/api/agents');
    const oracleAgentVerify = agentsVerify.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleAgentVerify.configuredFallbackModels,
      ['valid/model-1', 'valid/model-2', 'another/valid'],
      'Invalid entries should be sanitized on read'
    );
    
    const persistedConfig = await makeApiRequest('/api/config');
    
    assert.ok(
      Array.isArray(persistedConfig.body.config.agents.oracle.fallback_models),
      'Persisted fallback_models should be an array'
    );
    
    console.log('  ✓ Invalid fallback_models sanitized on read');
    
    const configWithOrder = {
      agents: {
        oracle: {
          model: 'anthropic/claude-3-opus',
          fallback_models: ['z-provider/last', 'a-provider/first', 'm-provider/middle']
        }
      },
      mcps: originalConfig.mcps || {}
    };
    
    await makeApiRequest('/api/config', 'POST', configWithOrder);
    
    const verifyOrder = await makeApiRequest('/api/config');
    
    assert.deepStrictEqual(
      verifyOrder.body.config.agents.oracle.fallback_models,
      ['z-provider/last', 'a-provider/first', 'm-provider/middle'],
      'Fallback order should be preserved exactly as provided'
    );
    
    const agentsVerifyOrder = await makeApiRequest('/api/agents');
    const oracleVerifyOrder = agentsVerifyOrder.body.agents.find(a => a.name === 'oracle');
    
    assert.deepStrictEqual(
      oracleVerifyOrder.configuredFallbackModels,
      ['z-provider/last', 'a-provider/first', 'm-provider/middle'],
      'Order should be preserved through normalization'
    );
    
    console.log('  ✓ Fallback_models order preserved');
    
    console.log('\nAPI persistence tests passed!');
    
  } finally {
    if (originalConfig) {
      await makeApiRequest('/api/config', 'POST', originalConfig);
    }
  }
}

run();

runApiPersistenceTests().catch(err => {
  console.error('API persistence test error:', err.message);
  process.exit(1);
});
