const { DEFAULTS, AGENT_PROFILES, normalizeAgentKey } = require('./constants');

function validateConfig(config) {
  const issues = {
    missingAgents: [],
    missingMcps: [],
    extraAgents: [],
    extraMcps: []
  };

  const configAgents = config?.agents || {};
  const configMcps = config?.mcps || {};
  const defaultAgents = DEFAULTS.agents || {};
  const defaultMcps = DEFAULTS.mcps || {};

  // Normalize config agent keys for comparison
  const normalizedConfigAgents = {};
  for (const [key, value] of Object.entries(configAgents)) {
    const normalizedKey = normalizeAgentKey(key);
    // Preserve the original key if canonical doesn't exist, otherwise prefer existing
    if (!normalizedConfigAgents[normalizedKey]) {
      normalizedConfigAgents[normalizedKey] = { ...value, _originalKey: key };
    }
  }

  // Normalize default agent keys for comparison
  const normalizedDefaultAgents = {};
  for (const [key, value] of Object.entries(defaultAgents)) {
    normalizedDefaultAgents[normalizeAgentKey(key)] = value;
  }

  // Check for missing agents (in defaults but not in config)
  for (const agentName of Object.keys(normalizedDefaultAgents)) {
    if (!normalizedConfigAgents[agentName]) {
      issues.missingAgents.push({
        name: agentName,
        defaultModel: normalizedDefaultAgents[agentName].model,
        description: AGENT_PROFILES[agentName]?.description || AGENT_PROFILES[normalizeAgentKey(agentName)]?.description || 'oh-my-openagent built-in agent'
      });
    }
  }

  for (const mcpName of Object.keys(defaultMcps)) {
    if (!configMcps[mcpName]) {
      issues.missingMcps.push({
        name: mcpName,
        config: defaultMcps[mcpName]
      });
    }
  }

  // Check for extra agents (in config but not in defaults)
  // Use original keys for reporting to preserve user's config structure
  for (const [originalKey, agentData] of Object.entries(configAgents)) {
    const normalizedKey = normalizeAgentKey(originalKey);
    if (!normalizedDefaultAgents[normalizedKey]) {
      issues.extraAgents.push({
        name: originalKey,
        model: agentData.model
      });
    }
  }

  for (const mcpName of Object.keys(configMcps)) {
    if (!defaultMcps[mcpName]) {
      issues.extraMcps.push({
        name: mcpName
      });
    }
  }

  const hasIssues = issues.missingAgents.length > 0 ||
                    issues.missingMcps.length > 0 ||
                    issues.extraAgents.length > 0 ||
                    issues.extraMcps.length > 0;

  return hasIssues ? issues : null;
}

function addAllMissing(config, issues) {
  let added = 0;

  if (!config.agents) config.agents = {};
  for (const agent of issues.missingAgents) {
    config.agents[agent.name] = { model: agent.defaultModel };
    added++;
  }

  if (!config.mcps) config.mcps = {};
  for (const mcp of issues.missingMcps) {
    config.mcps[mcp.name] = mcp.config;
    added++;
  }

  return added;
}

function addMissingAgent(config, agent) {
  if (!config.agents) config.agents = {};
  config.agents[agent.name] = { model: agent.defaultModel };
}

function addMissingMcp(config, mcp) {
  if (!config.mcps) config.mcps = {};
  config.mcps[mcp.name] = mcp.config;
}

module.exports = {
  validateConfig,
  addAllMissing,
  addMissingAgent,
  addMissingMcp
};
