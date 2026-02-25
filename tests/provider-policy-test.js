#!/usr/bin/env node

/**
 * Test provider policy ranking logic in isolation.
 * Sets up a temp HOME before requiring any modules to avoid
 * interference from user's ~/.config/opencode/provider-policies.json
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate HOME before requiring any project modules
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-policy-test-'));
const tmpConfigDir = path.join(tmpHome, '.config', 'opencode');
fs.mkdirSync(tmpConfigDir, { recursive: true });
process.env.HOME = tmpHome;

// Clear module cache to ensure fresh load with isolated HOME
delete require.cache[require.resolve('../lib/constants')];
delete require.cache[require.resolve('../lib/core/models')];

const constants = require('../lib/constants');
const { rankProvider, formatModel } = require('../lib/core/models');

function run() {
  constants.invalidateProviderPoliciesCache();

  {
    const score = rankProvider('openai', { limit: { context: 0 } });
    assert.strictEqual(score, 10, 'openai missing-cost score should be tierScore only');
  }

  {
    const score = rankProvider('github-copilot', { limit: { context: 0 } });
    assert.strictEqual(score, 30, 'github-copilot missing-cost score should include -10 bonus');
  }

  {
    const m = formatModel({
      id: 'fireworks-ai/some-model',
      providerID: 'fireworks',
      name: 'Some Model',
      limit: { context: 128000 },
      capabilities: {},
      cost: { input: 1, output: 1 }
    });

    assert.strictEqual(constants.normalizeProviderName('fireworks'), 'fireworks-ai');
    assert.strictEqual(m.billingModel, 'metered');
    assert.strictEqual(m.speedTier, 'fast');
    assert.strictEqual(typeof m.priorityTier, 'number');
    assert.strictEqual(m.pricingSource, 'opencode');
    assert.ok(m.unitCost && typeof m.unitCost === 'object');
  }

  {
    const prevFireworks = constants.PROVIDER_POLICIES_DEFAULTS['fireworks-ai'].priorityTier;
    const prevOpenai = constants.PROVIDER_POLICIES_DEFAULTS['openai'].priorityTier;

    constants.PROVIDER_POLICIES_DEFAULTS['fireworks-ai'].priorityTier = 1;
    constants.PROVIDER_POLICIES_DEFAULTS['openai'].priorityTier = 2;
    constants.invalidateProviderPoliciesCache();

    const fwScore = rankProvider('fireworks-ai', { limit: { context: 0 }, cost: { input: 1, output: 1 } });
    const oaScore = rankProvider('openai', { limit: { context: 0 }, cost: { input: 1, output: 1 } });
    assert.ok(fwScore < oaScore, 'fireworks should outrank openai when priorityTier is better');

    constants.PROVIDER_POLICIES_DEFAULTS['fireworks-ai'].priorityTier = prevFireworks;
    constants.PROVIDER_POLICIES_DEFAULTS['openai'].priorityTier = prevOpenai;
    constants.invalidateProviderPoliciesCache();
  }
}

run();
console.log('provider-policy-test: ok');

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
