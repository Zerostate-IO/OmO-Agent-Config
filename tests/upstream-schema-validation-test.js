#!/usr/bin/env node

/**
 * Tests for upstream.js schema validation functions
 * Deterministic - no live network calls, uses in-memory fixtures
 *
 * Covers both legacy definitions-based schema layout and
 * current draft-07 properties-based schema layout.
 */

const assert = require('assert');
const {
  validateSchema,
  detectSchemaLayout,
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

// ===========================================
// Legacy definitions-based fixtures
// ===========================================

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

const schemaMissingDefinitions = {
  type: 'object',
  properties: {}
};

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

const schemaEmptyDefinitions = {
  definitions: {}
};

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

// ===========================================
// Current draft-07 properties-based fixtures
// ===========================================

const draft7SchemaFull = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    agents: {
      type: 'object',
      properties: {
        oracle: { type: 'object', properties: { model: { type: 'string' } } },
        sisyphus: { type: 'object', properties: { model: { type: 'string' } } },
        explore: { type: 'object', properties: { model: { type: 'string' } } },
        'multimodal-looker': { type: 'object', properties: { model: { type: 'string' } } }
      }
    },
    disabled_skills: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['playwright', 'frontend-ui-ux', 'git-master', 'agent-browser']
      }
    },
    disabled_commands: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['init-deep', 'ralph-loop', 'refactor']
      }
    }
  },
  additionalProperties: false
};

const draft7SchemaNoSkills = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    agents: {
      type: 'object',
      properties: {
        oracle: { type: 'object' }
      }
    }
  },
  additionalProperties: false
};

const draft7SchemaNoCommands = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    agents: {
      type: 'object',
      properties: {
        oracle: { type: 'object' }
      }
    },
    disabled_skills: {
      type: 'array',
      items: { type: 'string', enum: ['playwright'] }
    }
  },
  additionalProperties: false
};

const draft7SchemaNoAgents = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    disabled_skills: {
      type: 'array',
      items: { type: 'string', enum: ['playwright'] }
    },
    disabled_commands: {
      type: 'array',
      items: { type: 'string', enum: ['init-deep'] }
    }
  },
  additionalProperties: false
};

// ===========================================
// Tests
// ===========================================

console.log('Upstream Schema Validation Tests');
console.log('='.repeat(50));
console.log('');

// =====================
// detectSchemaLayout tests
// =====================

console.log('detectSchemaLayout:');

test('returns "definitions" for legacy schema with BuiltinAgentNameSchema', () => {
  assertEqual(detectSchemaLayout(validSchema), 'definitions', 'layout');
});

test('returns "definitions" for schema with only BuiltinSkillNameSchema', () => {
  assertEqual(detectSchemaLayout(schemaMissingAgentSchema), 'definitions', 'layout');
});

test('returns "draft7-properties" for current schema with agents.properties', () => {
  assertEqual(detectSchemaLayout(draft7SchemaFull), 'draft7-properties', 'layout');
});

test('returns "draft7-properties" for current schema missing agents', () => {
  // Has disabled_skills + disabled_commands but no agents.properties → still "draft7-properties"
  assertEqual(detectSchemaLayout(draft7SchemaNoAgents), 'draft7-properties', 'layout');
});

test('returns "unknown" for schema with no definitions or agents.properties', () => {
  assertEqual(detectSchemaLayout(schemaMissingDefinitions), 'unknown', 'layout');
});

test('returns "unknown" for null schema', () => {
  assertEqual(detectSchemaLayout(null), 'unknown', 'layout');
});

test('returns "unknown" for empty object', () => {
  assertEqual(detectSchemaLayout({}), 'unknown', 'layout');
});

test('returns "unknown" for array', () => {
  assertEqual(detectSchemaLayout([]), 'unknown', 'layout');
});

// =====================
// validateSchema tests (legacy)
// =====================

console.log('');
console.log('validateSchema (legacy definitions layout):');

test('returns valid:true for valid legacy schema', () => {
  const result = validateSchema(validSchema);
  assertEqual(result.valid, true, 'valid should be true');
  assertEqual(result.layout, 'definitions', 'layout');
  assertArrayEqual(result.missingDefinitions, [], 'missingDefinitions should be empty');
  assertArrayEqual(result.missingSections, [], 'missingSections should be empty');
  assertArrayEqual(result.errors, [], 'errors should be empty');
});

test('returns valid:false for null schema', () => {
  const result = validateSchema(null);
  assertEqual(result.valid, false, 'valid should be false');
  assertEqual(result.layout, 'unknown', 'layout');
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
  assertEqual(result.layout, 'unknown', 'layout');
  assert(result.errors.length > 0, 'should have errors');
  assert(result.errors[0].includes('unrecognized layout'), 'error should mention unrecognized layout');
});

test('returns valid:false when BuiltinAgentNameSchema missing', () => {
  const result = validateSchema(schemaMissingAgentSchema);
  assertEqual(result.valid, false, 'valid should be false');
  assertEqual(result.layout, 'definitions', 'layout');
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
  assertEqual(result.layout, 'unknown', 'layout');
  assertEqual(result.missingDefinitions.length, 0, 'no missing definitions for unknown layout');
});

// =====================
// validateSchema tests (draft-07)
// =====================

console.log('');
console.log('validateSchema (draft-07 properties layout):');

test('returns valid:true for full draft-07 schema', () => {
  const result = validateSchema(draft7SchemaFull);
  assertEqual(result.valid, true, 'valid should be true');
  assertEqual(result.layout, 'draft7-properties', 'layout');
  assertArrayEqual(result.missingDefinitions, [], 'missingDefinitions should be empty');
  assertArrayEqual(result.missingSections, [], 'missingSections should be empty');
  assertArrayEqual(result.errors, [], 'errors should be empty');
});

test('returns valid:false for draft-07 schema missing agents', () => {
  const result = validateSchema(draft7SchemaNoAgents);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.missingSections.includes('agents'), 'should report missing agents section');
});

test('returns valid:false for draft-07 schema missing disabled_commands', () => {
  const result = validateSchema(draft7SchemaNoCommands);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.missingSections.includes('disabled_commands'), 'should report missing disabled_commands');
});

test('returns valid:false for draft-07 schema missing disabled_skills', () => {
  const result = validateSchema(draft7SchemaNoSkills);
  assertEqual(result.valid, false, 'valid should be false');
  assert(result.missingSections.includes('disabled_skills'), 'should report missing disabled_skills');
  assert(result.missingSections.includes('disabled_commands'), 'should report missing disabled_commands');
});

// =============================
// extractAgentsFromSchema tests (legacy)
// =============================

console.log('');
console.log('extractAgentsFromSchema (legacy definitions):');

test('extracts agents from valid legacy schema', () => {
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
// extractAgentsFromSchema tests (draft-07)
// =============================

console.log('');
console.log('extractAgentsFromSchema (draft-07 properties):');

test('extracts agent names from properties.agents.properties keys', () => {
  const agents = extractAgentsFromSchema(draft7SchemaFull);
  assertArrayEqual(agents, ['oracle', 'sisyphus', 'explore', 'multimodal-looker'], 'should return agent property keys');
});

test('returns empty array for draft-07 schema without agents.properties', () => {
  const agents = extractAgentsFromSchema(draft7SchemaNoAgents);
  assertArrayEqual(agents, [], 'should return empty array');
});

test('returns empty array for draft-07 schema where agents has no properties', () => {
  const agents = extractAgentsFromSchema({
    properties: { agents: { type: 'object' } }
  });
  assertArrayEqual(agents, [], 'should return empty array');
});

// =============================
// extractSkillsFromSchema tests (legacy)
// =============================

console.log('');
console.log('extractSkillsFromSchema (legacy definitions):');

test('extracts skills from valid legacy schema', () => {
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

// =============================
// extractSkillsFromSchema tests (draft-07)
// =============================

console.log('');
console.log('extractSkillsFromSchema (draft-07 properties):');

test('extracts skills from disabled_skills and disabled_commands enums', () => {
  const skills = extractSkillsFromSchema(draft7SchemaFull);
  // Should combine both arrays without duplicates
  assert(skills.includes('playwright'), 'should include playwright from disabled_skills');
  assert(skills.includes('init-deep'), 'should include init-deep from disabled_commands');
  assert(skills.includes('frontend-ui-ux'), 'should include frontend-ui-ux from disabled_skills');
  assert(skills.includes('refactor'), 'should include refactor from disabled_commands');
  assertEqual(skills.length, 7, 'should have 7 unique skills total');
});

test('returns only disabled_skills when disabled_commands absent', () => {
  const skills = extractSkillsFromSchema(draft7SchemaNoCommands);
  assertArrayEqual(skills, ['playwright'], 'should return skills from disabled_skills only');
});

test('returns empty array for schema with no skill/command locations', () => {
  const skills = extractSkillsFromSchema(draft7SchemaNoSkills);
  assertArrayEqual(skills, [], 'should return empty array');
});

test('deduplicates across disabled_skills and disabled_commands', () => {
  const schema = {
    properties: {
      agents: { properties: { oracle: {} } },
      disabled_skills: {
        type: 'array',
        items: { type: 'string', enum: ['shared-item', 'skills-only'] }
      },
      disabled_commands: {
        type: 'array',
        items: { type: 'string', enum: ['shared-item', 'commands-only'] }
      }
    }
  };
  const skills = extractSkillsFromSchema(schema);
  assertEqual(skills.length, 3, 'should deduplicate shared-item');
  assert(skills.includes('shared-item'), 'should include shared-item once');
  assert(skills.includes('skills-only'), 'should include skills-only');
  assert(skills.includes('commands-only'), 'should include commands-only');
});

// =============================
// Cross-layout compatibility
// =============================

console.log('');
console.log('Cross-layout compatibility:');

test('legacy fixture still passes validation', () => {
  const result = validateSchema(validSchema);
  assertEqual(result.valid, true, 'legacy schema should still be valid');
  assertEqual(result.layout, 'definitions', 'legacy schema should have definitions layout');
});

test('draft-07 fixture validates as true even without definitions', () => {
  const result = validateSchema(draft7SchemaFull);
  assertEqual(result.valid, true, 'draft-07 schema should be valid without definitions');
  assertEqual(result.layout, 'draft7-properties', 'should have draft7-properties layout');
  assertArrayEqual(result.missingDefinitions, [], 'no missing definitions expected');
});

test('both layouts extract agents correctly', () => {
  const legacyAgents = extractAgentsFromSchema(validSchema);
  const draft7Agents = extractAgentsFromSchema(draft7SchemaFull);
  assert(legacyAgents.length > 0, 'legacy should find agents');
  assert(draft7Agents.length > 0, 'draft-07 should find agents');
  // Overlapping agent
  assert(legacyAgents.includes('oracle'), 'legacy has oracle');
  assert(draft7Agents.includes('oracle'), 'draft-07 has oracle');
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
