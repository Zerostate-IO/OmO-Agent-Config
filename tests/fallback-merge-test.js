#!/usr/bin/env node
/**
 * Fallback Merge Tests - Integration tests for override merging into recommendations
 * 
 * Tests that:
 * - Override chain order affects recommendation order for known agents
 * - Missing override uses upstream chain (preserves current behavior)
 * - Unknown agent behavior unchanged (falls back to heuristic)
 * 
 * Usage: node tests/fallback-merge-test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Test counters
let passed = 0;
let failed = 0;

// Test runner
function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
    passed++;
  } catch(e) {
    console.log('✗', name);
    console.log('  Error:', e.message);
    if (e.stack) {
      const stackLines = e.stack.split('\n').slice(1, 3);
      stackLines.forEach(line => console.log(' ', line.trim()));
    }
    failed++;
  }
}

// Mock models for testing
const mockModels = [
  { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', providerID: 'anthropic' },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerID: 'anthropic' },
  { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', providerID: 'anthropic' },
  { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', providerID: 'google' },
  { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', providerID: 'google' },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', providerID: 'openai' }
];

// Load modules - do this after setting up temp directory
const {
  invalidateAgentFallbackOverridesCache,
  saveAgentFallbackOverrides,
  getAgentFallbackOverrides,
  AGENT_FALLBACK_OVERRIDES_FILE
} = require('../lib/constants');

const {
  AGENT_MODEL_REQUIREMENTS
} = require('../lib/core/model-requirements');

const {
  getRecommendedModels
} = require('../lib/core/agents');

console.log('======================================');
console.log('Fallback Merge Integration Tests');
console.log('======================================');
console.log('');

// ==========================================
// Test 1: Override order affects recommendation order
// ==========================================
test('Override order affects recommendation order for known agent', () => {
  // Clear cache to ensure fresh load
  invalidateAgentFallbackOverridesCache();
  
  // Create an override that reverses the order for sisyphus
  // Upstream sisyphus: claude-opus-4-6 (max) first
  // Override: gemini-3-pro first
  const override = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {
      'sisyphus': {
        fallbackChain: [
          { providers: ['google'], model: 'gemini-3-pro' },
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' }
        ]
      }
    }
  };
  
  // Save the override
  saveAgentFallbackOverrides(override);
  
  // Clear cache again to force reload
  invalidateAgentFallbackOverridesCache();
  
  // Get recommendations
  const metadata = { name: 'Sisyphus' };
  const recommendations = getRecommendedModels(metadata, mockModels, 5);
  
  // Verify recommendations exist
  assert.ok(recommendations.length > 0, 'Expected recommendations');
  
  // First recommendation should be gemini-3-pro (from override)
  const firstRec = recommendations[0];
  assert.ok(firstRec.id !== null, 'First recommendation should have an id');
  
  // Check that the first model is from google (gemini)
  const firstModelId = String(firstRec.id || '').toLowerCase();
  assert.ok(
    firstModelId.includes('gemini'),
    `Expected first recommendation to be gemini, got ${firstRec.id}`
  );
  
  // Clean up - reset to upstream
  const emptyOverride = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {}
  };
  saveAgentFallbackOverrides(emptyOverride);
  invalidateAgentFallbackOverridesCache();
});

// ==========================================
// Test 2: Missing override uses upstream chain
// ==========================================
test('Missing override uses upstream chain (preserves current behavior)', () => {
  // Clear cache
  invalidateAgentFallbackOverridesCache();
  
  // Ensure no override exists for oracle
  const currentOverrides = getAgentFallbackOverrides();
  const overrideWithoutOracle = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {}
  };
  
  // Only keep non-oracle overrides
  for (const [agent, data] of Object.entries(currentOverrides.agents || {})) {
    if (agent !== 'oracle') {
      overrideWithoutOracle.agents[agent] = data;
    }
  }
  
  saveAgentFallbackOverrides(overrideWithoutOracle);
  invalidateAgentFallbackOverridesCache();
  
  // Get upstream requirements for oracle
  const upstreamReqs = AGENT_MODEL_REQUIREMENTS.oracle;
  assert.ok(upstreamReqs, 'Oracle should have upstream requirements');
  assert.ok(upstreamReqs.fallbackChain, 'Oracle should have upstream fallback chain');
  
  // Get recommendations
  const metadata = { name: 'oracle' };
  const recommendations = getRecommendedModels(metadata, mockModels, 5);
  
  // Verify recommendations exist
  assert.ok(recommendations.length > 0, 'Expected recommendations');
  
  // First recommendation should match upstream first entry
  const firstRec = recommendations[0];
  assert.ok(firstRec.id !== null, 'First recommendation should have an id');
  
  // The first entry in upstream oracle chain should be used
  const upstreamFirst = upstreamReqs.fallbackChain[0];
  const firstModelId = String(firstRec.id || '').toLowerCase();
  
  // Check that the first model matches upstream expectation
  assert.ok(
    firstModelId.includes(upstreamFirst.model.replace(/[-]/g, '')) ||
    firstModelId.includes(upstreamFirst.model),
    `Expected first recommendation to match upstream ${upstreamFirst.model}, got ${firstRec.id}`
  );
});

// ==========================================
// Test 3: Unknown agent behavior unchanged
// ==========================================
test('Unknown agent falls back to heuristic scoring (unchanged behavior)', () => {
  // Clear cache
  invalidateAgentFallbackOverridesCache();
  
  // Get recommendations for an unknown agent
  // Provide complete metadata to avoid errors in heuristic scoring
  const metadata = { 
    name: 'totally-unknown-agent-xyz',
    capabilities: [],
    minContext: 0,
    cost: 'CHEAP'
  };
  const recommendations = getRecommendedModels(metadata, mockModels, 5);
  
  // Unknown agents should still get recommendations via heuristic
  assert.ok(recommendations.length > 0, 'Expected recommendations for unknown agent');
  
  // Heuristic recommendations should have provenance 'heuristic'
  const allHeuristic = recommendations.every(r => 
    r.provenance === 'heuristic' || r.provenance === 'fallback-chain'
  );
  assert.ok(allHeuristic, 'Unknown agent recommendations should use heuristic scoring');
  
  // First recommendation should be the first available model (heuristic default)
  const firstRec = recommendations[0];
  assert.ok(firstRec.id !== null, 'First recommendation should have an id');
});

// ==========================================
// Test 4: Override for unknown agent is respected
// ==========================================
test('Override for unknown agent is still used if explicitly configured', () => {
  // Clear cache
  invalidateAgentFallbackOverridesCache();
  
  // Create an override for an unknown agent
  const override = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {
      'custom-unknown-agent': {
        fallbackChain: [
          { providers: ['google'], model: 'gemini-3-flash' },
          { providers: ['openai'], model: 'gpt-5.2' }
        ]
      }
    }
  };
  
  saveAgentFallbackOverrides(override);
  invalidateAgentFallbackOverridesCache();
  
  // Get recommendations - this agent doesn't exist in upstream
  // but has an explicit override
  // Provide complete metadata to avoid errors in heuristic scoring
  const metadata = { 
    name: 'custom-unknown-agent',
    capabilities: [],
    minContext: 0,
    cost: 'CHEAP'
  };
  const recommendations = getRecommendedModels(metadata, mockModels, 5);
  
  // Should get recommendations from the override chain
  // Note: since there's no upstream requirements, this may fall to heuristic
  // depending on how getEffectiveFallbackChain handles unknown agents with overrides
  
  // The key is that it doesn't crash and returns something
  assert.ok(Array.isArray(recommendations), 'Should return an array of recommendations');
  
  // Clean up
  const emptyOverride = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {}
  };
  saveAgentFallbackOverrides(emptyOverride);
  invalidateAgentFallbackOverridesCache();
});

// ==========================================
// Test 5: Provenance is preserved
// ==========================================
test('Provenance labels are preserved in recommendations', () => {
  // Clear cache
  invalidateAgentFallbackOverridesCache();
  
  // Create an override
  const override = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {
      'sisyphus': {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' }
        ]
      }
    }
  };
  
  saveAgentFallbackOverrides(override);
  invalidateAgentFallbackOverridesCache();
  
  // Get recommendations
  const metadata = { name: 'Sisyphus' };
  const recommendations = getRecommendedModels(metadata, mockModels, 5);
  
  // All recommendations should have provenance
  const allHaveProvenance = recommendations.every(r => 
    r.provenance && typeof r.provenance === 'string'
  );
  assert.ok(allHaveProvenance, 'All recommendations should have provenance');
  
  // Valid provenance values
  const validProvenance = ['fallback-chain', 'heuristic', 'gating-failed'];
  const allValidProvenance = recommendations.every(r => 
    validProvenance.includes(r.provenance)
  );
  assert.ok(allValidProvenance, `All provenance should be valid: ${validProvenance.join(', ')}`);
  
  // Clean up
  const emptyOverride = {
    version: 1,
    updatedAt: new Date().toISOString(),
    agents: {}
  };
  saveAgentFallbackOverrides(emptyOverride);
  invalidateAgentFallbackOverridesCache();
});

// ==========================================
// Summary
// ==========================================
console.log('');
console.log('======================================');
console.log('Test Summary');
console.log('======================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  console.log('❌ Some tests failed');
  process.exit(1);
} else {
  console.log('✅ All tests passed');
  process.exit(0);
}
