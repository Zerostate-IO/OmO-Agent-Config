#!/usr/bin/env node

/**
 * Provider-Aware Model Requirements Sync
 * 
 * Previews provider-aware fallback chain changes for model-requirements.js.
 * Apply mode is currently disabled; use for dry-run preview only.
 * 
 * Usage: node scripts/provider-aware-sync.js [--json] [--providers <list>]
 * 
 * Modes:
 *   (default)          - Show what would change (dry-run only)
 *   --json              - Output structured JSON (for API consumption)
 *   --providers <list>  - Override detected providers (comma-separated)
 * 
 * Exit codes:
 *   0 - Success (dry-run preview)
 *   1 - Error (no providers, etc.)
 *   2 - Requirements file missing
 * 
 * Examples:
 *   node scripts/provider-aware-sync.js                    # Preview changes
 *   node scripts/provider-aware-sync.js --json             # Structured JSON preview
 *   node scripts/provider-aware-sync.js --providers openai,xai,google  # Use specific providers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { normalizeProviderName } = require(path.join(__dirname, '..', 'lib', 'constants'));

// Configuration
const MODEL_REQUIREMENTS_FILE = path.join(__dirname, '..', 'lib', 'core', 'model-requirements.js');
const CONSTANTS_FILE = path.join(__dirname, '..', 'lib', 'constants.js');
const PINNED_SHA_FILE = path.join(__dirname, '..', '.omo-upstream-sha');

let jsonMode = false;
function log(...args) { if (!jsonMode) console.log(...args); }
function warn(...args) { if (!jsonMode) console.warn(...args); }
function error(...args) { if (!jsonMode) console.error(...args); }

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Detect available providers from opencode CLI
 * @returns {Set<string>} Set of available provider IDs
 */
function detectProviders() {
  const providers = new Set();
  
  try {
    // Get all models and extract unique providers
    const output = execSync('opencode models 2>/dev/null || echo ""', { 
      encoding: 'utf8',
      timeout: 30000 
    });
    
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^/]+)\//);
      if (match) {
        providers.add(normalizeProviderName(match[1].trim()));
      }
    }
    
    if (providers.size === 0) {
      warn(`${colors.yellow}⚠ No providers detected from opencode CLI${colors.reset}`);
      warn(`${colors.gray}   Make sure opencode is installed and configured${colors.reset}`);
    } else {
      log(`${colors.gray}   Detected ${providers.size} providers: ${Array.from(providers).join(', ')}${colors.reset}`);
    }
  } catch (e) {
    warn(`${colors.yellow}⚠ Could not detect providers: ${e.message}${colors.reset}`);
  }
  
  return providers;
}

/**
 * Read current model requirements from local file
 * @returns {Object} Current model requirements
 */
function readLocalRequirements() {
  try {
    const content = fs.readFileSync(MODEL_REQUIREMENTS_FILE, 'utf8');
    
    // Extract AGENT_MODEL_REQUIREMENTS
    const agentMatch = content.match(/const\s+AGENT_MODEL_REQUIREMENTS\s*=\s*({[\s\S]*?});/);
    const categoryMatch = content.match(/const\s+CATEGORY_MODEL_REQUIREMENTS\s*=\s*({[\s\S]*?});/);
    
    // Parse the JavaScript object safely by converting to JSON
    const parseJSObject = (jsCode) => {
      try {
        // Convert JavaScript object syntax to JSON
        const jsonLike = jsCode
          .replace(/\/\/.*$/gm, '')           // Remove line comments
          .replace(/\/\*[\s\S]*?\*\//g, '')     // Remove block comments
          .replace(/,\s*([}\]])/g, '$1')        // Remove trailing commas
          .replace(/'/g, '"')                  // Replace single quotes
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
        return JSON.parse(jsonLike);
      } catch (e) {
        warn(`${colors.yellow}⚠ Warning: Could not parse requirements: ${e.message}${colors.reset}`);
        return {};
      }
    };
    
    return {
      agents: agentMatch ? parseJSObject(agentMatch[1]) : {},
      categories: categoryMatch ? parseJSObject(categoryMatch[1]) : {}
    };
  } catch (e) {
    error(`${colors.red}❌ Failed to read local requirements: ${e.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Model mappings for cross-provider compatibility
 * Maps upstream models to equivalents on different providers
 */
const MODEL_MAPPINGS = {
  // Fast/cheap models (for explore, librarian, quick category)
  'minimax-m2.5': {
    'bailian-coding-plan': 'MiniMax-M2.5',
    'opencode': 'minimax-m2.5',
    'openrouter': 'minimax/minimax-m2.5',
    default: 'minimax-m2.5'
  },
  'minimax-m2.7': {
    'bailian-coding-plan': 'MiniMax-M2.5',  // fallback to m2.5
    'opencode': 'minimax-m2.7',
    'openrouter': 'minimax/minimax-m2.7',
    default: 'minimax-m2.7'
  },
  'minimax-m2.7-highspeed': {
    'bailian-coding-plan': 'MiniMax-M2.5',
    'opencode': 'minimax-m2.7',
    'openrouter': 'minimax/minimax-m2.7',
    default: 'minimax-m2.7'
  },
  
  // Reasoning/coding models (for hephaestus, deep category)
  'gpt-5.3-codex': {
    'openai': 'gpt-5.3-codex',
    'openrouter': 'gpt-5.3-codex',
    'bailian-coding-plan': 'qwen3-coder-plus',
    default: 'gpt-5.3-codex'
  },
  'gpt-5.4': {
    'openai': 'gpt-5.4',
    'openrouter': 'gpt-5.4',
    'deepseek': 'deepseek-v4-pro',
    'xai': 'grok-4.3',
    'bailian-coding-plan': 'qwen3.5-plus',
    'google': 'antigravity-gemini-3-pro-high',
    default: 'gpt-5.4'
  },
  
  // Vision models (for multimodal-looker)
  'gpt-5.4-vision': {
    'openai': 'gpt-5.4',
    'google': 'antigravity-gemini-3-pro-high',
    'xai': 'grok-4.3',
    default: 'gpt-5.4'
  },
  'gemini-3.1-pro': {
    'google': 'antigravity-gemini-3-pro-high',
    'openrouter': 'gemini-3.1-pro',
    default: 'gemini-3.1-pro'
  },
  'gemini-3-flash': {
    'google': 'antigravity-gemini-3-flash',
    'openrouter': 'gemini-3-flash',
    default: 'gemini-3-flash'
  },
  
  // Fast coding models (for explore agent)
  'gpt-5.4-mini-fast': {
    'openai': 'gpt-5.4-mini-fast',
    'deepseek': 'deepseek-v4-flash',
    'xai': 'grok-build-0.1',
    'opencode': 'gpt-5-nano',
    default: 'gpt-5.4-mini-fast'
  },
  'grok-code-fast-1': {
    'deepseek': 'deepseek-v4-flash',
    'xai': 'grok-build-0.1',
    'openai': 'gpt-5.4-mini',
    'bailian-coding-plan': 'qwen3-coder-plus',
    default: 'grok-build-0.1'
  },
  
  // Claude models (for sisyphus, oracle, high-quality agents)
  'claude-opus-4-6': {
    'opencode': 'claude-opus-4-6',
    'openrouter': 'claude-opus-4-6',
    'deepseek': 'deepseek-v4-pro',
    'xai': 'grok-4.20-0309-reasoning',
    'openai': 'gpt-5.4',
    default: 'claude-opus-4-6'
  },
  'claude-sonnet-4-6': {
    'opencode': 'claude-sonnet-4-6',
    'openrouter': 'claude-sonnet-4-6',
    'deepseek': 'deepseek-v4-flash',
    'xai': 'grok-4.3',
    'openai': 'gpt-5.4-mini',
    default: 'claude-sonnet-4-6'
  },
  'claude-haiku-4-5': {
    'opencode': 'claude-3-5-haiku',
    'openrouter': 'claude-haiku-4-5',
    'openai': 'gpt-5.4-mini',
    'bailian-coding-plan': 'qwen3.5-plus',
    default: 'claude-3-5-haiku'
  },
  
  // Asian market models
  'kimi-k2.5': {
    'bailian-coding-plan': 'kimi-k2.5',
    'opencode': 'kimi-k2.5',
    'openrouter': 'kimi-k2.5',
    default: 'kimi-k2.5'
  },
  'k2p5': {
    'kimi-for-coding': 'k2p5',
    'bailian-coding-plan': 'kimi-k2.5',
    default: 'k2p5'
  },
  'glm-5': {
    'bailian-coding-plan': 'glm-5',
    'zai-coding-plan': 'glm-5',
    'openrouter': 'glm-5',
    default: 'glm-5'
  },
  'glm-4.6v': {
    'zai-coding-plan': 'glm-4.7',  // closest match
    'bailian-coding-plan': 'glm-4.7',
    default: 'glm-4.7'
  },
  
  // Free/tiered models
  'big-pickle': {
    'opencode': 'big-pickle',
    default: 'big-pickle'
  },
  'gpt-5-nano': {
    'opencode': 'gpt-5-nano',
    'openai': 'gpt-5.4-mini',
    default: 'gpt-5-nano'
  },
  'gpt-5.4-mini': {
    'openai': 'gpt-5.4-mini',
    'opencode': 'gpt-5-nano',
    'deepseek': 'deepseek-v4-flash',
    'xai': 'grok-build-0.1',
    default: 'gpt-5.4-mini'
  }
};

/**
 * Get best available model for a provider
 * @param {string} modelId - Target model ID
 * @param {Set<string>} availableProviders - User's available providers
 * @param {Object} options - Matching options
 * @returns {Object|null} Best provider/model match or null
 */
function getBestModelMatch(modelId, availableProviders, options = {}) {
  const { allowSameModelAnyProvider = true } = options;
  const mappings = MODEL_MAPPINGS[modelId];
  if (!mappings) {
    if (!allowSameModelAnyProvider) {
      return null;
    }

    // No mapping - try to use as-is with available providers
    for (const provider of availableProviders) {
      return { provider, model: modelId };
    }
    return null;
  }
  
  // Try providers in order of preference
  for (const [provider, mappedModel] of Object.entries(mappings)) {
    if (provider === 'default') continue;
    if (availableProviders.has(provider)) {
      return { provider, model: mappedModel };
    }
  }

  if (!allowSameModelAnyProvider) {
    return null;
  }

  // Fallback to default with first available provider
  const defaultModel = mappings.default || modelId;
  for (const provider of availableProviders) {
    return { provider, model: defaultModel };
  }
  
  return null;
}

/**
 * Build provider-aware fallback chain
 * @param {Array} upstreamChain - Upstream fallback chain
 * @param {Set<string>} availableProviders - User's available providers
 * @returns {Array} Optimized fallback chain
 */
function buildFallbackChain(upstreamChain, availableProviders) {
  const newChain = [];
  const usedModels = new Set();  // Prevent duplicates
  
  for (const entry of upstreamChain) {
    const matchingProviders = [];
    
    const seenCanonical = new Set();
    for (const provider of entry.providers) {
      const canonical = normalizeProviderName(provider);
      if (availableProviders.has(canonical) && !seenCanonical.has(canonical)) {
        matchingProviders.push(canonical);
        seenCanonical.add(canonical);
      }
    }
    
    // If no providers match, try to find equivalent model
    if (matchingProviders.length === 0) {
      const match = getBestModelMatch(entry.model, availableProviders, { allowSameModelAnyProvider: false });
      if (match && !usedModels.has(match.model)) {
        newChain.push({
          providers: [match.provider],
          model: match.model,
          variant: entry.variant
        });
        usedModels.add(match.model);
      }
    } else {
      // Use available providers with potentially remapped model
      const match = getBestModelMatch(entry.model, new Set(matchingProviders));
      if (match && !usedModels.has(match.model)) {
        newChain.push({
          providers: matchingProviders,
          model: match.model,
          variant: entry.variant
        });
        usedModels.add(match.model);
      }
    }
  }
  
  return newChain;
}

/**
 * Generate updated model requirements
 * @param {Object} current - Current model requirements
 * @param {Set<string>} availableProviders - User's available providers
 * @returns {Object} Updated model requirements
 */
function generateUpdatedRequirements(current, availableProviders) {
  const updated = {
    agents: {},
    categories: {}
  };
  
  // Update agents
  for (const [agentName, config] of Object.entries(current.agents)) {
    const newChain = buildFallbackChain(config.fallbackChain, availableProviders);
    
    if (newChain.length > 0) {
      updated.agents[agentName] = {
        fallbackChain: newChain
      };
      
      // Copy other properties
      if (config.requiresProvider) {
        const canonical = [...new Set(config.requiresProvider.map(p => normalizeProviderName(p)))];
        const filtered = canonical.filter(p => availableProviders.has(p));
        if (filtered.length > 0) {
          updated.agents[agentName].requiresProvider = filtered;
        }
      }
      if (config.requiresModel) {
        updated.agents[agentName].requiresModel = config.requiresModel;
      }
      if (config.requiresAnyModel) {
        updated.agents[agentName].requiresAnyModel = config.requiresAnyModel;
      }
      if (config.variant) {
        updated.agents[agentName].variant = config.variant;
      }
    } else {
      warn(`${colors.yellow}⚠ No available providers for agent: ${agentName}${colors.reset}`);
    }
  }
  
  // Update categories
  for (const [catName, config] of Object.entries(current.categories)) {
    const newChain = buildFallbackChain(config.fallbackChain, availableProviders);
    
    if (newChain.length > 0) {
      updated.categories[catName] = {
        fallbackChain: newChain
      };
      
      if (config.requiresModel) {
        updated.categories[catName].requiresModel = config.requiresModel;
      }
      if (config.variant) {
        updated.categories[catName].variant = config.variant;
      }
    }
  }
  
  return updated;
}

/**
 * Generate JavaScript code for model requirements
 * @param {Object} requirements - Model requirements
 * @returns {string} JavaScript code
 */
function generateCode(requirements) {
  const formatEntry = (entry) => {
    const providers = entry.providers.map(p => `"${p}"`).join(', ');
    const variant = entry.variant ? `, variant: "${entry.variant}"` : '';
    return `      { providers: [${providers}], model: "${entry.model}"${variant} },`;
  };
  
  const formatGating = (config) => {
    const parts = [];
    if (config.requiresProvider) {
      parts.push(`    requiresProvider: [${config.requiresProvider.map(p => `"${p}"`).join(', ')}],`);
    }
    if (config.requiresModel) {
      parts.push(`    requiresModel: "${config.requiresModel}",`);
    }
    if (config.requiresAnyModel) {
      parts.push(`    requiresAnyModel: true,`);
    }
    if (config.variant) {
      parts.push(`    variant: "${config.variant}",`);
    }
    return parts.join('\n');
  };
  
  let code = 'const AGENT_MODEL_REQUIREMENTS = {\n';
  
  for (const [agentName, config] of Object.entries(requirements.agents)) {
    code += `  ${agentName}: {\n`;
    code += `    fallbackChain: [\n`;
    for (const entry of config.fallbackChain) {
      code += formatEntry(entry) + '\n';
    }
    code += `    ],\n`;
    
    const gating = formatGating(config);
    if (gating) {
      code += gating + '\n';
    }
    
    code += `  },\n`;
  }
  
  code += '};\n\n';
  code += 'const CATEGORY_MODEL_REQUIREMENTS = {\n';
  
  for (const [catName, config] of Object.entries(requirements.categories)) {
    code += `  "${catName}": {\n`;
    code += `    fallbackChain: [\n`;
    for (const entry of config.fallbackChain) {
      code += formatEntry(entry) + '\n';
    }
    code += `    ],\n`;
    
    const gating = formatGating(config);
    if (gating) {
      code += gating + '\n';
    }
    
    code += `  },\n`;
  }
  
  code += '};\n';
  
  return code;
}

/**
 * Write updated requirements to file
 * @param {Object} requirements - Updated requirements
 * @param {boolean} dryRun - If true, don't actually write
 */
function writeRequirements(requirements, dryRun) {
  const newCode = generateCode(requirements);
  
  if (dryRun) {
    log(`${colors.cyan}\n📄 Proposed changes to model-requirements.js:${colors.reset}`);
    log(`${colors.gray}---${colors.reset}`);
    log(newCode);
    log(`${colors.gray}---${colors.reset}`);
    return;
  }
  
  // Read current file to preserve header and exports
  const currentContent = fs.readFileSync(MODEL_REQUIREMENTS_FILE, 'utf8');
  
  // Replace AGENT_MODEL_REQUIREMENTS and CATEGORY_MODEL_REQUIREMENTS
  let newContent = currentContent;
  
  // Replace AGENT_MODEL_REQUIREMENTS
  newContent = newContent.replace(
    /const\s+AGENT_MODEL_REQUIREMENTS\s*=\s*{[\s\S]*?};/,
    'const AGENT_MODEL_REQUIREMENTS = ' + JSON.stringify(requirements.agents, null, 2).replace(/"/g, '"') + ';'
  );
  
  // Replace CATEGORY_MODEL_REQUIREMENTS
  newContent = newContent.replace(
    /const\s+CATEGORY_MODEL_REQUIREMENTS\s*=\s*{[\s\S]*?};/,
    'const CATEGORY_MODEL_REQUIREMENTS = ' + JSON.stringify(requirements.categories, null, 2).replace(/"/g, '"') + ';'
  );
  
  // Write file
  fs.writeFileSync(MODEL_REQUIREMENTS_FILE, newContent);
    log(`${colors.green}✅ Updated ${MODEL_REQUIREMENTS_FILE}${colors.reset}`);
}

/**
 * Read pinned upstream SHA from .omo-upstream-sha or model-requirements.js header
 * @returns {string|null}
 */
function getPinnedSha() {
  try {
    if (fs.existsSync(PINNED_SHA_FILE)) {
      return fs.readFileSync(PINNED_SHA_FILE, 'utf8').trim();
    }
    const content = fs.readFileSync(MODEL_REQUIREMENTS_FILE, 'utf8');
    const match = content.match(/@upstream-sha\s+(\S+)/);
    if (match) return match[1];
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * Compute structured diff between current and updated requirements
 * @param {Object} current
 * @param {Object} updated
 * @returns {{ changedAgents: Array, changedCategories: Array, unchangedCount: number }}
 */
function computeDiff(current, updated) {
  const changedAgents = [];
  const changedCategories = [];
  let unchangedCount = 0;

  for (const [agentName, config] of Object.entries(updated.agents)) {
    const oldChain = current.agents[agentName]?.fallbackChain || [];
    const newChain = config.fallbackChain;

    if (JSON.stringify(oldChain) !== JSON.stringify(newChain)) {
      changedAgents.push({
        name: agentName,
        oldChain: oldChain.map(e => `${e.providers.join(',')}/${e.model}`).join(' → '),
        newChain: newChain.map(e => `${e.providers.join(',')}/${e.model}`).join(' → ')
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [catName, config] of Object.entries(updated.categories)) {
    const oldChain = current.categories[catName]?.fallbackChain || [];
    const newChain = config.fallbackChain;

    if (JSON.stringify(oldChain) !== JSON.stringify(newChain)) {
      changedCategories.push({
        name: catName,
        oldChain: oldChain.map(e => `${e.providers.join(',')}/${e.model}`).join(' → '),
        newChain: newChain.map(e => `${e.providers.join(',')}/${e.model}`).join(' → ')
      });
    } else {
      unchangedCount++;
    }
  }

  return { changedAgents, changedCategories, unchangedCount };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const jsonOutput = args.includes('--json');
  jsonMode = jsonOutput;
  const specifiedProviders = args.find(arg => arg.startsWith('--providers='))?.split('=')[1]?.split(',');

  if (!jsonOutput) {
    log(`${colors.cyan}🔧 Provider-Aware Model Requirements Sync${colors.reset}\n`);
  }

  // Verify requirements file exists
  if (!fs.existsSync(MODEL_REQUIREMENTS_FILE)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ success: false, error: `Requirements file not found: ${MODEL_REQUIREMENTS_FILE}` }));
    } else {
      error(`${colors.red}❌ Requirements file not found: ${MODEL_REQUIREMENTS_FILE}${colors.reset}`);
    }
    process.exit(2);
  }

  // Detect or use specified providers
  let availableProviders;
  if (specifiedProviders) {
    availableProviders = new Set(specifiedProviders.map(p => normalizeProviderName(p)));
    if (!jsonOutput) {
      log(`${colors.gray}Using specified providers: ${Array.from(availableProviders).join(', ')}${colors.reset}`);
    }
  } else {
    if (!jsonOutput) {
      log(`${colors.gray}Detecting available providers...${colors.reset}`);
    }
    availableProviders = detectProviders();
  }

  if (availableProviders.size === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        success: false,
        dryRun,
        error: 'No providers available. Cannot sync.',
        changedAgents: [],
        changedCategories: [],
        warnings: ['No providers detected from opencode CLI'],
        sourceRef: { pinnedSha: getPinnedSha() }
      }));
    } else {
      error(`${colors.red}❌ No providers available. Cannot sync.${colors.reset}`);
    }
    process.exit(1);
  }

  if (!jsonOutput) {
    log(`\n${colors.cyan}Available providers:${colors.reset} ${Array.from(availableProviders).join(', ')}\n`);
  }

  // Read current requirements
  const current = readLocalRequirements();

  // Generate updated requirements
  const updated = generateUpdatedRequirements(current, availableProviders);

  // Compute diff
  const diff = computeDiff(current, updated);

  // Get pinned SHA for sourceRef
  const pinnedSha = getPinnedSha();

  const warnings = [];

  // Check for agents with no available providers after mapping
  for (const [agentName, config] of Object.entries(current.agents)) {
    if (!updated.agents[agentName] || !updated.agents[agentName].fallbackChain || updated.agents[agentName].fallbackChain.length === 0) {
      warnings.push(`Agent "${agentName}" has no available providers after mapping`);
    }
  }

  // Structured JSON output mode
  if (jsonOutput) {
    const summaryParts = [];
    if (diff.changedAgents.length > 0) {
      summaryParts.push(`${diff.changedAgents.length} agent(s) changed`);
    }
    if (diff.changedCategories.length > 0) {
      summaryParts.push(`${diff.changedCategories.length} category(ies) changed`);
    }
    if (diff.unchangedCount > 0) {
      summaryParts.push(`${diff.unchangedCount} unchanged`);
    }

    const result = {
      success: true,
      dryRun,
      sourceRef: {
        pinnedSha,
        modelRequirementsFile: MODEL_REQUIREMENTS_FILE
      },
      providers: Array.from(availableProviders),
      changedAgents: diff.changedAgents,
      changedCategories: diff.changedCategories,
      unchangedCount: diff.unchangedCount,
      warnings,
      summary: summaryParts.length > 0 ? summaryParts.join(', ') : 'No changes'
    };

    if (dryRun) {
      result.message = 'Dry run - no changes applied. Apply mode is currently disabled; review output and sync manually.';
    } else {
      result.success = false;
      result.dryRun = true;
      result.message = 'Apply mode is disabled; run drift/sync manually after review. Source file writes require backup/write-lock guard not yet implemented.';
      result.warnings = (result.warnings || []).concat(['Apply mode disabled — no source files modified']);
    }

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  // Human-readable output
  log(`${colors.cyan}📊 Summary of changes:${colors.reset}`);

  for (const change of diff.changedAgents) {
    log(`\n${colors.yellow}~ ${change.name}:${colors.reset}`);
    log(`  Old: ${change.oldChain}`);
    log(`  New: ${change.newChain}`);
  }

  for (const change of diff.changedCategories) {
    log(`\n${colors.yellow}~ ${change.name}:${colors.reset}`);
    log(`  Old: ${change.oldChain}`);
    log(`  New: ${change.newChain}`);
  }

  if (diff.changedAgents.length === 0 && diff.changedCategories.length === 0) {
    log(`\n${colors.green}✅ No changes needed - all fallback chains already match available providers${colors.reset}`);
  }

  if (warnings.length > 0) {
    log(`\n${colors.yellow}⚠ Warnings:${colors.reset}`);
    for (const w of warnings) {
      log(`  - ${w}`);
    }
  }

  if (pinnedSha) {
    log(`\n${colors.gray}📌 Pinned upstream SHA: ${pinnedSha}${colors.reset}`);
  }

  if (dryRun) {
    log(`\n${colors.yellow}⚠ Dry run mode - no changes applied${colors.reset}`);
    log(`${colors.gray}   Apply mode is currently disabled; review output and sync manually.${colors.reset}`);
  } else {
    log(`\n${colors.yellow}⚠ Apply mode is disabled${colors.reset}`);
    log(`${colors.gray}   Run drift/sync manually after review.${colors.reset}`);
    log(`${colors.gray}   Source file writes require backup/write-lock guard not yet implemented.${colors.reset}`);
  }
}

// Run
main().catch(e => {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  if (jsonOutput) {
    console.log(JSON.stringify({ success: false, error: e.message, dryRun: !args.includes('--apply') }));
  } else {
    error(`${colors.red}❌ Error: ${e.message}${colors.reset}`);
  }
  process.exit(1);
});
