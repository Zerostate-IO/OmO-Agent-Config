/**
 * Agent documentation system - Fetches and parses agent data from GitHub
 * Handles discovery, caching, and parsing of agent TypeScript files
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('../constants');

// Cache configuration
const AGENT_CACHE_DIR = path.join(CACHE_DIR, 'agents');
const AGENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// GitHub configuration
const GITHUB_OWNER = 'code-yeongyu';
const GITHUB_REPO = 'oh-my-opencode';
const GITHUB_BRANCH = 'dev';

/**
 * Fetch text content from URL
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'text/plain,application/vnd.github.v3.raw'
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Fetch JSON from GitHub API
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
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
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * List agents directory on GitHub
 */
async function listAgentsFromGitHub() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/agents?ref=${GITHUB_BRANCH}`;
  
  const entries = await fetchJson(url);
  const agents = [];
  
  for (const entry of entries) {
    if (entry.type === 'file' && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      agents.push({
        name: entry.name.replace('.ts', ''),
        type: 'file',
        url: entry.download_url
      });
    } else if (entry.type === 'dir' && !entry.name.startsWith('.') && !entry.name.includes('builtin')) {
      agents.push({
        name: entry.name,
        type: 'directory',
        url: entry.url
      });
    }
  }
  
  return agents;
}

/**
 * Get agent content from GitHub
 */
async function fetchAgentContent(agentName, agentInfo) {
  if (agentInfo.type === 'file') {
    return await fetchText(agentInfo.url);
  } else {
    // Directory-based agent - fetch main files
    const dirContents = await fetchJson(agentInfo.url);
    const mainFile = dirContents.find(f => 
      f.name === 'agent.ts' || f.name === 'default.ts' || f.name === 'index.ts'
    );
    
    if (mainFile) {
      return await fetchText(mainFile.download_url);
    }
    
    // If no main file, return first .ts file
    const firstTs = dirContents.find(f => f.name.endsWith('.ts') && !f.name.includes('.test.'));
    if (firstTs) {
      return await fetchText(firstTs.download_url);
    }
    
    throw new Error(`No TypeScript files found in ${agentName}`);
  }
}

/**
 * Parse agent metadata from TypeScript code
 */
function parseAgentMetadata(agentName, code) {
  const metadata = {
    name: agentName,
    description: '',
    category: 'utility',
    cost: 'MODERATE',
    access: 'unknown',
    capabilities: [],
    minContext: 128000,
    thinking: false,
    fallbackChain: [],
    toolAccess: { allowed: [], denied: [] },
    role: '',
    behaviors: [],
    rawPrompt: ''
  };
  
  // Extract PROMPT_METADATA
  const metadataRegex = new RegExp(
    `${agentName.toUpperCase().replace(/-/g, '_')}_PROMPT_METADATA\\s*:\\s*AgentPromptMetadata\s*=\\s*({[\\s\\S]*?})(?:;|$)`,
    'i'
  );
  const metadataMatch = code.match(metadataRegex);
  
  if (metadataMatch) {
    const metaText = metadataMatch[1];
    
    // Parse category
    const categoryMatch = metaText.match(/category:\s*"([^"]+)"/);
    if (categoryMatch) metadata.category = categoryMatch[1];
    
    // Parse cost
    const costMatch = metaText.match(/cost:\s*"([^"]+)"/);
    if (costMatch) metadata.cost = costMatch[1];
    
    // Parse promptAlias
    const aliasMatch = metaText.match(/promptAlias:\s*"([^"]+)"/);
    if (aliasMatch) metadata.displayName = aliasMatch[1];
  }
  
  // Extract description from create function
  const descMatch = code.match(/description:\s*"([^"]+)"/);
  if (descMatch) {
    metadata.description = descMatch[1];
  }
  
  // Extract role section
  const roleMatch = code.match(/<Role>([\s\S]*?)<\/Role>/);
  if (roleMatch) {
    metadata.role = extractRoleInfo(roleMatch[1]);
  }
  
  // Extract behavior instructions
  const behaviorMatch = code.match(/<Behavior_Instructions>([\s\S]*?)<\/Behavior_Instructions>/);
  if (behaviorMatch) {
    metadata.behaviors = extractBehaviors(behaviorMatch[1]);
  }
  
  // Extract constraints/tool access
  const constraintsMatch = code.match(/<Constraints>([\s\S]*?)<\/Constraints>/);
  if (constraintsMatch) {
    metadata.toolAccess = extractToolAccess(constraintsMatch[1]);
  }
  
  // Extract fallback chain from AGENTS.md format in code
  const fallbackMatch = code.match(/fallback.*?:\s*\[([^\]]+)\]/i);
  if (fallbackMatch) {
    metadata.fallbackChain = fallbackMatch[1]
      .split(',')
      .map(s => s.trim().replace(/"/g, ''))
      .filter(s => s);
  }
  
  // Check for thinking capability
  metadata.thinking = code.includes('thinking:') || code.includes('budgetTokens');
  
  // Extract full prompt
  const promptMatch = code.match(/return\s+`([\\s\\S]*?)`;?\s*}$/);
  if (promptMatch) {
    metadata.rawPrompt = promptMatch[1].slice(0, 2000); // Limit size
  }
  
  // Infer capabilities from content
  if (code.includes('multimodal') || code.includes('image') || code.includes('vision')) {
    metadata.capabilities.push('multimodal');
  }
  if (code.includes('reasoning')) {
    metadata.capabilities.push('reasoning');
  }
  if (code.includes('extended thinking') || metadata.thinking) {
    metadata.capabilities.push('thinking');
  }

  const accessText = String(code || '');
  const looksReadOnly = /\bread[-\s]?only\b|\bconsultation\s+only\b|\bresearch\s+only\b|\bcannot\s+(write|edit|modify)\b|\bno\s+(write|edit)\b/i.test(accessText);
  const looksPlanOnly = /\.sisyphus\//i.test(accessText) && /plan|planning|markdown/i.test(accessText);
  if (looksPlanOnly) {
    metadata.access = 'limited';
  } else if (looksReadOnly) {
    metadata.access = 'read-only';
  } else {
    metadata.access = 'write';
  }
  
  // Set context requirements based on cost
  if (metadata.cost === 'EXPENSIVE') {
    metadata.minContext = 200000;
  } else if (metadata.cost === 'CHEAP') {
    metadata.minContext = 64000;
  }
  
  return metadata;
}

/**
 * Extract role information from role section
 */
function extractRoleInfo(roleText) {
  const role = {
    identity: '',
    coreCompetencies: []
  };
  
  // Extract identity/title
  const identityMatch = roleText.match(/Identity[\s\S]*?:\s*([^\n]+)/i);
  if (identityMatch) {
    role.identity = identityMatch[1].trim();
  }
  
  // Extract core competencies
  const competenciesMatch = roleText.match(/Core Competencies[\s\S]*?:([\s\S]*?)(?:Operating|##|$)/i);
  if (competenciesMatch) {
    const compText = competenciesMatch[1];
    const items = compText.match(/-\s*([^\n]+)/g);
    if (items) {
      role.coreCompetencies = items.map(item => item.replace(/^-\s*/, '').trim());
    }
  }
  
  return role;
}

/**
 * Extract behaviors from behavior instructions
 */
function extractBehaviors(behaviorText) {
  const behaviors = [];
  
  // Look for phase sections using exec in a loop
  const phaseRegex = /## (Phase \d+)[\s\S]*?(?=## Phase \d+|##|$)/g;
  let phaseMatch = phaseRegex.exec(behaviorText);
  while (phaseMatch !== null) {
    const phaseTitle = phaseMatch[1];
    const phaseContent = phaseMatch[0];
    
    // Extract key behaviors from phase
    const keyBehaviors = phaseContent.match(/### ([^\n]+)/g);
    if (keyBehaviors) {
      keyBehaviors.forEach(behavior => {
        behaviors.push({
          phase: phaseTitle,
          title: behavior.replace(/^###\s*/, '').trim(),
          type: 'key_behavior'
        });
      });
    }

    phaseMatch = phaseRegex.exec(behaviorText);
  }
  
  // Also look for standalone behavior sections
  const sectionRegex = /(?:^|\n)([A-Z][^\n]+):\s*\n([\s\S]*?)(?=\n[A-Z]|$)/g;
  let sectionMatch = sectionRegex.exec(behaviorText);
  while (sectionMatch !== null) {
    if (sectionMatch[1].length < 50) {
      behaviors.push({
        title: sectionMatch[1].trim(),
        description: sectionMatch[2].slice(0, 200).trim(),
        type: 'section'
      });
    }

    sectionMatch = sectionRegex.exec(behaviorText);
  }

  return behaviors.slice(0, 10);
}

/**
 * Extract tool access from constraints section
 */
function extractToolAccess(constraintsText) {
  const access = {
    allowed: [],
    denied: [],
    notes: ''
  };
  
  // Look for allowed tools
  const allowedMatch = constraintsText.match(/Allowed:\s*([^\n]+)/i);
  if (allowedMatch) {
    access.allowed = allowedMatch[1].split(',').map(s => s.trim()).filter(s => s);
  }
  
  // Look for denied tools
  const deniedMatch = constraintsText.match(/Denied:\s*([^\n]+)/i);
  if (deniedMatch) {
    access.denied = deniedMatch[1].split(',').map(s => s.trim()).filter(s => s);
  }
  
  // Look for tool restrictions table (common in agents)
  const toolTableMatch = constraintsText.match(/\|[^|]+\|[^|]+\|/);
  if (toolTableMatch) {
    // Parse markdown table
    const lines = constraintsText.split('\n');
    lines.forEach(line => {
      if (line.includes('|') && !line.includes('---')) {
        const parts = line.split('|').filter(p => p.trim());
        if (parts.length >= 2) {
          const tool = parts[0].trim();
          const status = parts[1].trim().toLowerCase();
          if (status.includes('deny') || status.includes('forbid')) {
            if (!access.denied.includes(tool)) access.denied.push(tool);
          } else if (status.includes('allow') || status.includes('permit')) {
            if (!access.allowed.includes(tool)) access.allowed.push(tool);
          }
        }
      }
    });
  }
  
  return access;
}

/**
 * Get recommended model for agent based on metadata
 */
function scoreModelsForAgent(metadata, availableModels) {
  return availableModels
    .map(model => {
      let score = 0;

      const context = model.context || 0;
      if (context >= metadata.minContext) {
        score += 30;
        if (context >= 200000) score += 10;
      } else if (context >= metadata.minContext * 0.8) {
        score += 15;
      }

      if (metadata.capabilities.includes('thinking') && model.hasThinking) {
        score += 20;
      }
      if (metadata.capabilities.includes('reasoning') && model.capabilities?.reasoning) {
        score += 15;
      }
      if (metadata.capabilities.includes('multimodal') && model.capabilities?.input?.image) {
        score += 10;
      }

      if (metadata.cost === 'EXPENSIVE') {
        if (model.costDisplay?.includes('$$$')) score += 5;
      } else if (metadata.cost === 'CHEAP') {
        if (!model.costDisplay || model.costDisplay === '$') score += 10;
      }

      return { model, score };
    })
    .sort((a, b) => b.score - a.score);
}

function getRecommendedModel(metadata, availableModels) {
  const scored = scoreModelsForAgent(metadata, availableModels);
  return scored[0]?.model || availableModels[0];
}

function getRecommendedModels(metadata, availableModels, limit = 5) {
  const scored = scoreModelsForAgent(metadata, availableModels);
  return scored.slice(0, Math.max(0, limit)).map(entry => ({
    id: entry.model.id,
    name: entry.model.name || entry.model.id,
    score: entry.score,
    provider: entry.model.providerID || String(entry.model.id || '').split('/')[0]
  }));
}

/**
 * Save agent to cache
 */
async function saveAgentToCache(agentName, data) {
  try {
    fs.mkdirSync(AGENT_CACHE_DIR, { recursive: true });
    const cachePath = path.join(AGENT_CACHE_DIR, `${agentName}.json`);
    
    const cacheData = {
      ...data,
      cachedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
  } catch (e) {
    console.error(`Failed to cache agent ${agentName}:`, e.message);
  }
}

/**
 * Load agent from cache
 */
function loadAgentFromCache(agentName) {
  try {
    const cachePath = path.join(AGENT_CACHE_DIR, `${agentName}.json`);
    
    if (!fs.existsSync(cachePath)) return null;
    
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    
    // Check if cache is expired
    const age = Date.now() - new Date(data.cachedAt).getTime();
    if (age > AGENT_CACHE_TTL) {
      return null;
    }
    
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Get all cached agents
 */
function getAllCachedAgents() {
  try {
    if (!fs.existsSync(AGENT_CACHE_DIR)) return [];
    
    const files = fs.readdirSync(AGENT_CACHE_DIR).filter(f => f.endsWith('.json'));
    const agents = [];
    
    for (const file of files) {
      const agentName = file.replace('.json', '');
      const data = loadAgentFromCache(agentName);
      if (data) agents.push(data);
    }
    
    return agents;
  } catch (e) {
    return [];
  }
}

/**
 * Fetch and cache all agents from GitHub
 */
async function refreshAgentCache() {
  try {
    const agents = await listAgentsFromGitHub();
    const results = {
      updated: [],
      failed: [],
      total: agents.length
    };
    
    for (const agent of agents) {
      try {
        // Check if we have valid cache
        const cached = loadAgentFromCache(agent.name);
        if (cached) {
          continue; // Skip if cache is still valid
        }
        
        // Fetch fresh content
        const code = await fetchAgentContent(agent.name, agent);
        const metadata = parseAgentMetadata(agent.name, code);
        
        await saveAgentToCache(agent.name, metadata);
        results.updated.push(agent.name);
      } catch (e) {
        console.error(`Failed to fetch agent ${agent.name}:`, e.message);
        results.failed.push({ name: agent.name, error: e.message });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to refresh agent cache:', error);
    throw error;
  }
}

/**
 * Discover new agents not in local config
 */
async function discoverNewAgents(currentAgents) {
  const cached = getAllCachedAgents();
  const currentNames = new Set(currentAgents.map(a => a.name));
  
  const newAgents = cached.filter(agent => !currentNames.has(agent.name));
  
  return newAgents.map(agent => ({
    name: agent.name,
    description: agent.description,
    category: agent.category,
    cost: agent.cost,
    inferred: true
  }));
}

/**
 * Get agent documentation
 */
async function getAgentDocumentation(agentName, availableModels = []) {
  // Try cache first
  const cached = loadAgentFromCache(agentName);
  
  if (cached) {
    if (availableModels.length > 0) {
      cached.recommendedModel = getRecommendedModel(cached, availableModels);
      cached.recommendedModels = getRecommendedModels(cached, availableModels, 5);
    }
    return cached;
  }
  
  // Fetch from GitHub
  try {
    const agents = await listAgentsFromGitHub();
    const agentInfo = agents.find(a => a.name === agentName);
    
    if (!agentInfo) {
      throw new Error(`Agent ${agentName} not found in repository`);
    }
    
    const code = await fetchAgentContent(agentName, agentInfo);
    const metadata = parseAgentMetadata(agentName, code);
    
    await saveAgentToCache(agentName, metadata);
    
    if (availableModels.length > 0) {
      metadata.recommendedModel = getRecommendedModel(metadata, availableModels);
      metadata.recommendedModels = getRecommendedModels(metadata, availableModels, 5);
    }
    
    return metadata;
  } catch (error) {
    console.error(`Failed to get agent ${agentName}:`, error);
    throw error;
  }
}

/**
 * Get all agent documentation
 */
async function getAllAgentDocumentation(availableModels = []) {
  try {
    const cached = getAllCachedAgents();
    
    if (cached.length === 0) {
      // Fetch all if no cache
      await refreshAgentCache();
      return getAllCachedAgents();
    }
    
    // Add recommended models
    if (availableModels.length > 0) {
      cached.forEach(agent => {
        agent.recommendedModel = getRecommendedModel(agent, availableModels);
        agent.recommendedModels = getRecommendedModels(agent, availableModels, 5);
      });
    }
    
    return cached;
  } catch (error) {
    console.error('Failed to get all agents:', error);
    return [];
  }
}

module.exports = {
  fetchAgentContent,
  parseAgentMetadata,
  listAgentsFromGitHub,
  refreshAgentCache,
  discoverNewAgents,
  getAgentDocumentation,
  getAllAgentDocumentation,
  getAllCachedAgents,
  loadAgentFromCache,
  saveAgentToCache,
  getRecommendedModel,
  getRecommendedModels
};
