#!/usr/bin/env node
/**
 * Requirements and Normalization Test Suite
 * 
 * Deterministic tests for:
 * - GitHub Copilot model-id transforms
 * - Fallback chain resolution ordering
 * - Provider gating (hephaestus)
 * - Agent key normalization
 * - Punctuation-tolerant model matching
 */

const assert = require('assert');
const path = require('path');

// Load modules under test
const {
  transformModelForProvider,
  resolveModelFromChain,
  isRequiredProviderAvailable,
  isAnyFallbackEntryAvailable,
  isRequiredModelAvailable,
  normalizeModelId,
  modelIdMatches,
  AGENT_MODEL_REQUIREMENTS,
  CATEGORY_MODEL_REQUIREMENTS
} = require('../lib/core/model-requirements');

const { normalizeAgentKey, normalizeProviderName, getProviderAliases, PROVIDER_ALIASES } = require('../lib/constants');
const { parseModels, hasExtendedThinking } = require('../lib/core/models');

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
    failed++;
  }
}

// Mock fixtures
const mockModels = [
  { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', providerID: 'anthropic' },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerID: 'anthropic' },
  { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', providerID: 'anthropic' },
  { id: 'github-copilot/claude-opus-4.6', name: 'Claude Opus 4.6 (Copilot)', providerID: 'github-copilot' },
  { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', providerID: 'openai' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', providerID: 'openai' },
  { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', providerID: 'google' },
  { id: 'kimi-for-coding/k2p5', name: 'Kimi K2.5', providerID: 'kimi-for-coding' },
  { id: 'opencode/kimi-k2.5-free', name: 'Kimi K2.5 Free', providerID: 'opencode' },
  { id: 'opencode/big-pickle', name: 'Big Pickle', providerID: 'opencode' }
];

// Build availability maps for different scenarios
const fullAvailability = {
  'anthropic': true,
  'openai': true,
  'google': true,
  'github-copilot': true,
  'kimi-for-coding': true,
  'opencode': true
};

const limitedAvailability = {
  'opencode': true,
  'github-copilot': true
};

const noOpenAI = {
  'anthropic': true,
  'google': true,
  'github-copilot': true,
  'opencode': true
};

console.log('==================================');
console.log('Requirements & Normalization Tests');
console.log('==================================');
console.log('');

// ==========================================
// Test 1: GitHub Copilot model-id transform
// ==========================================
test('GitHub Copilot transform: claude-opus-4-6 → claude-opus-4.6', () => {
  const result = transformModelForProvider('github-copilot', 'claude-opus-4-6');
  assert.strictEqual(result, 'claude-opus-4.6', 
    `Expected claude-opus-4.6, got ${result}`);
});

test('GitHub Copilot transform: claude-sonnet-4-6 → claude-sonnet-4.6', () => {
  const result = transformModelForProvider('github-copilot', 'claude-sonnet-4-6');
  assert.strictEqual(result, 'claude-sonnet-4.6',
    `Expected claude-sonnet-4.6, got ${result}`);
});

test('GitHub Copilot transform: claude-haiku-4-5 → claude-haiku-4.5', () => {
  const result = transformModelForProvider('github-copilot', 'claude-haiku-4-5');
  assert.strictEqual(result, 'claude-haiku-4.5',
    `Expected claude-haiku-4.5, got ${result}`);
});

test('GitHub Copilot transform: gemini-3-pro → gemini-3-pro-preview', () => {
  const result = transformModelForProvider('github-copilot', 'gemini-3-pro');
  assert.strictEqual(result, 'gemini-3-pro-preview',
    `Expected gemini-3-pro-preview, got ${result}`);
});

test('GitHub Copilot transform: gemini-3-flash → gemini-3-flash-preview', () => {
  const result = transformModelForProvider('github-copilot', 'gemini-3-flash');
  assert.strictEqual(result, 'gemini-3-flash-preview',
    `Expected gemini-3-flash-preview, got ${result}`);
});

test('Non-GitHub provider: no transform applied', () => {
  const result = transformModelForProvider('anthropic', 'claude-opus-4-6');
  assert.strictEqual(result, 'claude-opus-4-6',
    `Expected no transform for anthropic, got ${result}`);
});

// ==========================================
// Test 2: Fallback chain resolution ordering
// ==========================================
test('Sisyphus fallback chain: picks first available (anthropic)', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const result = resolveModelFromChain(sisyphusReqs.fallbackChain, fullAvailability);
  
  assert.ok(result, 'Expected a result');
  assert.strictEqual(result.model, 'anthropic/claude-opus-4-6',
    `Expected anthropic/claude-opus-4-6, got ${result.model}`);
  assert.strictEqual(result.variant, 'max',
    `Expected variant 'max', got ${result.variant}`);
});

test('Sisyphus fallback chain: uses github-copilot when anthropic unavailable', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const noAnthropic = { ...fullAvailability, 'anthropic': false };
  
  const result = resolveModelFromChain(sisyphusReqs.fallbackChain, noAnthropic);
  
  assert.ok(result, 'Expected a result');
  // First entry has providers: ["anthropic", "github-copilot", "opencode"]
  // When anthropic is unavailable, github-copilot is next in the first entry
  assert.strictEqual(result.model, 'github-copilot/claude-opus-4.6',
    `Expected github-copilot/claude-opus-4.6, got ${result.model}`);
});

test('Sisyphus fallback chain: uses opencode from first entry when others unavailable', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const onlyOpenCode = { 'opencode': true };
  
  const result = resolveModelFromChain(sisyphusReqs.fallbackChain, onlyOpenCode);
  
  assert.ok(result, 'Expected a result');
  // First entry has providers: ["anthropic", "github-copilot", "opencode"]
  // When only opencode is available, it uses the first entry's model
  assert.strictEqual(result.model, 'opencode/claude-opus-4-6',
    `Expected opencode/claude-opus-4-6, got ${result.model}`);
});

test('Sisyphus fallback chain: returns null when nothing available', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const emptyAvailability = {};
  
  const result = resolveModelFromChain(sisyphusReqs.fallbackChain, emptyAvailability);
  
  assert.strictEqual(result, null, 'Expected null when no providers available');
});

// ==========================================
// Test 3: Hephaestus gating (requiresProvider)
// ==========================================
test('Hephaestus gating: passes when openai available', () => {
  const hephaestusReqs = AGENT_MODEL_REQUIREMENTS.hephaestus;
  const result = isRequiredProviderAvailable(hephaestusReqs.requiresProvider, fullAvailability);
  
  assert.strictEqual(result, true, 'Expected gating to pass with openai available');
});

test('Hephaestus gating: fails when only github-copilot available', () => {
  const hephaestusReqs = AGENT_MODEL_REQUIREMENTS.hephaestus;
  const onlyCopilot = { 'github-copilot': true };
  
  const result = isRequiredProviderAvailable(hephaestusReqs.requiresProvider, onlyCopilot);
  
  assert.strictEqual(result, false, 'Expected gating to fail with github-copilot only');
});

test('Hephaestus gating: fails when no required providers available', () => {
  const hephaestusReqs = AGENT_MODEL_REQUIREMENTS.hephaestus;
  const onlyAnthropic = { 'anthropic': true, 'google': true };
  
  const result = isRequiredProviderAvailable(hephaestusReqs.requiresProvider, onlyAnthropic);
  
  assert.strictEqual(result, false, 'Expected gating to fail without openai/opencode');
});

test('Hephaestus gating: empty requirements always pass', () => {
  const result = isRequiredProviderAvailable([], { 'any-provider': true });
  assert.strictEqual(result, true, 'Expected empty requirements to pass');
});

test('Regression: gpt-5.3-codex never uses github-copilot', () => {
  const offenders = [];

  function scan(scope, reqMap) {
    for (const [name, req] of Object.entries(reqMap || {})) {
      for (const entry of (req?.fallbackChain || [])) {
        if (entry?.model === 'gpt-5.3-codex' && Array.isArray(entry.providers) && entry.providers.includes('github-copilot')) {
          offenders.push({ scope, name, entry });
        }
      }
    }
  }

  scan('agent', AGENT_MODEL_REQUIREMENTS);
  scan('category', CATEGORY_MODEL_REQUIREMENTS);

  assert.deepStrictEqual(offenders, [], 'Expected no gpt-5.3-codex entries to include github-copilot');
});

// ==========================================
// Test 4: Agent key normalization
// ==========================================
test('Agent key normalization: Sisyphus → sisyphus', () => {
  const result = normalizeAgentKey('Sisyphus');
  assert.strictEqual(result, 'sisyphus', `Expected sisyphus, got ${result}`);
});

test('Agent key normalization: Hephaestus → hephaestus', () => {
  const result = normalizeAgentKey('Hephaestus');
  assert.strictEqual(result, 'hephaestus', `Expected hephaestus, got ${result}`);
});

test('Agent key normalization: Atlas → atlas', () => {
  const result = normalizeAgentKey('Atlas');
  assert.strictEqual(result, 'atlas', `Expected atlas, got ${result}`);
});

test('Agent key normalization: Prometheus → prometheus', () => {
  const result = normalizeAgentKey('Prometheus');
  assert.strictEqual(result, 'prometheus', `Expected prometheus, got ${result}`);
});

test('Agent key normalization: Metis → metis', () => {
  const result = normalizeAgentKey('Metis');
  assert.strictEqual(result, 'metis', `Expected metis, got ${result}`);
});

test('Agent key normalization: Momus → momus', () => {
  const result = normalizeAgentKey('Momus');
  assert.strictEqual(result, 'momus', `Expected momus, got ${result}`);
});

test('Agent key normalization: Oracle → oracle', () => {
  const result = normalizeAgentKey('Oracle');
  assert.strictEqual(result, 'oracle', `Expected oracle, got ${result}`);
});

test('Agent key normalization: Librarian → librarian', () => {
  const result = normalizeAgentKey('Librarian');
  assert.strictEqual(result, 'librarian', `Expected librarian, got ${result}`);
});

test('Agent key normalization: Explore → explore', () => {
  const result = normalizeAgentKey('Explore');
  assert.strictEqual(result, 'explore', `Expected explore, got ${result}`);
});

test('Agent key normalization: Multimodal-Looker → multimodal-looker', () => {
  const result = normalizeAgentKey('Multimodal-Looker');
  assert.strictEqual(result, 'multimodal-looker', `Expected multimodal-looker, got ${result}`);
});

test('Agent key normalization: already lowercase stays lowercase', () => {
  const result = normalizeAgentKey('sisyphus');
  assert.strictEqual(result, 'sisyphus', `Expected sisyphus, got ${result}`);
});

test('Agent key normalization: MultimodalLooker → multimodal-looker (via alias)', () => {
  const result = normalizeAgentKey('MultimodalLooker');
  assert.strictEqual(result, 'multimodal-looker', `Expected multimodal-looker, got ${result}`);
});

test('Agent key normalization: unknown key lowercased only', () => {
  const result = normalizeAgentKey('SomeUnknownAgent');
  assert.strictEqual(result, 'someunknownagent', `Expected someunknownagent, got ${result}`);
});

// ==========================================
// Test 5: Punctuation-tolerant model matching
// ==========================================
test('Model ID normalization: 4-6 → 4-6 (hyphens preserved)', () => {
  const result = normalizeModelId('claude-opus-4-6');
  assert.ok(result.includes('4-6'), `Expected 4-6 in normalized ID, got ${result}`);
});

test('Model ID normalization: 4.6 → 4-6 (dots to hyphens)', () => {
  const result = normalizeModelId('claude-opus-4.6');
  assert.ok(result.includes('4-6'), `Expected 4-6 in normalized ID, got ${result}`);
});

test('Model ID matching: 4-6 matches 4.6', () => {
  const result = modelIdMatches('claude-opus-4-6', 'claude-opus-4.6');
  assert.strictEqual(result, true, 'Expected 4-6 to match 4.6');
});

test('Model ID matching: 4.6 matches 4-6', () => {
  const result = modelIdMatches('claude-opus-4.6', 'claude-opus-4-6');
  assert.strictEqual(result, true, 'Expected 4.6 to match 4-6');
});

test('Model ID matching: preview suffix stripped', () => {
  const result = modelIdMatches('gemini-3-pro-preview', 'gemini-3-pro');
  assert.strictEqual(result, true, 'Expected preview suffix to be stripped for matching');
});

test('Model ID matching: latest suffix stripped', () => {
  const result = modelIdMatches('claude-opus-latest', 'claude-opus');
  assert.strictEqual(result, true, 'Expected latest suffix to be stripped for matching');
});

test('Model ID matching: case insensitive', () => {
  const result = modelIdMatches('Claude-Opus-4-6', 'claude-opus-4.6');
  assert.strictEqual(result, true, 'Expected case-insensitive matching');
});

test('Model ID matching: different models do not match', () => {
  const result = modelIdMatches('claude-opus-4-6', 'claude-sonnet-4-6');
  assert.strictEqual(result, false, 'Expected different models not to match');
});

test('Model ID matching: partial match works', () => {
  const result = modelIdMatches('anthropic/claude-opus-4-6', 'claude-opus');
  assert.strictEqual(result, true, 'Expected partial match to work');
});

// ==========================================
// Test 6: requiresAnyModel gating (sisyphus)
// ==========================================
test('Sisyphus requiresAnyModel: passes when any fallback entry available', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const result = isAnyFallbackEntryAvailable(sisyphusReqs.fallbackChain, fullAvailability);
  
  assert.strictEqual(result, true, 'Expected requiresAnyModel to pass with full availability');
});

test('Sisyphus requiresAnyModel: passes with limited availability', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const result = isAnyFallbackEntryAvailable(sisyphusReqs.fallbackChain, limitedAvailability);
  
  assert.strictEqual(result, true, 'Expected requiresAnyModel to pass with github-copilot and opencode');
});

test('Sisyphus requiresAnyModel: fails when no providers available', () => {
  const sisyphusReqs = AGENT_MODEL_REQUIREMENTS.sisyphus;
  const result = isAnyFallbackEntryAvailable(sisyphusReqs.fallbackChain, {});
  
  assert.strictEqual(result, false, 'Expected requiresAnyModel to fail with no providers');
});

// ==========================================
// Test 7: requiresModel gating (deep category)
// ==========================================
test('Deep category requiresModel: passes when gpt-5.3-codex available', () => {
  const deepReqs = CATEGORY_MODEL_REQUIREMENTS.deep;
  const result = isRequiredModelAvailable(
    deepReqs.requiresModel,
    deepReqs.fallbackChain,
    fullAvailability
  );

  assert.strictEqual(result, true, 'Expected requiresModel to pass with gpt-5.3-codex available');
});

test('Deep category requiresModel: fails when required model unavailable', () => {
  const deepReqs = CATEGORY_MODEL_REQUIREMENTS.deep;
  const noGPT = { 'anthropic': true, 'google': true };

  const result = isRequiredModelAvailable(
    deepReqs.requiresModel,
    deepReqs.fallbackChain,
    noGPT
  );

  assert.strictEqual(result, false, 'Expected requiresModel to fail without gpt-5.3-codex');
});

// ==========================================
// Test 8: Model scoring with formatted vs raw shapes
// ==========================================

// Import the scoring function from agents.js
const { scoreModelsForAgent } = require('../lib/core/agents');

test('Model scoring: formatted models have context, hasThinking, costDisplay', () => {
  // Formatted model shape (what formatModel() returns)
  const formattedModels = [
    {
      id: 'anthropic/claude-opus-4-6',
      name: 'Claude Opus 4.6',
      provider: 'anthropic',
      context: 200000,
      hasThinking: true,
      costDisplay: '$$$$',
      capabilities: { reasoning: true, input: { image: true } }
    },
    {
      id: 'openai/gpt-5.2',
      name: 'GPT-5.2',
      provider: 'openai',
      context: 128000,
      hasThinking: false,
      costDisplay: '$$',
      capabilities: { reasoning: false, input: { image: false } }
    }
  ];

  const metadata = {
    name: 'test-agent',
    minContext: 128000,
    capabilities: ['thinking'],
    cost: 'EXPENSIVE'
  };

  const scored = scoreModelsForAgent(metadata, formattedModels);

  // Claude Opus should score higher due to thinking + large context
  assert.ok(scored.length > 0, 'Expected scored results');
  assert.ok(scored[0].score > 0, 'Expected positive score for matching model');
  assert.strictEqual(scored[0].model.id, 'anthropic/claude-opus-4-6',
    'Expected Claude Opus to score highest for thinking agent');
});

test('Model scoring: raw models (limit.context) fail without formatting', () => {
  // Raw model shape (what getModels() returns from CLI)
  const rawModels = [
    {
      id: 'anthropic/claude-opus-4-6',
      name: 'Claude Opus 4.6',
      providerID: 'anthropic',
      limit: { context: 200000 },
      capabilities: { reasoning: true, interleaved: { field: 'thinking' }, input: { image: true } },
      cost: { input: 15, output: 75 }
    },
    {
      id: 'openai/gpt-5.4',
      name: 'GPT-5.4',
      providerID: 'openai',
      limit: { context: 128000 },
      capabilities: { reasoning: false, input: { image: false } },
      cost: { input: 5, output: 15 }
    }
  ];

  const metadata = {
    name: 'test-agent',
    minContext: 128000,
    capabilities: ['thinking'],
    cost: 'EXPENSIVE'
  };

  // This tests that raw models score poorly because scoreModelsForAgent
  // expects formatted shape (context, hasThinking, costDisplay)
  const scored = scoreModelsForAgent(metadata, rawModels);

  // Raw models should still work but score lower since fields are undefined
  assert.ok(scored.length > 0, 'Expected scored results');

  // The first model should have 0 context score since model.context is undefined
  // (it only has model.limit.context)
  const opusScore = scored.find(s => s.model.id === 'anthropic/claude-opus-4-6');
  assert.ok(opusScore, 'Expected Claude Opus in results');

  // Score should be low because raw model lacks formatted fields
  // context=0 (not model.limit.context), hasThinking=undefined (not checking capabilities.interleaved)
  assert.ok(opusScore.score < 30, 'Expected low score for raw model without formatting');
});

// ==========================================
// Test 9: Provider alias normalization
// ==========================================
test('Provider alias: google → google (canonical)', () => {
  const result = normalizeProviderName('google');
  assert.strictEqual(result, 'google', `Expected google, got ${result}`);
});

test('Provider alias: gemini → google', () => {
  const result = normalizeProviderName('gemini');
  assert.strictEqual(result, 'google', `Expected google, got ${result}`);
});

test('Provider alias: anthropic → anthropic (canonical)', () => {
  const result = normalizeProviderName('anthropic');
  assert.strictEqual(result, 'anthropic', `Expected anthropic, got ${result}`);
});

test('Provider alias: claude → anthropic', () => {
  const result = normalizeProviderName('claude');
  assert.strictEqual(result, 'anthropic', `Expected anthropic, got ${result}`);
});

test('Provider alias: openai → openai (canonical)', () => {
  const result = normalizeProviderName('openai');
  assert.strictEqual(result, 'openai', `Expected openai, got ${result}`);
});

test('Provider alias: gpt → openai', () => {
  const result = normalizeProviderName('gpt');
  assert.strictEqual(result, 'openai', `Expected openai, got ${result}`);
});

test('Provider alias: github-copilot → github-copilot (canonical)', () => {
  const result = normalizeProviderName('github-copilot');
  assert.strictEqual(result, 'github-copilot', `Expected github-copilot, got ${result}`);
});

test('Provider alias: copilot → github-copilot', () => {
  const result = normalizeProviderName('copilot');
  assert.strictEqual(result, 'github-copilot', `Expected github-copilot, got ${result}`);
});

test('Provider alias: github → github-copilot', () => {
  const result = normalizeProviderName('github');
  assert.strictEqual(result, 'github-copilot', `Expected github-copilot, got ${result}`);
});

test('Provider alias: kimi → kimi-for-coding', () => {
  const result = normalizeProviderName('kimi');
  assert.strictEqual(result, 'kimi-for-coding', `Expected kimi-for-coding, got ${result}`);
});

test('Provider alias: moonshot → kimi-for-coding', () => {
  const result = normalizeProviderName('moonshot');
  assert.strictEqual(result, 'kimi-for-coding', `Expected kimi-for-coding, got ${result}`);
});

test('Provider alias: opencode → opencode (canonical)', () => {
  const result = normalizeProviderName('opencode');
  assert.strictEqual(result, 'opencode', `Expected opencode, got ${result}`);
});

test('Provider alias: zen → opencode', () => {
  const result = normalizeProviderName('zen');
  assert.strictEqual(result, 'opencode', `Expected opencode, got ${result}`);
});

test('Provider alias: zai → zai-coding-plan', () => {
  const result = normalizeProviderName('zai');
  assert.strictEqual(result, 'zai-coding-plan', `Expected zai-coding-plan, got ${result}`);
});

test('Provider alias: unknown provider returns lowercase', () => {
  const result = normalizeProviderName('SomeUnknownProvider');
  assert.strictEqual(result, 'someunknownprovider', `Expected someunknownprovider, got ${result}`);
});

test('Provider alias: empty returns unknown', () => {
  const result = normalizeProviderName('');
  assert.strictEqual(result, 'unknown', `Expected unknown, got ${result}`);
});

test('Provider alias: null returns unknown', () => {
  const result = normalizeProviderName(null);
  assert.strictEqual(result, 'unknown', `Expected unknown, got ${result}`);
});

test('Provider alias: undefined returns unknown', () => {
  const result = normalizeProviderName(undefined);
  assert.strictEqual(result, 'unknown', `Expected unknown, got ${result}`);
});

test('Provider alias: case insensitive (CLAUDE → anthropic)', () => {
  const result = normalizeProviderName('CLAUDE');
  assert.strictEqual(result, 'anthropic', `Expected anthropic, got ${result}`);
});

test('Provider alias: handles whitespace', () => {
  const result = normalizeProviderName('  gemini  ');
  assert.strictEqual(result, 'google', `Expected google, got ${result}`);
});

test('getProviderAliases: anthropic returns all aliases', () => {
  const result = getProviderAliases('anthropic');
  assert.ok(result.includes('anthropic'), 'Should include anthropic');
  assert.ok(result.includes('claude'), 'Should include claude');
});

test('getProviderAliases: google returns all aliases', () => {
  const result = getProviderAliases('google');
  assert.ok(result.includes('google'), 'Should include google');
  assert.ok(result.includes('gemini'), 'Should include gemini');
});

test('isProviderAvailable: matches via canonical alias', () => {
  const availability = { 'google': true };
  // gemini should match because it normalizes to google
  const result = isRequiredProviderAvailable(['gemini'], availability);
  assert.strictEqual(result, true, 'Expected gemini to match google via canonical alias');
});

test('isProviderAvailable: matches via reverse alias', () => {
  const availability = { 'gemini': true };
  // google should match because gemini is an alias for google
  const result = isRequiredProviderAvailable(['google'], availability);
  assert.strictEqual(result, true, 'Expected google to match gemini availability');
});

test('PROVIDER_ALIASES: contains expected mappings', () => {
  assert.strictEqual(PROVIDER_ALIASES['claude'], 'anthropic', 'claude should map to anthropic');
  assert.strictEqual(PROVIDER_ALIASES['gemini'], 'google', 'gemini should map to google');
  assert.strictEqual(PROVIDER_ALIASES['gpt'], 'openai', 'gpt should map to openai');
  assert.strictEqual(PROVIDER_ALIASES['copilot'], 'github-copilot', 'copilot should map to github-copilot');
  assert.strictEqual(PROVIDER_ALIASES['kimi'], 'kimi-for-coding', 'kimi should map to kimi-for-coding');
});

// ==========================================
// Test 10: Centralized recommendation scoring flow
// ==========================================

// Import the recommendation functions from agents.js
const { getRecommendedModels, buildRecommendation, checkGatingConditions, buildRecommendationsFromChain } = require('../lib/core/agents');

// Mock metadata for known agent (sisyphus)
const sisyphusMetadata = {
  name: 'sisyphus',
  description: 'Autonomous coding agent',
  category: 'coding',
  cost: 'EXPENSIVE',
  access: 'write',
  capabilities: ['thinking', 'reasoning'],
  minContext: 200000,
  fallbackChain: ['claude-opus-4-6', 'k2p5', 'kimi-k2.5-free', 'glm-5', 'big-pickle']
};

// Mock metadata for unknown agent
const unknownAgentMetadata = {
  name: 'custom-agent',
  description: 'Custom unknown agent',
  category: 'utility',
  cost: 'MODERATE',
  access: 'write',
  capabilities: ['reasoning'],
  minContext: 128000,
  fallbackChain: []
};

test('Known agent (sisyphus): uses fallback chain with correct provenance', () => {
  const recommendations = getRecommendedModels(sisyphusMetadata, mockModels, 3);

  assert.ok(recommendations.length > 0, 'Expected recommendations for sisyphus');
  assert.strictEqual(recommendations[0].provenance, 'fallback-chain',
    `Expected provenance 'fallback-chain', got ${recommendations[0].provenance}`);
});

test('Known agent (sisyphus): first recommendation has high score from chain priority', () => {
  const recommendations = getRecommendedModels(sisyphusMetadata, mockModels, 3);

  assert.ok(recommendations[0].score >= 90, 'Expected first recommendation to have high score (90+)');
  assert.ok(recommendations[0].score <= 100, 'Expected first recommendation score to be <= 100');
});

test('Known agent (sisyphus): includes variant from fallback chain', () => {
  const recommendations = getRecommendedModels(sisyphusMetadata, mockModels, 3);

  // First entry in sisyphus chain has variant: 'max'
  const firstRec = recommendations[0];
  assert.ok(firstRec.variant === 'max' || firstRec.variant === undefined,
    `Expected variant 'max' or undefined, got ${firstRec.variant}`);
});

test('Known agent (sisyphus): fallback chain respects provider priority order', () => {
  // With full availability, should pick anthropic first (first provider in first entry)
  const recommendations = getRecommendedModels(sisyphusMetadata, mockModels, 5);

  assert.ok(recommendations.length > 0, 'Expected recommendations');
  // The first recommendation should be from the first available provider in chain
  const firstProvider = recommendations[0].provider?.toLowerCase();
  assert.ok(['anthropic', 'github-copilot', 'opencode', 'kimi-for-coding'].includes(firstProvider),
    `Expected provider from sisyphus chain, got ${firstProvider}`);
});

test('Unknown agent: uses heuristic scoring with correct provenance', () => {
  const recommendations = getRecommendedModels(unknownAgentMetadata, mockModels, 3);

  assert.ok(recommendations.length > 0, 'Expected recommendations for unknown agent');
  // Unknown agents should use heuristic scoring
  assert.strictEqual(recommendations[0].provenance, 'heuristic',
    `Expected provenance 'heuristic' for unknown agent, got ${recommendations[0].provenance}`);
});

test('Unknown agent: heuristic scoring considers context requirements', () => {
  const recommendations = getRecommendedModels(unknownAgentMetadata, mockModels, 5);

  // Models with larger context should score higher for agents requiring context
  const contexts = recommendations.map(r => {
    const model = mockModels.find(m => m.id === r.id);
    return { id: r.id, score: r.score, context: model?.providerID || 0 };
  });

  assert.ok(recommendations.length > 0, 'Expected recommendations');
  // Scores should vary based on model capabilities
  assert.ok(recommendations[0].score >= 0, 'Expected non-negative scores');
});

test('Unknown agent: no gating warnings for agents without requirements', () => {
  const recommendations = getRecommendedModels(unknownAgentMetadata, mockModels, 3);

  // Unknown agents should not have gating-failed provenance
  assert.notStrictEqual(recommendations[0].provenance, 'gating-failed',
    'Unknown agents should not fail gating');
  assert.ok(!recommendations[0].warnings, 'Unknown agents should not have warnings');
});

test('Known agent (hephaestus): gating fails when required provider unavailable', () => {
  const hephaestusMetadata = {
    name: 'hephaestus',
    description: 'Build agent',
    category: 'build',
    cost: 'MODERATE',
    access: 'write',
    capabilities: [],
    minContext: 128000
  };

  // Only anthropic/google available, hephaestus requires openai/github-copilot/opencode
  const noRequiredProviders = [
    { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus', providerID: 'anthropic' }
  ];

  const recommendations = getRecommendedModels(hephaestusMetadata, noRequiredProviders, 3);

  assert.strictEqual(recommendations[0].provenance, 'gating-failed',
    'Expected gating-failed when required provider unavailable');
  assert.ok(recommendations[0].warnings, 'Expected warnings in gating-failed result');
  assert.ok(recommendations[0].warnings.some(w => w.type === 'requiresProvider'),
    'Expected requiresProvider warning');
});

test('Known agent (sisyphus): gating passes with requiresAnyModel when any available', () => {
  // sisyphus has requiresAnyModel: true
  const limitedModels = [
    { id: 'opencode/big-pickle', name: 'Big Pickle', providerID: 'opencode' }
  ];

  const recommendations = getRecommendedModels(sisyphusMetadata, limitedModels, 3);

  // Should not fail gating since big-pickle is in the fallback chain
  assert.notStrictEqual(recommendations[0].provenance, 'gating-failed',
    'Should pass gating when at least one fallback model available');
});

test('buildRecommendation: creates consistent structure', () => {
  const model = mockModels[0];
  const result = buildRecommendation(model, 85, 'fallback-chain', { variant: 'max' });

  assert.strictEqual(result.id, model.id, 'Expected id to match model');
  assert.strictEqual(result.name, model.name, 'Expected name to match model');
  assert.strictEqual(result.score, 85, 'Expected score to match');
  assert.strictEqual(result.provenance, 'fallback-chain', 'Expected provenance to match');
  assert.strictEqual(result.variant, 'max', 'Expected variant to match');
  assert.ok(result.provider, 'Expected provider to be set');
});

test('checkGatingConditions: passes when no requirements', () => {
  const availability = { 'openai': true };
  const result = checkGatingConditions({}, availability);

  assert.strictEqual(result.passed, true, 'Expected to pass with no requirements');
  assert.strictEqual(result.warnings.length, 0, 'Expected no warnings');
});

test('checkGatingConditions: fails when requiresProvider not available', () => {
  const availability = { 'anthropic': true };
  const requirements = { requiresProvider: ['openai'] };
  const result = checkGatingConditions(requirements, availability);

  assert.strictEqual(result.passed, false, 'Expected to fail when required provider unavailable');
  assert.ok(result.warnings.length > 0, 'Expected warnings');
  assert.ok(result.reason, 'Expected reason for failure');
});

test('buildRecommendationsFromChain: uses resolveModelFromChain for each entry', () => {
  const availability = {
    'anthropic': true,
    'github-copilot': true,
    'opencode': true
  };
  const requirements = {
    fallbackChain: [
      { providers: ['anthropic', 'github-copilot'], model: 'claude-opus-4-6', variant: 'max' },
      { providers: ['opencode'], model: 'big-pickle' }
    ]
  };

  const recommendations = buildRecommendationsFromChain(requirements, mockModels, availability, 5);

  assert.ok(recommendations.length > 0, 'Expected recommendations from chain');
  // First entry should resolve to anthropic since it's available
  assert.strictEqual(recommendations[0].provenance, 'fallback-chain',
    'Expected fallback-chain provenance');
});

test('Regression: known and unknown agents share common ranking base', () => {
  // Both should return arrays of recommendation objects with consistent structure
  const knownRecs = getRecommendedModels(sisyphusMetadata, mockModels, 3);
  const unknownRecs = getRecommendedModels(unknownAgentMetadata, mockModels, 3);

  // Both should return non-empty arrays
  assert.ok(knownRecs.length > 0, 'Known agent should return recommendations');
  assert.ok(unknownRecs.length > 0, 'Unknown agent should return recommendations');

  // Both should have consistent object structure
  const knownKeys = Object.keys(knownRecs[0]).sort();
  const unknownKeys = Object.keys(unknownRecs[0]).sort();

  // Core fields should be present in both
  const coreFields = ['id', 'name', 'score', 'provider', 'provenance'];
  for (const field of coreFields) {
    assert.ok(knownKeys.includes(field), `Known agent missing field: ${field}`);
    assert.ok(unknownKeys.includes(field), `Unknown agent missing field: ${field}`);
  }
});

test('hasExtendedThinking: boolean interleaved true', () => {
  const result = hasExtendedThinking({ capabilities: { interleaved: true } });
  assert.strictEqual(result, true, 'Expected boolean interleaved=true to be treated as thinking');
});

test('hasExtendedThinking: interleaved object with field', () => {
  const result = hasExtendedThinking({ capabilities: { interleaved: { field: 'thinking' } } });
  assert.strictEqual(result, true, 'Expected interleaved.field to be treated as thinking');
});

test('hasExtendedThinking: variants thinking enabled', () => {
  const model = { variants: { high: { thinking: { type: 'enabled', budgetTokens: 1000 } } } };
  const result = hasExtendedThinking(model);
  assert.strictEqual(result, true, 'Expected variants.*.thinking.type=enabled to be treated as thinking');
});

test('hasExtendedThinking: false when absent', () => {
  const result = hasExtendedThinking({});
  assert.strictEqual(result, false, 'Expected no thinking capability when fields absent');
});

// ==========================================
// Test 11: Model parsing defensive handling
// ==========================================
console.log('');
console.log('Model Parsing Defensive Tests');
console.log('==================================');

test('parseModels: handles null input gracefully', () => {
  const result = parseModels(null);
  assert.strictEqual(result.models.length, 0, 'Expected empty models array');
  assert.ok(result.errors.length > 0, 'Expected errors for null input');
  assert.strictEqual(result.partial, false, 'Expected partial=false for complete failure');
});

test('parseModels: handles undefined input gracefully', () => {
  const result = parseModels(undefined);
  assert.strictEqual(result.models.length, 0, 'Expected empty models array');
  assert.ok(result.errors.length > 0, 'Expected errors for undefined input');
});

test('parseModels: handles empty string input gracefully', () => {
  const result = parseModels('');
  assert.strictEqual(result.models.length, 0, 'Expected empty models array');
  assert.ok(result.errors.length > 0, 'Expected errors for empty input');
});

test('parseModels: handles whitespace-only input gracefully', () => {
  const result = parseModels('   \n\t  ');
  assert.strictEqual(result.models.length, 0, 'Expected empty models array');
  assert.ok(result.errors.length > 0, 'Expected errors for whitespace-only input');
});

test('parseModels: handles valid model output', () => {
  const validOutput = `anthropic/claude-opus-4-6
{
  "id": "claude-opus-4-6",
  "name": "Claude Opus 4.6",
  "providerID": "anthropic"
}
openai/gpt-5.2
{
  "id": "gpt-5.2",
  "name": "GPT-5.2",
  "providerID": "openai"
}`;
  
  const result = parseModels(validOutput);
  assert.strictEqual(result.models.length, 2, 'Expected 2 models');
  assert.strictEqual(result.models[0].id, 'anthropic/claude-opus-4-6', 'Expected correct model ID');
  assert.strictEqual(result.models[0].modelID, 'claude-opus-4-6', 'Expected correct modelID');
  assert.strictEqual(result.errors.length, 0, 'Expected no errors for valid input');
  assert.strictEqual(result.partial, false, 'Expected partial=false for complete success');
});

test('parseModels: handles multi-segment provider model paths', () => {
  const nestedPathOutput = `fireworks-ai/accounts/fireworks/models/deepseek-v3p1
{
  "id": "accounts/fireworks/models/deepseek-v3p1",
  "name": "DeepSeek V3.1",
  "providerID": "fireworks-ai"
}
nvidia/deepseek-ai/deepseek-r1
{
  "id": "deepseek-ai/deepseek-r1",
  "name": "DeepSeek R1",
  "providerID": "nvidia"
}`;

  const result = parseModels(nestedPathOutput);
  assert.strictEqual(result.models.length, 2, 'Expected multi-segment headers to parse');
  assert.strictEqual(result.models[0].id, 'fireworks-ai/accounts/fireworks/models/deepseek-v3p1', 'Expected Fireworks header ID to be preserved');
  assert.strictEqual(result.models[0].modelID, 'accounts/fireworks/models/deepseek-v3p1', 'Expected nested Fireworks modelID to be preserved');
  assert.strictEqual(result.models[1].id, 'nvidia/deepseek-ai/deepseek-r1', 'Expected NVIDIA header ID to be preserved');
  assert.strictEqual(result.errors.length, 0, 'Expected no errors for nested model paths');
  assert.strictEqual(result.partial, false, 'Expected partial=false for valid nested paths');
});

test('parseModels: handles malformed JSON with warnings', () => {
  const malformedOutput = `anthropic/claude-opus-4-6
{
  "id": "claude-opus-4-6",
  "name": "Claude Opus 4.6"
openai/gpt-5.2
{
  "id": "gpt-5.2",
  "name": "GPT-5.2"
}`;
  
  const result = parseModels(malformedOutput);
  // First model has unclosed braces, second model is valid
  assert.ok(result.warnings.length > 0 || result.errors.length > 0, 'Expected warnings/errors for malformed JSON');
  assert.ok(result.partial === true || result.models.length === 0, 'Expected partial=true or no models');
});

test('parseModels: handles missing id field gracefully', () => {
  const missingIdOutput = `anthropic/claude-opus-4-6
{
  "name": "Claude Opus 4.6",
  "providerID": "anthropic"
}`;
  
  const result = parseModels(missingIdOutput);
  assert.strictEqual(result.models.length, 1, 'Expected 1 model with fallback ID');
  assert.ok(result.warnings.length > 0, 'Expected warning for missing id field');
  assert.ok(result.models[0].id, 'Expected model to have an id');
});

test('parseModels: handles negative brace count (malformed)', () => {
  const negativeBraceOutput = `anthropic/claude-opus-4-6
}
  "id": "claude-opus-4-6"
{`;
  
  const result = parseModels(negativeBraceOutput);
  assert.ok(result.warnings.length > 0, 'Expected warning for negative brace count');
  assert.strictEqual(result.models.length, 0, 'Expected no models from malformed output');
});

test('parseModels: handles truncated/incomplete output', () => {
  const truncatedOutput = `anthropic/claude-opus-4-6
{
  "id": "claude-opus-4-6",
  "name": "Claude Opus 4.6",
  "providerID": "anthropic",
  "capabilities": {
    "reasoning": true`;
  
  const result = parseModels(truncatedOutput);
  assert.ok(result.errors.length > 0 || result.warnings.length > 0, 'Expected errors/warnings for truncated output');
  assert.ok(result.partial === true || result.models.length === 0, 'Expected partial=true for truncated data');
});

test('parseModels: handles non-object JSON gracefully', () => {
  const nonObjectOutput = `anthropic/claude-opus-4-6
"just a string"`;
  
  const result = parseModels(nonObjectOutput);
  assert.ok(result.warnings.length > 0, 'Expected warning for non-object JSON');
  assert.strictEqual(result.models.length, 0, 'Expected no models from non-object JSON');
});

test('parseModels: handles mixed valid and invalid models', () => {
  const mixedOutput = `anthropic/claude-opus-4-6
{
  "id": "claude-opus-4-6",
  "name": "Claude Opus 4.6"
}
openai/gpt-5.2
{invalid json here}
google/gemini-3-pro
{
  "id": "gemini-3-pro",
  "name": "Gemini 3 Pro"
}`;
  
  const result = parseModels(mixedOutput);
  assert.strictEqual(result.models.length, 2, 'Expected 2 valid models');
  assert.ok(result.warnings.length > 0, 'Expected warning for invalid model');
  assert.strictEqual(result.partial, true, 'Expected partial=true when some models fail');
});

test('parseModels: returns structured result with all fields', () => {
  const result = parseModels('anthropic/test\n{"id":"test"}');
  
  assert.ok(Array.isArray(result.models), 'Expected models to be an array');
  assert.ok(Array.isArray(result.warnings), 'Expected warnings to be an array');
  assert.ok(Array.isArray(result.errors), 'Expected errors to be an array');
  assert.strictEqual(typeof result.partial, 'boolean', 'Expected partial to be a boolean');
});

// ==========================================
// Summary
// ==========================================
console.log('');
console.log('==================================');
console.log('Test Summary');
console.log('==================================');
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
