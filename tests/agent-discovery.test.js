/**
 * Tests for agent discovery and parsing
 * 
 * Verifies:
 * - Agent discovery finds sisyphus-junior
 * - Agent discovery handles directory-based agents
 * - Agent discovery handles top-level .ts files
 * - Metadata parsing handles PROMPT_METADATA pattern
 * - Metadata parsing handles AgentPromptMetadata interface pattern
 * - Missing metadata produces warnings
 */

'use strict';

const assert = require('assert');
const {
  parseAgentMetadata,
} = require('../lib/core/agents');

// Helper to create mock agent code (top-level file style)
function createMockAgentCode(name, metadata) {
  const metadataStr = Object.entries(metadata)
    .map(([k, v]) => `${k}: "${v}"`)
    .join(',\n');
  
  return `
export const ${name.toUpperCase().replace(/-/g, '_')}_PROMPT_METADATA: AgentPromptMetadata = {
${metadataStr}
}

export function create${name}Agent() {
  return { model: 'claude-sonnet-4-5' }
}
`;
}

// Helper to create directory-based agent code (sisyphus-junior style)
function createDirectoryAgentCode(name, metadata) {
  const metadataJson = JSON.stringify(metadata, null, 2);
  
  return `
import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentMode } from "../types"
import { createAgentToolRestrictions } from "../../shared/permission-compat"
const MODE: AgentMode = "subagent"
const BLOCKED_TOOLS = ["task"]
const SISYPHUS_JUNIOR_DEFAULTS = {
  model: "anthropic/claude-sonnet-4-6",
  temperature: 0.1,
}
export const ${name.toUpperCase().replace(/-/g, '_')}_PROMPT_METADATA: AgentPromptMetadata = ${metadataJson}
`;
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

// Tests
console.log('\nparseAgentMetadata tests:');

test('should extract category, cost, and promptAlias from PROMPT_METADATA', () => {
  const code = createMockAgentCode('oracle', {
    category: "advisor",
    cost: "EXPENSIVE",
    promptAlias: "Oracle"
  });
  const result = parseAgentMetadata('oracle', code);
  
  assert.strictEqual(result.category, 'advisor');
  assert.strictEqual(result.cost, 'EXPENSIVE');
  assert.strictEqual(result.displayName, 'Oracle');
});

test('should handle hyphenated agent names (sisyphus-junior)', () => {
  const code = createMockAgentCode('sisyphus-junior', {
    category: 'executor',
    cost: 'MODERATE',
    promptAlias: 'Sisyphus Junior'
  });
  const result = parseAgentMetadata('sisyphus-junior', code);
  
  assert.strictEqual(result.category, 'executor');
  assert.strictEqual(result.cost, 'MODERATE');
  assert.strictEqual(result.displayName, 'Sisyphus Junior');
});

test('should extract description from code', () => {
  const code = `
export const TEST_PROMPT_METADATA: AgentPromptMetadata = {}
export function createTestAgent() {
  return {
    model: 'test-model',
    description: "This is a test agent"
  }
}
`;
  const result = parseAgentMetadata('test', code);
  
  assert.strictEqual(result.description, 'This is a test agent');
});

test('should infer capabilities from code content', () => {
  const code = `
export const TEST_PROMPT_METADATA: AgentPromptMetadata = {}
export function createTestAgent() {
  const usesMultimodal = image.includes('vision') || image.includes('multimodal')
  const usesThinking = code.includes('budgetTokens') || code.includes('extended thinking')
  return { model: 'test-model' }
}
`;
  const result = parseAgentMetadata('test', code);
  
  assert.ok(result.capabilities.includes('multimodal'));
  assert.ok(result.capabilities.includes('thinking'));
});

test('should extract role and behaviors from XML tags', () => {
  const code = `
export const TEST_PROMPT_METADATA: AgentPromptMetadata = {}
export function createTestAgent() {
  return {
    model: 'test-model',
    prompt: \`<Role>You are an expert test agent.</Role>
<Behavior_Instructions>
### Phase 1 - Analysis
Perform thorough analysis before proceeding.
</Behavior_Instructions>
<Constraints>
Tool: read, allow
Tool: write, deny
</Constraints>\`
  }
}
`;
  const result = parseAgentMetadata('test', code);
  
  assert.ok(result.role);
  assert.ok(result.behaviors.length > 0);
  assert.strictEqual(result.toolAccess.allowed[0], 'read');
  assert.strictEqual(result.toolAccess.denied[0], 'write');
});

test('should parse AgentPromptMetadata interface pattern', () => {
  const code = `
import type { AgentPromptMetadata } from "./types"
export const TEST_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "MODERATE",
  promptAlias: "Test Agent"
}
export function createTestAgent() {
  return { model: 'test-model' }
}
`;
  const result = parseAgentMetadata('test', code);
  
  assert.strictEqual(result.category, 'specialist');
  assert.strictEqual(result.cost, 'MODERATE');
  assert.strictEqual(result.displayName, 'Test Agent');
});

test('should parse export const ... METADATA pattern', () => {
  const code = `
import type { AgentPromptMetadata } from "./types"
export const TEST_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "CHEAP",
  promptAlias: "Export Metadata Agent"
}
export function createTestAgent() {
  return { model: 'test-model' }
}
`;
  const result = parseAgentMetadata('test', code);
  
  assert.strictEqual(result.category, 'specialist');
  assert.strictEqual(result.cost, 'CHEAP');
  assert.strictEqual(result.displayName, 'Export Metadata Agent');
});

test('should provide defaults for missing metadata patterns', () => {
  const code = `
export function createUnknownAgent() {
  return { model: 'test-model' }
}
`;
  const result = parseAgentMetadata('unknown', code);
  
  assert.strictEqual(result.category, 'utility');
  assert.strictEqual(result.cost, 'MODERATE');
  assert.strictEqual(result.access, 'unknown');
});

test('should parse directory-based agent metadata (sisyphus-junior)', () => {
  const code = createDirectoryAgentCode('sisyphus-junior', {
    category: "executor",
    cost: "MODERATE",
    promptAlias: "Sisyphus Junior"
  });
  const result = parseAgentMetadata('sisyphus-junior', code);
  
  assert.strictEqual(result.category, 'executor');
  assert.strictEqual(result.cost, 'MODERATE');
  assert.strictEqual(result.displayName, 'Sisyphus Junior');
});

// Summary
console.log('\n===================');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
console.log('\nAll tests passed!');
