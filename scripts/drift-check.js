#!/usr/bin/env node

/**
 * Upstream Drift Detection Script
 * Compares local model-requirements.js against upstream Oh My Opencode source
 * 
 * Usage: node scripts/drift-check.js [--exit-on-drift] [--json] [--refresh] [--pin]
 * 
 * Modes:
 *   check (default)   - Read-only comparison of local vs upstream
 *   --refresh         - Update cached snapshot and compare
 *   --pin             - Save current upstream SHA to .omo-upstream-sha
 * 
 * Exit codes:
 *   0 - No drift detected (or network unavailable, graceful)
 *   1 - Drift detected (when --exit-on-drift flag is used)
 *   2 - Network error or parsing failure
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const UPSTREAM = {
  repo: 'code-yeongyu/oh-my-opencode',
  branch: 'dev',
  modelRequirementsUrl: 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts',
  commitsApiUrl: 'https://api.github.com/repos/code-yeongyu/oh-my-opencode/commits/dev'
};

const LOCAL_FILE = path.join(__dirname, '..', 'lib', 'core', 'model-requirements.js');
const PINNED_SHA_FILE = path.join(__dirname, '..', '.omo-upstream-sha');
const CACHE_FILE = path.join(os.homedir(), '.config', 'opencode', 'cache', 'upstream-snapshot.json');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ============================================================================
// SNAPSHOT GENERATION (from upstream-snapshot.js)
// ============================================================================

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
 * Generate upstream snapshot
 * @param {Object} options - Options
 * @returns {Promise<Object>} Snapshot object
 */
async function generateSnapshot(options = {}) {
  const { verbose = false } = options;
  
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
  
  const modelRequirementsContent = await fetchHttps(UPSTREAM.modelRequirementsUrl);
  const modelRequirements = parseModelRequirements(modelRequirementsContent);
  
  if (verbose) {
    console.log(`${colors.gray}   Found ${Object.keys(modelRequirements.agents).length} agents, ${Object.keys(modelRequirements.categories).length} categories${colors.reset}`);
  }
  
  // Build normalized snapshot
  const snapshot = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceRef: {
      repo: UPSTREAM.repo,
      branch: UPSTREAM.branch,
      commitSha
    },
    agents: modelRequirements.agents,
    categories: modelRequirements.categories
  };
  
  if (verbose) {
    console.log(`${colors.green}✅ Snapshot generated${colors.reset}`);
  }
  
  return snapshot;
}

/**
 * Save snapshot to cache
 * @param {Object} snapshot - Snapshot to cache
 */
function saveSnapshotToCache(snapshot) {
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
 * Load snapshot from cache
 * @returns {Object|null} Cached snapshot or null
 */
function loadSnapshotFromCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Pin current upstream SHA to file
 * @param {string} sha - Commit SHA to pin
 * @returns {boolean} Success
 */
function pinSha(sha) {
  try {
    fs.writeFileSync(PINNED_SHA_FILE, sha);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Fetch content from HTTPS URL
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} Response body
 */
function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        fetchHttps(redirectUrl).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
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
 * Parse TypeScript model requirements from upstream source
 * Extracts AGENT_MODEL_REQUIREMENTS and CATEGORY_MODEL_REQUIREMENTS objects
 * @param {string} content - TypeScript file content
 * @returns {Object} Parsed requirements
 */
function parseUpstreamRequirements(content) {
  const requirements = {
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
      
      requirements.agents = JSON.parse(cleaned);
    } catch (e) {
      console.warn(`${colors.yellow}⚠ Warning: Could not parse AGENT_MODEL_REQUIREMENTS: ${e.message}${colors.reset}`);
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
      
      requirements.categories = JSON.parse(cleaned);
    } catch (e) {
      console.warn(`${colors.yellow}⚠ Warning: Could not parse CATEGORY_MODEL_REQUIREMENTS: ${e.message}${colors.reset}`);
    }
  }

  return requirements;
}

/**
 * Parse local JS model requirements
 * @param {string} content - JS file content
 * @returns {Object} Parsed requirements
 */
function parseLocalRequirements(content) {
  const requirements = {
    agents: {},
    categories: {}
  };

  // Extract AGENT_MODEL_REQUIREMENTS
  const agentMatch = content.match(/const\s+AGENT_MODEL_REQUIREMENTS\s*=\s*({[\s\S]*?});/);
  if (agentMatch) {
    try {
      // Use eval in a safe way - just parsing the object literal
      // Wrap in parentheses to make it a valid expression
      const objStr = '(' + agentMatch[1] + ')';
      requirements.agents = eval(objStr);
    } catch (e) {
      console.warn(`${colors.yellow}⚠ Warning: Could not parse local AGENT_MODEL_REQUIREMENTS: ${e.message}${colors.reset}`);
    }
  }

  // Extract CATEGORY_MODEL_REQUIREMENTS
  const categoryMatch = content.match(/const\s+CATEGORY_MODEL_REQUIREMENTS\s*=\s*({[\s\S]*?});/);
  if (categoryMatch) {
    try {
      const objStr = '(' + categoryMatch[1] + ')';
      requirements.categories = eval(objStr);
    } catch (e) {
      console.warn(`${colors.yellow}⚠ Warning: Could not parse local CATEGORY_MODEL_REQUIREMENTS: ${e.message}${colors.reset}`);
    }
  }

  return requirements;
}

/**
 * Get full fallback chain signature for comparison
 * Format: provider1/model1:variant1,provider2/model2:variant2,...
 * @param {Object} entry - Model requirement entry
 * @returns {string|null} Full chain signature or null
 */
function getFullChainSignature(entry) {
  if (!entry || !Array.isArray(entry.fallbackChain) || entry.fallbackChain.length === 0) {
    return null;
  }

  const chainSigs = entry.fallbackChain.map(fallback => {
    const providers = fallback.providers ? fallback.providers.join(',') : 'none';
    const model = fallback.model || 'unknown';
    const variant = fallback.variant ? `:${fallback.variant}` : '';
    return `${providers}/${model}${variant}`;
  });

  return chainSigs.join(',');
}

/**
 * Get gating fields signature for comparison
 * @param {Object} entry - Model requirement entry
 * @returns {string} Gating fields signature
 */
function getGatingSignature(entry) {
  if (!entry) return '';

  const parts = [];

  // requiresProvider (sorted for consistent comparison)
  if (Array.isArray(entry.requiresProvider) && entry.requiresProvider.length > 0) {
    parts.push(`reqProv=[${entry.requiresProvider.slice().sort().join(',')}]`);
  }

  // requiresModel
  if (entry.requiresModel) {
    parts.push(`reqModel=${entry.requiresModel}`);
  }

  // requiresAnyModel
  if (entry.requiresAnyModel === true) {
    parts.push('reqAnyModel=true');
  }

  // default variant
  if (entry.variant) {
    parts.push(`variant=${entry.variant}`);
  }

  return parts.join('|');
}

/**
 * Get complete signature combining chain and gating fields
 * @param {Object} entry - Model requirement entry
 * @returns {string|null} Complete signature or null
 */
function getCompleteSignature(entry) {
  const chainSig = getFullChainSignature(entry);
  const gatingSig = getGatingSignature(entry);

  if (!chainSig) return null;

  if (gatingSig) {
    return `${chainSig};${gatingSig}`;
  }
  return chainSig;
}

/**
 * Compare upstream and local requirements
 * @param {Object} upstream - Upstream requirements
 * @param {Object} local - Local requirements
 * @returns {Object} Comparison results
 */
function compareRequirements(upstream, local) {
  const drift = {
    missingAgents: [],
    newAgents: [],
    changedAgents: [],
    missingCategories: [],
    newCategories: [],
    changedCategories: [],
    hasDrift: false
  };

  const upstreamAgents = Object.keys(upstream.agents || {});
  const localAgents = Object.keys(local.agents || {});

  // Find missing agents (in local but not in upstream - should be removed)
  for (const agent of localAgents) {
    if (!upstream.agents[agent]) {
      drift.missingAgents.push(agent);
      drift.hasDrift = true;
    }
  }

  // Find new agents (in upstream but not in local - should be added)
  for (const agent of upstreamAgents) {
    if (!local.agents[agent]) {
      drift.newAgents.push(agent);
      drift.hasDrift = true;
    }
  }

  // Compare existing agents' complete signatures (full chain + gating)
  for (const agent of upstreamAgents) {
    if (local.agents[agent]) {
      const upstreamSig = getCompleteSignature(upstream.agents[agent]);
      const localSig = getCompleteSignature(local.agents[agent]);

      if (upstreamSig !== localSig) {
        drift.changedAgents.push({
          name: agent,
          upstream: {
            fallbackChain: upstream.agents[agent].fallbackChain,
            requiresProvider: upstream.agents[agent].requiresProvider || null,
            requiresModel: upstream.agents[agent].requiresModel || null,
            requiresAnyModel: upstream.agents[agent].requiresAnyModel || false,
            variant: upstream.agents[agent].variant || null
          },
          local: {
            fallbackChain: local.agents[agent].fallbackChain,
            requiresProvider: local.agents[agent].requiresProvider || null,
            requiresModel: local.agents[agent].requiresModel || null,
            requiresAnyModel: local.agents[agent].requiresAnyModel || false,
            variant: local.agents[agent].variant || null
          }
        });
        drift.hasDrift = true;
      }
    }
  }

  // Same comparison for categories
  const upstreamCats = Object.keys(upstream.categories || {});
  const localCats = Object.keys(local.categories || {});

  for (const cat of localCats) {
    if (!upstream.categories[cat]) {
      drift.missingCategories.push(cat);
      drift.hasDrift = true;
    }
  }

  for (const cat of upstreamCats) {
    if (!local.categories[cat]) {
      drift.newCategories.push(cat);
      drift.hasDrift = true;
    }
  }

  for (const cat of upstreamCats) {
    if (local.categories[cat]) {
      const upstreamSig = getCompleteSignature(upstream.categories[cat]);
      const localSig = getCompleteSignature(local.categories[cat]);

      if (upstreamSig !== localSig) {
        drift.changedCategories.push({
          name: cat,
          upstream: {
            fallbackChain: upstream.categories[cat].fallbackChain,
            requiresProvider: upstream.categories[cat].requiresProvider || null,
            requiresModel: upstream.categories[cat].requiresModel || null,
            requiresAnyModel: upstream.categories[cat].requiresAnyModel || false,
            variant: upstream.categories[cat].variant || null
          },
          local: {
            fallbackChain: local.categories[cat].fallbackChain,
            requiresProvider: local.categories[cat].requiresProvider || null,
            requiresModel: local.categories[cat].requiresModel || null,
            requiresAnyModel: local.categories[cat].requiresAnyModel || false,
            variant: local.categories[cat].variant || null
          }
        });
        drift.hasDrift = true;
      }
    }
  }

  return drift;
}

/**
 * Format a single fallback entry for display
 * @param {Object} entry - Fallback entry
 * @returns {string} Formatted string
 */
function formatFallbackEntry(entry) {
  const providers = entry.providers ? entry.providers.join(',') : 'none';
  const model = entry.model || 'unknown';
  const variant = entry.variant ? `:${entry.variant}` : '';
  return `${providers}/${model}${variant}`;
}

/**
 * Format gating fields for display
 * @param {Object} entry - Model requirement entry
 * @returns {string} Formatted gating string
 */
function formatGatingFields(entry) {
  const parts = [];
  if (entry.requiresProvider && entry.requiresProvider.length > 0) {
    parts.push(`requiresProvider=[${entry.requiresProvider.join(',')}]`);
  }
  if (entry.requiresModel) {
    parts.push(`requiresModel=${entry.requiresModel}`);
  }
  if (entry.requiresAnyModel) {
    parts.push('requiresAnyModel=true');
  }
  if (entry.variant) {
    parts.push(`variant=${entry.variant}`);
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * Read pinned SHA from file or local JS header
 * @returns {string|null} Pinned SHA or null
 */
function getPinnedSha() {
  try {
    // First try the dedicated SHA file
    if (fs.existsSync(PINNED_SHA_FILE)) {
      return fs.readFileSync(PINNED_SHA_FILE, 'utf8').trim();
    }
    
    // Fallback to reading from JS file header
    const content = fs.readFileSync(LOCAL_FILE, 'utf8');
    const match = content.match(/@upstream-sha\s+(\S+)/);
    if (match) return match[1];
  } catch (e) {
    // Ignore errors
  }
  return null;
}

/**
 * Build action required list from drift results
 * @param {Object} drift - Drift comparison results
 * @returns {Array<string>} List of actionable items
 */
function buildActionRequired(drift) {
  const actions = [];
  
  if (drift.newAgents.length > 0) {
    for (const agent of drift.newAgents) {
      actions.push(`add agent ${agent}`);
    }
  }
  
  if (drift.missingAgents.length > 0) {
    for (const agent of drift.missingAgents) {
      actions.push(`remove agent ${agent} (no longer in upstream)`);
    }
  }
  
  if (drift.changedAgents.length > 0) {
    for (const change of drift.changedAgents) {
      actions.push(`update chain for agent ${change.name}`);
    }
  }
  
  if (drift.newCategories.length > 0) {
    for (const cat of drift.newCategories) {
      actions.push(`add category ${cat}`);
    }
  }
  
  if (drift.missingCategories.length > 0) {
    for (const cat of drift.missingCategories) {
      actions.push(`remove category ${cat} (no longer in upstream)`);
    }
  }
  
  if (drift.changedCategories.length > 0) {
    for (const change of drift.changedCategories) {
      actions.push(`update chain for category ${change.name}`);
    }
  }
  
  return actions;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const exitOnDrift = args.includes('--exit-on-drift');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json');
  const refreshMode = args.includes('--refresh');
  const pinMode = args.includes('--pin');

  // Handle --pin mode first (just pin the SHA and exit)
  if (pinMode) {
    try {
      const currentSha = await getCommitSha();
      if (!currentSha) {
        if (jsonOutput) {
          console.log(JSON.stringify({ error: 'Could not fetch current upstream SHA' }, null, 2));
        } else {
          console.error(`${colors.red}❌ Could not fetch current upstream SHA${colors.reset}`);
        }
        process.exit(2);
      }
      
      if (pinSha(currentSha)) {
        if (jsonOutput) {
          console.log(JSON.stringify({ pinnedSha: currentSha, success: true }, null, 2));
        } else {
          console.log(`${colors.green}✅ Pinned upstream SHA: ${currentSha}${colors.reset}`);
          console.log(`${colors.gray}   Written to: ${PINNED_SHA_FILE}${colors.reset}`);
        }
        process.exit(0);
      } else {
        if (jsonOutput) {
          console.log(JSON.stringify({ error: 'Failed to write pinned SHA file' }, null, 2));
        } else {
          console.error(`${colors.red}❌ Failed to write pinned SHA file${colors.reset}`);
        }
        process.exit(2);
      }
    } catch (e) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: e.message }, null, 2));
      } else {
        console.error(`${colors.red}❌ Error pinning SHA: ${e.message}${colors.reset}`);
      }
      process.exit(2);
    }
  }

  // When JSON output is requested, suppress all console output except the final JSON
  const output = {
    hasDrift: false,
    newAgents: [],
    missingAgents: [],
    changedAgents: [],
    newCategories: [],
    missingCategories: [],
    changedCategories: [],
    pinnedSha: null,
    currentSha: null,
    actionRequired: []
  };

  if (!jsonOutput) {
    console.log(`${colors.cyan}🔍 OmO Upstream Drift Check${colors.reset}`);
    console.log(`${colors.gray}   Local: ${LOCAL_FILE}${colors.reset}`);
    console.log(`${colors.gray}   Upstream: ${UPSTREAM.modelRequirementsUrl}${colors.reset}`);
    if (refreshMode) {
      console.log(`${colors.gray}   Mode: refresh (will update cache)${colors.reset}`);
    } else {
      console.log(`${colors.gray}   Mode: check (read-only)${colors.reset}`);
    }
    console.log('');
  }

  // Check if local file exists
  if (!fs.existsSync(LOCAL_FILE)) {
    if (jsonOutput) {
      output.error = `Local file not found: ${LOCAL_FILE}`;
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(`${colors.red}❌ Local file not found: ${LOCAL_FILE}${colors.reset}`);
    }
    process.exit(2);
  }

  // Show pinned SHA if available
  const pinnedSha = getPinnedSha();
  output.pinnedSha = pinnedSha;

  if (!jsonOutput && pinnedSha) {
    console.log(`${colors.gray}📌 Pinned upstream SHA: ${pinnedSha}${colors.reset}`);
    console.log('');
  }

  let upstreamReqs;
  let currentSha = null;

  // In refresh mode, generate new snapshot and save to cache
  if (refreshMode) {
    try {
      const snapshot = await generateSnapshot({ verbose: !jsonOutput && verbose });
      saveSnapshotToCache(snapshot);
      currentSha = snapshot.sourceRef.commitSha;
      upstreamReqs = {
        agents: snapshot.agents,
        categories: snapshot.categories
      };
      if (!jsonOutput) {
        console.log(`${colors.green}✅ Cached snapshot updated${colors.reset}`);
        console.log('');
      }
    } catch (e) {
      if (jsonOutput) {
        output.error = `Failed to refresh snapshot: ${e.message}`;
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.error(`${colors.red}❌ Failed to refresh snapshot: ${e.message}${colors.reset}`);
      }
      process.exit(2);
    }
  } else {
    // Check mode: try cache first, then fetch
    const cached = loadSnapshotFromCache();
    if (cached) {
      if (!jsonOutput && verbose) {
        console.log(`${colors.gray}Using cached snapshot from ${cached.generatedAt}${colors.reset}`);
      }
      currentSha = cached.sourceRef?.commitSha || null;
      upstreamReqs = {
        agents: cached.agents,
        categories: cached.categories
      };
    } else {
      // No cache, fetch fresh
      try {
        if (!jsonOutput && verbose) {
          console.log(`${colors.gray}Fetching upstream...${colors.reset}`);
        }
        const upstreamContent = await fetchHttps(UPSTREAM.modelRequirementsUrl);
        currentSha = await getCommitSha();
        upstreamReqs = parseUpstreamRequirements(upstreamContent);
      } catch (e) {
        if (jsonOutput) {
          // For JSON output on network failure, return empty result with hasDrift=false
          // This maintains backward compatibility for scripts that check hasDrift
          output.networkError = e.message;
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.warn(`${colors.yellow}⚠ Network unavailable or fetch failed: ${e.message}${colors.reset}`);
          console.log(`${colors.gray}   Skipping drift check (graceful fallback)${colors.reset}`);
        }
        process.exit(0); // Graceful exit on network failure
      }
    }
  }

  output.currentSha = currentSha;

  // Parse local requirements
  let localReqs;
  try {
    const localContent = fs.readFileSync(LOCAL_FILE, 'utf8');
    localReqs = parseLocalRequirements(localContent);
  } catch (e) {
    if (jsonOutput) {
      output.error = `Failed to parse local requirements: ${e.message}`;
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(`${colors.red}❌ Failed to parse local requirements: ${e.message}${colors.reset}`);
    }
    process.exit(2);
  }

  // Compare
  const drift = compareRequirements(upstreamReqs, localReqs);

  output.hasDrift = drift.hasDrift;
  output.newAgents = drift.newAgents;
  output.missingAgents = drift.missingAgents;
  output.changedAgents = drift.changedAgents;
  output.newCategories = drift.newCategories;
  output.missingCategories = drift.missingCategories;
  output.changedCategories = drift.changedCategories;
  output.actionRequired = buildActionRequired(drift);

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2));
    process.exit(exitOnDrift && drift.hasDrift ? 1 : 0);
  }

  // Human-readable output
  console.log(`${colors.cyan}📊 Comparison Results:${colors.reset}`);
  console.log(`   Agents: ${Object.keys(upstreamReqs.agents).length} upstream, ${Object.keys(localReqs.agents).length} local`);
  console.log(`   Categories: ${Object.keys(upstreamReqs.categories).length} upstream, ${Object.keys(localReqs.categories).length} local`);
  console.log('');

  if (!drift.hasDrift) {
    console.log(`${colors.green}✅ No drift detected - local mirror is up to date${colors.reset}`);
    process.exit(0);
  }

  // Report drift details
  console.log(`${colors.yellow}⚠ Drift detected!${colors.reset}`);
  console.log('');

  if (drift.newAgents.length > 0) {
    console.log(`${colors.yellow}New agents in upstream (need to add):${colors.reset}`);
    for (const agent of drift.newAgents) {
      const entry = upstreamReqs.agents[agent];
      const chainStr = entry.fallbackChain.map(formatFallbackEntry).join(' → ');
      const gatingStr = formatGatingFields(entry);
      console.log(`   + ${agent}: ${chainStr}${gatingStr}`);
    }
    console.log('');
  }

  if (drift.missingAgents.length > 0) {
    console.log(`${colors.yellow}Agents removed from upstream (may need removal):${colors.reset}`);
    for (const agent of drift.missingAgents) {
      console.log(`   - ${agent}`);
    }
    console.log('');
  }

  if (drift.changedAgents.length > 0) {
    console.log(`${colors.yellow}Agents with changed fallback chains or gating:${colors.reset}`);
    for (const change of drift.changedAgents) {
      console.log(`   ~ ${change.name}:`);

      // Show full chain comparison
      const upstreamChain = change.upstream.fallbackChain.map(formatFallbackEntry).join(' → ');
      const localChain = change.local.fallbackChain.map(formatFallbackEntry).join(' → ');

      console.log(`     upstream chain: ${upstreamChain}`);
      console.log(`     local chain:    ${localChain}`);

      // Show gating fields if they differ
      const upstreamGating = formatGatingFields(change.upstream);
      const localGating = formatGatingFields(change.local);

      if (upstreamGating !== localGating) {
        console.log(`     upstream gating:${upstreamGating || ' (none)'}`);
        console.log(`     local gating:   ${localGating || ' (none)'}`);
      }
    }
    console.log('');
  }

  if (drift.newCategories.length > 0) {
    console.log(`${colors.yellow}New categories in upstream:${colors.reset}`);
    for (const cat of drift.newCategories) {
      const entry = upstreamReqs.categories[cat];
      const chainStr = entry.fallbackChain.map(formatFallbackEntry).join(' → ');
      const gatingStr = formatGatingFields(entry);
      console.log(`   + ${cat}: ${chainStr}${gatingStr}`);
    }
    console.log('');
  }

  if (drift.missingCategories.length > 0) {
    console.log(`${colors.yellow}Categories removed from upstream:${colors.reset}`);
    for (const cat of drift.missingCategories) {
      console.log(`   - ${cat}`);
    }
    console.log('');
  }

  if (drift.changedCategories.length > 0) {
    console.log(`${colors.yellow}Categories with changed fallback chains or gating:${colors.reset}`);
    for (const change of drift.changedCategories) {
      console.log(`   ~ ${change.name}:`);

      // Show full chain comparison
      const upstreamChain = change.upstream.fallbackChain.map(formatFallbackEntry).join(' → ');
      const localChain = change.local.fallbackChain.map(formatFallbackEntry).join(' → ');

      console.log(`     upstream chain: ${upstreamChain}`);
      console.log(`     local chain:    ${localChain}`);

      // Show gating fields if they differ
      const upstreamGating = formatGatingFields(change.upstream);
      const localGating = formatGatingFields(change.local);

      if (upstreamGating !== localGating) {
        console.log(`     upstream gating:${upstreamGating || ' (none)'}`);
        console.log(`     local gating:   ${localGating || ' (none)'}`);
      }
    }
    console.log('');
  }

  console.log(`${colors.cyan}💡 Run the following to update:${colors.reset}`);
  console.log(`   1. Review upstream changes at: https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/model-requirements.ts`);
  console.log(`   2. Update ${LOCAL_FILE}`);
  console.log(`   3. Update pinned SHA in file header or .omo-upstream-sha`);
  console.log('');

  if (exitOnDrift) {
    process.exit(1);
  } else {
    console.log(`${colors.gray}(Drift detected but exiting with code 0 - use --exit-on-drift to fail)${colors.reset}`);
    process.exit(0);
  }
}

// Run main
main().catch(e => {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  if (jsonOutput) {
    console.log(JSON.stringify({ hasDrift: false, error: e.message }, null, 2));
  } else {
    console.error(`${colors.red}❌ Unexpected error: ${e.message}${colors.reset}`);
  }
  process.exit(2);
});
