#!/usr/bin/env node

/**
 * Tests for upstream.js schema validation functions
 * Deterministic - no live network calls, uses in-memory fixtures
 */

const assert = require('assert');
const {
  validateSchema,
  extractAgentsFromSchema,
  extractSkillsFromSchema
} = require('../lib/upstream.js');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Valid schema fixture
const validSchema = {
  definitions: {
    BuiltinAgentNameSchema: {
      enum: ['oracle', 'librarian', 'sisyphus']
    },
    BuiltinSkillNameSchema: {
      enum: ['playwright', 'frontend-ui-ux', 'git-master']
    }
  }
};

// Schema missing definitions
const schemaMissingDefinitions = {
  type: 'object',
  properties: {}
};

// Schema with definitions but missing required schemas
const schemaMissingAgentSchema = {
  definitions: {
    BuiltinSkillNameSchema: {
      enum: ['playwright']
    }
  }
};

const schemaMissingSkillSchema = {
  definitions: {
    BuiltinAgentNameSchema: {
      enum: ['oracle']
    }
  }
};

// Schema with empty definitions
const schemaEmptyDefinitions = {
  definitions: {}
};

// Schema with malformed enum (not an array)
const schemaMalformedEnum = {
  definitions: {
    BuiltinAgentNameSchema: {
      enum: 'not-an-array'
    },
    BuiltinSkillNameSchema: {
      enum: 'not-an-array'
    }
  }
};

console.log('Upstream Schema Validation Tests');
console.log('='.repeat(50));
console.log('');

// =====================
// validateSchema tests
// =====================

console.log('validateSchema:');

test('returns valid:true for valid schema', () => {
  const result = validateSchema(validSchema);
  assertEqual(result.valid, true, 'valid should be true');
  assertArrayEqual(result.missingDefinitions, [], 'missingDefinitions should be empty');
  assertArrayEqual(result.errors, [], 'errors should be empty');
});

test('returns valid:false for null schema', () => {
  const result = validateSchema(null);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.errors.length > 0, 'should have errors');
});

test('returns valid:false for undefined schema', () => {
  const result = validateSchema(undefined);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.errors.length > 0, 'should have errors');
});

test('returns valid:false for array schema', () => {
  const result = validateSchema([1, 2, 3]);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.errors.length > 0, 'should have errors');
});

test('returns valid:false for schema missing definitions', () => {
  const result = validateSchema(schemaMissingDefinitions);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.errors.length > 0, 'should have errors');
  assert(result.errors[0].includes('definitions'), 'error should mention definitions');
});

test('returns valid:false when BuiltinAgentNameSchema missing', () => {
  const result = validateSchema(schemaMissingAgentSchema);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.missingDefinitions.includes('BuiltinAgentNameSchema'), 'should report missing agent schema');
});

test('returns valid:false when BuiltinSkillNameSchema missing', () => {
  const result = validateSchema(schemaMissingSkillSchema);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.missingDefinitions.includes('BuiltinSkillNameSchema'), 'should report missing skill schema');
});

test('returns valid:false for empty definitions', () => {
  const result = validateSchema(schemaEmptyDefinitions);
  assertEqual(result.valid, false, 'valid should be false');
  assertEqual(result.missingDefinitions.length, 2, 'should report both missing');
});

// =============================
// extractAgentsFromSchema tests
// =============================

console.log('');
console.log('extractAgentsFromSchema:');

test('extracts agents from valid schema', () => {
  const agents = extractAgentsFromSchema(validSchema);
  assertArrayEqual(agents, ['oracle', 'librarian', 'sisyphus'], 'should return agent enum');
});

test('returns empty array for null schema', () => {
  const agents = extractAgentsFromSchema(null);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for undefined schema', () => {
  const agents = extractAgentsFromSchema(undefined);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for array schema', () => {
  const agents = extractAgentsFromSchema([]);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for schema missing definitions', () => {
  const agents = extractAgentsFromSchema(schemaMissingDefinitions);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for schema missing BuiltinAgentNameSchema', () => {
  const agents = extractAgentsFromSchema(schemaMissingAgentSchema);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for schema with malformed enum', () => {
  const agents = extractAgentsFromSchema(schemaMalformedEnum);
  assertArrayEqual(agents, [], 'should return empty array');
});

// =============================
// extractSkillsFromSchema tests
// =============================

console.log('');
console.log('extractSkillsFromSchema:');

test('extracts skills from valid schema', () => {
  const skills = extractSkillsFromSchema(validSchema);
  assertArrayEqual(skills, ['playwright', 'frontend-ui-ux', 'git-master'], 'should return skill enum');
});

test('returns empty array for null schema', () => {
  const skills = extractSkillsFromSchema(null);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('returns empty array for undefined schema', () => {
  const skills = extractSkillsFromSchema(undefined);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('returns empty array for array schema', () => {
  const skills = extractSkillsFromSchema([]);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('returns empty array for schema missing definitions', () => {
  const skills = extractSkillsFromSchema(schemaMissingDefinitions);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('returns empty array for schema missing BuiltinSkillNameSchema', () => {
  const skills = extractSkillsFromSchema(schemaMissingSkillSchema);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('returns empty array for schema with malformed enum', () => {
  const skills = extractSkillsFromSchema(schemaMalformedEnum);
  assertArrayEqual(skills, [], 'should return empty array');
});

// Summary
console.log('');
console.log('='.repeat(50));
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed > 0) {
  console.log('');
  process.exit(1);
}

console.log('');
console.log('All tests passed!');
process.exit(0);
