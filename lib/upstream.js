const { UPSTREAM_OWNER, UPSTREAM_REPO, getSchemaUrl } = require('./upstream-constants');

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'application/vnd.github+json'
      }
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}`));
          }
          return;
        }
        reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'opencode-agent-config'
      }
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getLatestReleaseTag(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const data = await fetchJson(url);
  if (!data || !data.tag_name) {
    throw new Error('Latest release tag not found');
  }
  return data.tag_name;
}

function getCachedSchema(cacheDir) {
  const cachePath = path.join(cacheDir, 'omo-schema.json');
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeCachedSchema(cacheDir, payload) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'omo-schema.json');
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
}

/**
 * Detect schema layout: legacy definitions-based or current draft-07 properties-based.
 * @param {Object} schema - Parsed schema object
 * @returns {'definitions'|'draft7-properties'|'unknown'} Layout identifier
 */
function detectSchemaLayout(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return 'unknown';
  }

  // Legacy layout: definitions.BuiltinAgentNameSchema / BuiltinSkillNameSchema
  const hasLegacyDefinitions =
    schema.definitions &&
    typeof schema.definitions === 'object' &&
    (schema.definitions.BuiltinAgentNameSchema || schema.definitions.BuiltinSkillNameSchema);

  if (hasLegacyDefinitions) {
    return 'definitions';
  }

  // Current draft-07 layout: properties.agents.properties (agent names as keys),
  // or properties.disabled_skills / properties.disabled_commands
  const props = schema.properties;
  if (props && typeof props === 'object') {
    const hasDraft7Agents = props.agents && typeof props.agents === 'object' && props.agents.properties && typeof props.agents.properties === 'object';
    const hasDraft7Skills = props.disabled_skills && typeof props.disabled_skills === 'object';
    const hasDraft7Commands = props.disabled_commands && typeof props.disabled_commands === 'object';

    if (hasDraft7Agents || hasDraft7Skills || hasDraft7Commands) {
      return 'draft7-properties';
    }
  }

  return 'unknown';
}

function extractAgentsFromSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [];
  }

  // Legacy: definitions.BuiltinAgentNameSchema.enum
  if (schema.definitions && schema.definitions.BuiltinAgentNameSchema) {
    const agentDef = schema.definitions.BuiltinAgentNameSchema;
    if (agentDef.enum && Array.isArray(agentDef.enum)) {
      return agentDef.enum;
    }
  }

  // Current draft-07: properties.agents.properties keys
  if (
    schema.properties &&
    schema.properties.agents &&
    schema.properties.agents.properties &&
    typeof schema.properties.agents.properties === 'object'
  ) {
    return Object.keys(schema.properties.agents.properties);
  }

  return [];
}

function extractSkillsFromSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [];
  }

  // Legacy: definitions.BuiltinSkillNameSchema.enum
  if (schema.definitions && schema.definitions.BuiltinSkillNameSchema) {
    const skillDef = schema.definitions.BuiltinSkillNameSchema;
    if (skillDef.enum && Array.isArray(skillDef.enum)) {
      return skillDef.enum;
    }
  }

  // Current draft-07: collect from properties.disabled_skills.items.enum
  // and properties.disabled_commands.items.enum
  const skills = [];

  if (schema.properties && typeof schema.properties === 'object') {
    // Extract from disabled_skills
    const disabledSkills = schema.properties.disabled_skills;
    if (
      disabledSkills &&
      disabledSkills.items &&
      Array.isArray(disabledSkills.items.enum)
    ) {
      for (const s of disabledSkills.items.enum) {
        if (!skills.includes(s)) skills.push(s);
      }
    }

    // Extract from disabled_commands
    const disabledCommands = schema.properties.disabled_commands;
    if (
      disabledCommands &&
      disabledCommands.items &&
      Array.isArray(disabledCommands.items.enum)
    ) {
      for (const s of disabledCommands.items.enum) {
        if (!skills.includes(s)) skills.push(s);
      }
    }
  }

  return skills;
}

/**
 * Validate schema structure, supporting both legacy definitions-based
 * and current draft-07 properties-based layouts.
 * @param {Object} schema - Parsed schema object
 * @returns {Object} Validation result with valid, layout, missingDefinitions, missingSections, errors
 */
function validateSchema(schema) {
  const errors = [];
  const missingDefinitions = [];
  const missingSections = [];

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    errors.push('Schema is not a valid object');
    return {
      valid: false,
      layout: 'unknown',
      missingDefinitions: [],
      missingSections: [],
      errors
    };
  }

  const layout = detectSchemaLayout(schema);

  if (layout === 'definitions') {
    // Legacy layout: require BuiltinAgentNameSchema and BuiltinSkillNameSchema
    const requiredDefs = ['BuiltinAgentNameSchema', 'BuiltinSkillNameSchema'];
    for (const defName of requiredDefs) {
      if (!schema.definitions[defName]) {
        missingDefinitions.push(defName);
      }
    }

    if (missingDefinitions.length > 0) {
      return {
        valid: false,
        layout,
        missingDefinitions,
        missingSections: [],
        errors
      };
    }

    return {
      valid: true,
      layout,
      missingDefinitions: [],
      missingSections: [],
      errors: []
    };
  }

  if (layout === 'draft7-properties') {
    // Current draft-07 layout: check for agents, disabled_skills, disabled_commands
    const props = schema.properties;

    if (!props.agents || !props.agents.properties) {
      missingSections.push('agents');
    }
    if (!props.disabled_skills || !props.disabled_skills.items || !Array.isArray(props.disabled_skills.items.enum)) {
      missingSections.push('disabled_skills');
    }
    if (!props.disabled_commands || !props.disabled_commands.items || !Array.isArray(props.disabled_commands.items.enum)) {
      missingSections.push('disabled_commands');
    }

    if (missingSections.length > 0) {
      return {
        valid: false,
        layout,
        missingDefinitions: [],
        missingSections,
        errors
      };
    }

    return {
      valid: true,
      layout,
      missingDefinitions: [],
      missingSections: [],
      errors: []
    };
  }

  // Unknown layout
  errors.push('Schema has unrecognized layout: no definitions or draft-07 properties found');
  return {
    valid: false,
    layout: 'unknown',
    missingDefinitions: [],
    missingSections: [],
    errors
  };
}

/**
 * Compare agents and skills between old and new schema
 */
function compareAgentsAndSkills(oldSchema, newSchema) {
  const oldAgents = extractAgentsFromSchema(oldSchema);
  const newAgents = extractAgentsFromSchema(newSchema);
  const oldSkills = extractSkillsFromSchema(oldSchema);
  const newSkills = extractSkillsFromSchema(newSchema);

  const addedAgents = newAgents.filter(a => !oldAgents.includes(a));
  const removedAgents = oldAgents.filter(a => !newAgents.includes(a));
  const addedSkills = newSkills.filter(s => !oldSkills.includes(s));
  const removedSkills = oldSkills.filter(s => !newSkills.includes(s));

  const hasChanges = addedAgents.length > 0 || removedAgents.length > 0 ||
                     addedSkills.length > 0 || removedSkills.length > 0;

  return {
    hasChanges,
    agents: {
      added: addedAgents,
      removed: removedAgents
    },
    skills: {
      added: addedSkills,
      removed: removedSkills
    }
  };
}

async function checkAndUpdateOhMyOpenCodeSchema({ cacheDir }) {
  const tag = await getLatestReleaseTag(UPSTREAM_OWNER, UPSTREAM_REPO);
  const schemaUrl = getSchemaUrl(tag);

  const schemaText = await fetchText(schemaUrl);
  const hash = sha256(schemaText);

  const cached = getCachedSchema(cacheDir);
  let newSchemaObj;

  try {
    newSchemaObj = JSON.parse(schemaText);
  } catch (e) {
    // Failure-tolerant: return explicit error about invalid JSON schema
    return {
      updated: false,
      tag,
      url: schemaUrl,
      error: 'Invalid schema: malformed JSON',
      parseError: e.message,
      valid: false,
      definitionsError: null,
      missingDefinitions: [],
      diff: null
    };
  }

  // Failure-tolerant: validate schema structure
  const validation = validateSchema(newSchemaObj);
  if (!validation.valid) {
    return {
      updated: false,
      tag,
      url: schemaUrl,
      error: validation.errors.length > 0 ? `Schema validation failed: ${validation.errors.join(', ')}` : 'Schema structure invalid',
      valid: false,
      layout: validation.layout,
      definitionsError: validation.missingDefinitions.length > 0 ? `missing definitions: ${validation.missingDefinitions.join(', ')}` : null,
      missingDefinitions: validation.missingDefinitions,
      missingSections: validation.missingSections,
      diff: null
    };
  }

  let diff = null;
  if (cached && cached.sha256 !== hash && cached.schema) {
    const oldSchema = cached.schema;
    diff = compareAgentsAndSkills(oldSchema, newSchemaObj);
  }

  writeCachedSchema(cacheDir, {
    tag,
    url: schemaUrl,
    sha256: hash,
    downloaded_at: new Date().toISOString(),
    schema: newSchemaObj
  });

  return { updated: true, valid: true, layout: validation.layout, tag, url: schemaUrl, diff };
}

module.exports = {
  checkAndUpdateOhMyOpenCodeSchema,
  detectSchemaLayout,
  extractAgentsFromSchema,
  extractSkillsFromSchema,
  getCachedSchema,
  validateSchema
};
