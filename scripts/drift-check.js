#!/usr/bin/env node

/**
 * Upstream Drift Detection Script
 * Compares local model-requirements.js against upstream Oh My Opencode source
 * 
 * Usage: node scripts/drift-check.js [--exit-on-drift]
 * 
 * Exit codes:
 *   0 - No drift detected (or network unavailable, graceful)
 *   1 - Drift detected (when --exit-on-drift flag is used)
 *   2 - Network error or parsing failure
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const UPSTREAM_URL = 'https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts';
const LOCAL_FILE = path.join(__dirname, '..', 'lib', 'core', 'model-requirements.js');
const PINNED_SHA_FILE = path.join(__dirname, '..', '.omo-upstream-sha');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

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
 * Get the first fallback entry signature for comparison
 * @param {Object} entry - Fallback chain entry
 * @returns {string} Signature string
 */
function getFallbackSignature(entry) {
  if (!entry || !Array.isArray(entry.fallbackChain) || entry.fallbackChain.length === 0) {
    return null;
  }
  const first = entry.fallbackChain[0];
  const providers = first.providers ? first.providers.join(',') : 'none';
  const model = first.model || 'unknown';
  const variant = first.variant ? `:${first.variant}` : '';
  return `${providers}/${model}${variant}`;
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

  // Compare existing agents' first fallback entry
  for (const agent of upstreamAgents) {
    if (local.agents[agent]) {
      const upstreamSig = getFallbackSignature(upstream.agents[agent]);
      const localSig = getFallbackSignature(local.agents[agent]);
      
      if (upstreamSig !== localSig) {
        drift.changedAgents.push({
          name: agent,
          upstream: upstreamSig,
          local: localSig
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
      const upstreamSig = getFallbackSignature(upstream.categories[cat]);
      const localSig = getFallbackSignature(local.categories[cat]);
      
      if (upstreamSig !== localSig) {
        drift.changedCategories.push({
          name: cat,
          upstream: upstreamSig,
          local: localSig
        });
        drift.hasDrift = true;
      }
    }
  }

  return drift;
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
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const exitOnDrift = args.includes('--exit-on-drift');
  const verbose = args.includes('--verbose') || args.includes('-v');

  console.log(`${colors.cyan}🔍 OmO Upstream Drift Check${colors.reset}`);
  console.log(`${colors.gray}   Local: ${LOCAL_FILE}${colors.reset}`);
  console.log(`${colors.gray}   Upstream: ${UPSTREAM_URL}${colors.reset}`);
  console.log('');

  // Check if local file exists
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error(`${colors.red}❌ Local file not found: ${LOCAL_FILE}${colors.reset}`);
    process.exit(2);
  }

  // Show pinned SHA if available
  const pinnedSha = getPinnedSha();
  if (pinnedSha) {
    console.log(`${colors.gray}📌 Pinned upstream SHA: ${pinnedSha}${colors.reset}`);
    console.log('');
  }

  // Fetch upstream content
  let upstreamContent;
  try {
    if (verbose) {
      console.log(`${colors.gray}Fetching upstream...${colors.reset}`);
    }
    upstreamContent = await fetchHttps(UPSTREAM_URL);
  } catch (e) {
    console.warn(`${colors.yellow}⚠ Network unavailable or fetch failed: ${e.message}${colors.reset}`);
    console.log(`${colors.gray}   Skipping drift check (graceful fallback)${colors.reset}`);
    process.exit(0); // Graceful exit on network failure
  }

  // Parse both sources
  let upstreamReqs;
  let localReqs;
  
  try {
    upstreamReqs = parseUpstreamRequirements(upstreamContent);
  } catch (e) {
    console.error(`${colors.red}❌ Failed to parse upstream requirements: ${e.message}${colors.reset}`);
    process.exit(2);
  }

  try {
    const localContent = fs.readFileSync(LOCAL_FILE, 'utf8');
    localReqs = parseLocalRequirements(localContent);
  } catch (e) {
    console.error(`${colors.red}❌ Failed to parse local requirements: ${e.message}${colors.reset}`);
    process.exit(2);
  }

  // Compare
  const drift = compareRequirements(upstreamReqs, localReqs);

  // Report results
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
      const sig = getFallbackSignature(upstreamReqs.agents[agent]);
      console.log(`   + ${agent}: ${sig}`);
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
    console.log(`${colors.yellow}Agents with changed fallback chains:${colors.reset}`);
    for (const change of drift.changedAgents) {
      console.log(`   ~ ${change.name}:`);
      console.log(`     upstream: ${change.upstream}`);
      console.log(`     local:    ${change.local}`);
    }
    console.log('');
  }

  if (drift.newCategories.length > 0) {
    console.log(`${colors.yellow}New categories in upstream:${colors.reset}`);
    for (const cat of drift.newCategories) {
      console.log(`   + ${cat}`);
    }
    console.log('');
  }

  if (drift.changedCategories.length > 0) {
    console.log(`${colors.yellow}Categories with changed fallback chains:${colors.reset}`);
    for (const change of drift.changedCategories) {
      console.log(`   ~ ${change.name}:`);
      console.log(`     upstream: ${change.upstream}`);
      console.log(`     local:    ${change.local}`);
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
  console.error(`${colors.red}❌ Unexpected error: ${e.message}${colors.reset}`);
  process.exit(2);
});
