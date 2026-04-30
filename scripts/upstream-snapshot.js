#!/usr/bin/env node

/**
 * Upstream Snapshot Generator
 * 
 * Produces a normalized upstream snapshot JSON with stable schema:
 * - Fetches upstream model-requirements.ts
 * - Fetches upstream agent list + metadata
 * - Produces normalized snapshot with agents, categories, and discouraged entries
 * 
 * Usage:
 *   node scripts/upstream-snapshot.js [--json] [--output <file>]
 * 
 * Flags:
 *   --json          Output only JSON (no progress messages)
 *   --output <file> Write to file instead of stdout
 *   --no-cache      Skip cache read/write
 * 
 * Exit codes:
 *   0 - Success
 *   1 - Network error
 *   2 - Parse error
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
  UPSTREAM_BRANCH,
  UPSTREAM_REPO_FULL,
  getModelRequirementsUrl,
  getAgentsApiUrl,
  getCommitsApiUrl
} = require('../lib/upstream-constants');
// Configuration
const UPSTREAM = {
  repo: UPSTREAM_REPO_FULL,
  branch: UPSTREAM_BRANCH,
  modelRequirementsUrl: getModelRequirementsUrl(),
  agentsApiUrl: getAgentsApiUrl(),
  commitsApiUrl: getCommitsApiUrl()
};

const CACHE_FILE = path.join(os.homedir(), '.config', 'opencode', 'cache', 'upstream-snapshot.json');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const VERSION = '1.0.0';

// ANSI colors (only used in non-json mode)
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

/**
 * Fetch content from HTTPS URL
 * @param {string} url - URL to fetch
 * @param {Object} options - Request options
 * @returns {Promise<string>} Response body
 */
function fetchHttps(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      timeout: 15000,
      headers: options.headers || {}
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        fetchHttps(redirectUrl, options).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Fetch JSON from URL
 * @param {string} url - URL to fetch
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Parsed JSON
 */
async function fetchJson(url, options = {}) {
  const data = await fetchHttps(url, options);
  try {
    return JSON.parse(data);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${url}: ${e.message}`);
  }
}

/**
 * Get latest commit SHA from upstream
 * @returns {Promise<string|null>} Commit SHA or null
 */
async function getCommitSha() {
  try {
    const commits = await fetchJson(UPSTREAM.commitsApiUrl, {
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    return commits.sha || null;
  } catch (e) {
    return null;
  }
}

/**
 * Parse TypeScript model requirements from upstream source
 * Extracts AGENT_MODEL_REQUIREMENTS and CATEGORY_MODEL_REQUIREMENTS objects
 * @param {string} content - TypeScript file content
 * @returns {Object} Parsed requirements
 */
function parseModelRequirements(content) {
  const result = {
    agents: {},
    categories: {}
  };

  // Extract AGENT_MODEL_REQUIREMENTS - handles TypeScript with type annotations
  const agentMatch = content.match(/export\s+const\s+AGENT_MODEL_REQUIREMENTS(?:\s*:\s*[^=]+)?\s*=\s*({[\s\S]*?})\s*;?\s*(?:export|const|CATEGORY|$)/);
  if (agentMatch) {
    try {
      // Convert TypeScript object syntax to JSON-compatible format
      const cleaned = agentMatch[1]
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":');
      
      result.agents = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Failed to parse AGENT_MODEL_REQUIREMENTS: ${e.message}`);
    }
  }

  // Extract CATEGORY_MODEL_REQUIREMENTS - handles TypeScript with type annotations
  const categoryMatch = content.match(/export\s+const\s+CATEGORY_MODEL_REQUIREMENTS(?:\s*:\s*[^=]+)?\s*=\s*({[\s\S]*?})\s*;?\s*(?:export|const|$)/);
  if (categoryMatch) {
    try {
      const cleaned = categoryMatch[1]
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":');
      
      result.categories = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Failed to parse CATEGORY_MODEL_REQUIREMENTS: ${e.message}`);
    }
  }

  return result;
}

/**
 * List agents from GitHub API
 * @returns {Promise<Array>} List of agent entries
 */
async function listAgentsFromGitHub() {
  const entries = await fetchJson(UPSTREAM.agentsApiUrl, {
    headers: {
      'User-Agent': 'opencode-agent-config',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  const agents = [];
  
  for (const entry of entries) {
    if (entry.type === 'file' && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      agents.push({
        name: entry.name.replace('.ts', ''),
        type: 'file',
        url: entry.download_url,
        sha: entry.sha
      });
    } else if (entry.type === 'dir' && !entry.name.startsWith('.') && !entry.name.includes('builtin')) {
      agents.push({
        name: entry.name,
        type: 'directory',
        url: entry.url,
        sha: entry.sha
      });
    }
  }
  
  return agents;
}

/**
 * Fetch agent content from GitHub
 * @param {Object} agentInfo - Agent info from list
 * @returns {Promise<string>} Agent TypeScript content
 */
async function fetchAgentContent(agentInfo) {
  if (agentInfo.type === 'file') {
    return await fetchHttps(agentInfo.url, {
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'text/plain,application/vnd.github.v3.raw'
      }
    });
  } else {
    // Directory-based agent - fetch main files
    const dirContents = await fetchJson(agentInfo.url, {
      headers: {
        'User-Agent': 'opencode-agent-config',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const mainFile = dirContents.find(f => 
      f.name === 'agent.ts' || f.name === 'default.ts' || f.name === 'index.ts'
    );
    
    if (mainFile) {
      return await fetchHttps(mainFile.download_url, {
        headers: {
          'User-Agent': 'opencode-agent-config',
          'Accept': 'text/plain,application/vnd.github.v3.raw'
        }
      });
    }
    
    // If no main file, return first .ts file
    const firstTs = dirContents.find(f => f.name.endsWith('.ts') && !f.name.includes('.test.'));
    if (firstTs) {
      return await fetchHttps(firstTs.download_url, {
        headers: {
          'User-Agent': 'opencode-agent-config',
          'Accept': 'text/plain,application/vnd.github.v3.raw'
        }
      });
    }
    
    throw new Error(`No TypeScript files found in ${agentInfo.name}`);
  }
}

/**
 * Parse agent metadata from TypeScript code
 * @param {string} agentName - Agent name
 * @param {string} code - TypeScript code
 * @returns {Object} Parsed metadata
 */
function parseAgentMetadata(agentName, code) {
  const metadata = {
    description: '',
    category: 'utility',
    cost: 'MODERATE',
    capabilities: [],
    thinking: false
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
  
  // Check for thinking capability
  metadata.thinking = code.includes('thinking:') || code.includes('budgetTokens');
  
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
  
  return metadata;
}

/**
 * Extract gating info from model requirements entry
 * @param {Object} entry - Model requirement entry
 * @returns {Object} Gating information
 */
function extractGating(entry) {
  return {
    requiresProvider: entry.requiresProvider || null,
    requiresModel: entry.requiresModel || null,
    requiresAnyModel: entry.requiresAnyModel || false,
    variant: entry.variant || null
  };
}

/**
 * Build normalized agent entry
 * @param {string} name - Agent name
 * @param {Object} requirements - Model requirements entry
 * @param {Object} metadata - Parsed metadata
 * @returns {Object} Normalized agent entry
 */
function buildAgentEntry(name, requirements, metadata) {
  return {
    name,
    fallbackChain: requirements.fallbackChain || [],
    gating: extractGating(requirements),
    metadata: {
      description: metadata.description || '',
      category: metadata.category || 'utility',
      cost: metadata.cost || 'MODERATE',
      capabilities: metadata.capabilities || [],
      thinking: metadata.thinking || false
    }
  };
}

/**
 * Build normalized category entry
 * @param {string} name - Category name
 * @param {Object} requirements - Model requirements entry
 * @returns {Object} Normalized category entry
 */
function buildCategoryEntry(name, requirements) {
  return {
    name,
    fallbackChain: requirements.fallbackChain || [],
    gating: extractGating(requirements)
  };
}

/**
 * Scan for discouraged entries (simplified version)
 * Looks for patterns in agent code that indicate discouraged usage
 * @param {Array} agents - List of agent info with code
 * @returns {Array} Discouraged entries
 */
function scanForDiscouraged(agents) {
  const discouraged = [];
  
  for (const agent of agents) {
    if (!agent.code) continue;
    
    // Look for deprecation markers
    if (agent.code.includes('@deprecated') || agent.code.includes('DEPRECATED')) {
      discouraged.push({
        type: 'agent',
        name: agent.name,
        reason: 'deprecated',
        alternative: null
      });
      continue;
    }
    
    // Look for discouraged patterns in comments
    const discouragedMatch = agent.code.match(/@discouraged\s+(?:\{([^}]+)\}\s+)?(.+)/i);
    if (discouragedMatch) {
      discouraged.push({
        type: 'agent',
        name: agent.name,
        reason: discouragedMatch[2] || 'discouraged',
        alternative: discouragedMatch[1] || null
      });
    }
  }
  
  return discouraged;
}

/**
 * Load from cache if valid
 * @returns {Object|null} Cached snapshot or null
 */
function loadFromCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    
    // Check if cache is expired
    if (data.generatedAt) {
      const age = Date.now() - new Date(data.generatedAt).getTime();
      if (age > CACHE_TTL) {
        return null;
      }
    }
    
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Save to cache
 * @param {Object} snapshot - Snapshot to cache
 */
function saveToCache(snapshot) {
  try {
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot, null, 2));
  } catch (e) {
    // Silently fail on cache write errors
  }
}

/**
 * Generate upstream snapshot
 * @param {Object} options - Options
 * @returns {Promise<Object>} Snapshot object
 */
async function generateSnapshot(options = {}) {
  const { useCache = true, verbose = false } = options;
  
  // Try cache first
  if (useCache) {
    const cached = loadFromCache();
    if (cached) {
      if (verbose) {
        console.log(`${colors.gray}Using cached snapshot from ${cached.generatedAt}${colors.reset}`);
      }
      return cached;
    }
  }
  
  if (verbose) {
    console.log(`${colors.cyan}🔍 Fetching upstream snapshot...${colors.reset}`);
  }
  
  // Fetch commit SHA
  const commitSha = await getCommitSha();
  
  if (verbose) {
    console.log(`${colors.gray}   Commit: ${commitSha || 'unknown'}${colors.reset}`);
  }
  
  // Fetch model requirements
  if (verbose) {
    console.log(`${colors.gray}   Fetching model-requirements.ts...${colors.reset}`);
  }
  
  const modelRequirementsContent = await fetchHttps(UPSTREAM.modelRequirementsUrl, {
    headers: {
      'User-Agent': 'opencode-agent-config'
    }
  });
  
  const modelRequirements = parseModelRequirements(modelRequirementsContent);
  
  if (verbose) {
    console.log(`${colors.gray}   Found ${Object.keys(modelRequirements.agents).length} agents, ${Object.keys(modelRequirements.categories).length} categories${colors.reset}`);
  }
  
  // Fetch agent list
  if (verbose) {
    console.log(`${colors.gray}   Fetching agent list...${colors.reset}`);
  }
  
  const agentList = await listAgentsFromGitHub();
  
  if (verbose) {
    console.log(`${colors.gray}   Found ${agentList.length} agents${colors.reset}`);
  }
  
  // Fetch agent metadata for agents that exist in requirements
  const agentsWithMetadata = [];
  
  for (const agentInfo of agentList) {
    // Only fetch metadata for agents in requirements
    const normalizedName = agentInfo.name.toLowerCase().replace(/-/g, '');
    const inRequirements = Object.keys(modelRequirements.agents).some(
      key => key.toLowerCase().replace(/-/g, '') === normalizedName
    );
    
    if (inRequirements) {
      try {
        const code = await fetchAgentContent(agentInfo);
        const metadata = parseAgentMetadata(agentInfo.name, code);
        agentsWithMetadata.push({
          name: agentInfo.name,
          code,
          metadata
        });
      } catch (e) {
        if (verbose) {
          console.log(`${colors.yellow}   ⚠ Failed to fetch ${agentInfo.name}: ${e.message}${colors.reset}`);
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`${colors.gray}   Fetched metadata for ${agentsWithMetadata.length} agents${colors.reset}`);
  }
  
  // Build normalized agents array
  const agents = [];
  for (const [name, requirements] of Object.entries(modelRequirements.agents)) {
    // Find metadata if available
    const agentData = agentsWithMetadata.find(a => {
      const normalizedA = a.name.toLowerCase().replace(/-/g, '');
      const normalizedName = name.toLowerCase().replace(/-/g, '');
      return normalizedA === normalizedName;
    });
    
    const metadata = agentData ? agentData.metadata : {
      description: '',
      category: 'utility',
      cost: 'MODERATE',
      capabilities: [],
      thinking: false
    };
    
    agents.push(buildAgentEntry(name, requirements, metadata));
  }
  
  // Build normalized categories array
  const categories = [];
  for (const [name, requirements] of Object.entries(modelRequirements.categories)) {
    categories.push(buildCategoryEntry(name, requirements));
  }
  
  // Scan for discouraged entries
  const discouraged = scanForDiscouraged(agentsWithMetadata);
  
  // Build final snapshot
  const snapshot = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourceRef: {
      repo: UPSTREAM.repo,
      branch: UPSTREAM.branch,
      commitSha,
      modelRequirementsUrl: UPSTREAM.modelRequirementsUrl
    },
    agents,
    categories,
    discouraged
  };
  
  // Save to cache
  if (useCache) {
    saveToCache(snapshot);
  }
  
  if (verbose) {
    console.log(`${colors.green}✅ Snapshot generated${colors.reset}`);
  }
  
  return snapshot;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const noCache = args.includes('--no-cache');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;
  
  try {
    const snapshot = await generateSnapshot({
      useCache: !noCache,
      verbose: !jsonMode
    });
    
    const output = JSON.stringify(snapshot, null, jsonMode ? undefined : 2);
    
    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      if (!jsonMode) {
        console.log(`${colors.green}✅ Snapshot written to ${outputFile}${colors.reset}`);
      }
    } else {
      console.log(output);
    }
    
    process.exit(0);
  } catch (error) {
    if (jsonMode) {
      const fallbackOutput = {
        version: VERSION,
        generatedAt: new Date().toISOString(),
        sourceRef: {
          repo: UPSTREAM.repo,
          branch: UPSTREAM.branch,
          commitSha: null,
          modelRequirementsUrl: UPSTREAM.modelRequirementsUrl
        },
        upstreamResolved: false,
        unresolvedReason: error.message,
        error: error.message,
        agents: [],
        categories: [],
        discouraged: []
      };
      console.log(JSON.stringify(fallbackOutput, null, 2));
    } else {
      console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
      
      if (error.message.includes('HTTP') || error.message.includes('timeout')) {
        console.error(`${colors.gray}   Network error - check your connection${colors.reset}`);
        process.exit(1);
      } else if (error.message.includes('parse') || error.message.includes('JSON')) {
        console.error(`${colors.gray}   Parse error - upstream format may have changed${colors.reset}`);
        process.exit(2);
      }
    }
    
    process.exit(1);
  }
}

// Run main
main();
