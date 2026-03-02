#!/usr/bin/env node

/**
 * Test agent fallback override contract and persistence.
 * Tests:
 * - Roundtrip: write valid override, read it back
 * - Invalid entry: verify rejection of malformed entries
 * - Reset: verify single agent removal works
 *
 * Sets up a temp HOME before requiring any modules to avoid
 * interference from user's ~/.config/opencode/agent-fallback-overrides.json
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate HOME before requiring any project modules
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-overrides-test-'));
const tmpConfigDir = path.join(tmpHome, '.config', 'opencode');
fs.mkdirSync(tmpConfigDir, { recursive: true });
process.env.HOME = tmpHome;

// Clear module cache to ensure fresh load with isolated HOME
delete require.cache[require.resolve('../lib/constants')];

const constants = require('../lib/constants');

function run() {
  console.log('Testing agent fallback overrides...');

  // Test 1: Default envelope structure
  console.log('\n1. Testing default envelope structure...');
  {
    constants.invalidateAgentFallbackOverridesCache();
    const overrides = constants.getAgentFallbackOverrides();

    assert.ok(overrides, 'getAgentFallbackOverrides should return an object');
    assert.strictEqual(overrides.version, 1, 'Default version should be 1');
    assert.ok(overrides.updatedAt, 'Should have updatedAt');
    assert.ok(overrides.agents, 'Should have agents object');
    assert.strictEqual(Object.keys(overrides.agents).length, 0, 'Default agents should be empty');
    console.log('   ✓ Default envelope structure correct');
  }

  // Test 2: Roundtrip - write valid override, read it back
  console.log('\n2. Testing roundtrip (write then read)...');
  {
    const validOverride = {
      version: 1,
      agents: {
        sisyphus: {
          fallbackChain: [
            { providers: ['anthropic', 'github-copilot'], model: 'claude-opus-4-6', variant: 'max' }
          ]
        },
        oracle: {
          fallbackChain: [
            { providers: ['openai'], model: 'gpt-5.2' },
            { providers: ['google'], model: 'gemini-3-pro', variant: 'high' }
          ]
        }
      }
    };

    const saveResult = constants.saveAgentFallbackOverrides(validOverride);
    assert.ok(saveResult.success, `Save should succeed: ${saveResult.error || ''}`);
    console.log('   ✓ Save succeeded');

    // Invalidate cache and read back
    constants.invalidateAgentFallbackOverridesCache();
    const readBack = constants.getAgentFallbackOverrides();

    assert.strictEqual(readBack.version, 1, 'Read version should be 1');
    assert.ok(readBack.agents.sisyphus, 'Should have sisyphus');
    assert.ok(readBack.agents.oracle, 'Should have oracle');
    assert.strictEqual(readBack.agents.sisyphus.fallbackChain.length, 1, 'sisyphus should have 1 entry');
    assert.strictEqual(readBack.agents.oracle.fallbackChain.length, 2, 'oracle should have 2 entries');

    // Verify content
    const sisyphusEntry = readBack.agents.sisyphus.fallbackChain[0];
    assert.deepStrictEqual(sisyphusEntry.providers, ['anthropic', 'github-copilot'], 'Providers should match');
    assert.strictEqual(sisyphusEntry.model, 'claude-opus-4-6', 'Model should match');
    assert.strictEqual(sisyphusEntry.variant, 'max', 'Variant should match');
    console.log('   ✓ Read back data matches saved data');
  }

  // Test 3: Invalid entries should be rejected
  console.log('\n3. Testing invalid entry rejection...');
  {
    // 3a: Missing providers
    const missingProviders = {
      agents: {
        test: {
          fallbackChain: [
            { model: 'some-model' }  // missing providers
          ]
        }
      }
    };
    const result1 = constants.saveAgentFallbackOverrides(missingProviders);
    assert.ok(!result1.success, 'Should reject missing providers');
    assert.ok(result1.error.includes('providers'), 'Error should mention providers');
    console.log('   ✓ Rejected missing providers');

    // 3b: Empty providers array
    const emptyProviders = {
      agents: {
        test: {
          fallbackChain: [
            { providers: [], model: 'some-model' }
          ]
        }
      }
    };
    const result2 = constants.saveAgentFallbackOverrides(emptyProviders);
    assert.ok(!result2.success, 'Should reject empty providers array');
    console.log('   ✓ Rejected empty providers array');

    // 3c: Missing model
    const missingModel = {
      agents: {
        test: {
          fallbackChain: [
            { providers: ['anthropic'] }  // missing model
          ]
        }
      }
    };
    const result3 = constants.saveAgentFallbackOverrides(missingModel);
    assert.ok(!result3.success, 'Should reject missing model');
    assert.ok(result3.error.includes('model'), 'Error should mention model');
    console.log('   ✓ Rejected missing model');

    // 3d: Empty model string
    const emptyModel = {
      agents: {
        test: {
          fallbackChain: [
            { providers: ['anthropic'], model: '' }
          ]
        }
      }
    };
    const result4 = constants.saveAgentFallbackOverrides(emptyModel);
    assert.ok(!result4.success, 'Should reject empty model string');
    console.log('   ✓ Rejected empty model string');

    // 3e: Non-array fallbackChain
    const nonArrayChain = {
      agents: {
        test: {
          fallbackChain: 'not-an-array'
        }
      }
    };
    const result5 = constants.saveAgentFallbackOverrides(nonArrayChain);
    assert.ok(!result5.success, 'Should reject non-array fallbackChain');
    console.log('   ✓ Rejected non-array fallbackChain');

    // 3f: Invalid variant (empty string)
    const invalidVariant = {
      agents: {
        test: {
          fallbackChain: [
            { providers: ['anthropic'], model: 'claude-opus-4-6', variant: '' }
          ]
        }
      }
    };
    const result6 = constants.saveAgentFallbackOverrides(invalidVariant);
    assert.ok(!result6.success, 'Should reject empty variant string');
    console.log('   ✓ Rejected empty variant string');
  }

  // Test 4: Reset single agent override
  console.log('\n4. Testing reset single agent override...');
  {
    // First, save a multi-agent override
    const multiAgent = {
      agents: {
        sisyphus: {
          fallbackChain: [{ providers: ['anthropic'], model: 'claude-opus-4-6' }]
        },
        oracle: {
          fallbackChain: [{ providers: ['openai'], model: 'gpt-5.2' }]
        }
      }
    };
    constants.saveAgentFallbackOverrides(multiAgent);

    // Reset just sisyphus
    const resetResult = constants.resetAgentFallbackOverride('sisyphus');
    assert.ok(resetResult.success, `Reset should succeed: ${resetResult.error || ''}`);
    console.log('   ✓ Reset succeeded');

    // Verify oracle still exists
    constants.invalidateAgentFallbackOverridesCache();
    const afterReset = constants.getAgentFallbackOverrides();
    assert.ok(!afterReset.agents.sisyphus, 'sisyphus should be removed');
    assert.ok(afterReset.agents.oracle, 'oracle should still exist');
    console.log('   ✓ Only target agent was removed');

    // Reset non-existent agent should succeed (no-op)
    const resetNonExistent = constants.resetAgentFallbackOverride('nonexistent');
    assert.ok(resetNonExistent.success, 'Reset non-existent should succeed');
    console.log('   ✓ Reset non-existent agent is no-op');
  }

  // Test 5: Validation helper functions
  console.log('\n5. Testing validation helper functions...');
  {
    // validateFallbackEntry
    const validEntry = { providers: ['anthropic'], model: 'claude-opus-4-6' };
    const validResult = constants.validateFallbackEntry(validEntry);
    assert.ok(validResult.valid, 'Valid entry should pass');
    console.log('   ✓ validateFallbackEntry accepts valid entry');

    const invalidEntry = { providers: [], model: '' };
    const invalidResult = constants.validateFallbackEntry(invalidEntry);
    assert.ok(!invalidResult.valid, 'Invalid entry should fail');
    assert.ok(invalidResult.error, 'Should have error message');
    console.log('   ✓ validateFallbackEntry rejects invalid entry');

    // validateFallbackChain
    const validChain = [
      { providers: ['anthropic'], model: 'claude-opus-4-6' },
      { providers: ['openai'], model: 'gpt-5.2', variant: 'high' }
    ];
    const chainResult = constants.validateFallbackChain(validChain);
    assert.ok(chainResult.valid, 'Valid chain should pass');
    console.log('   ✓ validateFallbackChain accepts valid chain');

    const invalidChain = [
      { providers: ['anthropic'], model: 'claude-opus-4-6' },
      { providers: [], model: 'gpt-5.2' }  // invalid
    ];
    const invalidChainResult = constants.validateFallbackChain(invalidChain);
    assert.ok(!invalidChainResult.valid, 'Invalid chain should fail');
    assert.ok(invalidChainResult.errors.length > 0, 'Should have errors array');
    console.log('   ✓ validateFallbackChain rejects invalid chain');
  }

  // Test 6: Cache invalidation
  console.log('\n6. Testing cache invalidation...');
  {
    // Get current value (cached)
    const cached = constants.getAgentFallbackOverrides();

    // Modify file directly
    const filePath = constants.AGENT_FALLBACK_OVERRIDES_FILE;
    const directWrite = {
      version: 1,
      updatedAt: new Date().toISOString(),
      agents: {
        direct: {
          fallbackChain: [{ providers: ['google'], model: 'gemini-3-flash' }]
        }
      }
    };
    fs.writeFileSync(filePath, JSON.stringify(directWrite, null, 2));

    // Without invalidation, should still return cached
    const stillCached = constants.getAgentFallbackOverrides();
    assert.ok(!stillCached.agents.direct, 'Should still be cached');

    // After invalidation, should get fresh data
    constants.invalidateAgentFallbackOverridesCache();
    const fresh = constants.getAgentFallbackOverrides();
    assert.ok(fresh.agents.direct, 'Should have fresh data after invalidation');
    console.log('   ✓ Cache invalidation works correctly');
  }

  console.log('\n✅ All fallback override tests passed!');
}

run();

// Cleanup temp directory
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
cleanup(tmpHome);
