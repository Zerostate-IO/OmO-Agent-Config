/**
 * Constants and configuration values for OmO Agent Config
 */

const path = require('path');
const fs = require('fs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  dim: '\x1b[2m'
};

// Validate HOME environment variable
if (!process.env.HOME) {
  console.error('Error: HOME environment variable is not set.');
  console.error('This tool requires HOME to be defined to locate configuration files.');
  process.exit(1);
}

// Configuration paths
const CONFIG_DIR = path.join(process.env.HOME, '.config', 'opencode');
const CONFIG_FILE = path.join(CONFIG_DIR, 'oh-my-opencode.jsonc');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backups');
const CONFIGS_DIR = path.join(CONFIG_DIR, 'configs');
const CACHE_DIR = path.join(CONFIG_DIR, 'cache');
const SECRETS_DIR = path.join(CONFIG_DIR, 'secrets');
const OPENCODE_CONFIG_FILE = path.join(CONFIG_DIR, 'opencode.json');
const ACTIVE_CONFIG_FILE = path.join(CONFIG_DIR, 'active-config.json');

// Default agent configurations
// Based on Oh My Opencode v3.x defaults: https://github.com/code-yeongyu/oh-my-opencode
const DEFAULTS = {
  "google_auth": false,
  "agents": {
    "oracle": {
      "model": "openai/gpt-5.2"
    },
    "sisyphus": {
      "model": "anthropic/claude-opus-4-5"
    },
    "atlas": {
      "model": "anthropic/claude-opus-4-5"
    },
    "librarian": {
      "model": "opencode/big-pickle"
    },
    "explore": {
      "model": "opencode/gpt-5-nano"
    },
    "multimodal-looker": {
      "model": "google/gemini-3-flash"
    },
    "prometheus": {
      "model": "anthropic/claude-opus-4-5"
    },
    "metis": {
      "model": "anthropic/claude-sonnet-4-5"
    },
    "momus": {
      "model": "anthropic/claude-sonnet-4-5"
    },
    "hephaestus": {
      "model": "openai/gpt-5.3-codex"
    }
  },
  "mcps": {
    "websearch_exa": {
      "url": "https://mcp.exa.ai/mcp?exaApiKey={env:EXA_API_KEY}&tools=web_search_exa,get_code_context_exa,crawling_exa,company_research_exa,linkedin_search_exa,deep_researcher_start,deep_researcher_check",
      "type": "remote",
      "enabled": true
    },
    "grep_app": {
      "url": "https://mcp.grep.app",
      "type": "remote"
    }
  }
};

// JSONC parsing utilities (for oh-my-opencode.jsonc with comments)
function stripJsonComments(jsoncString) {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  
  while (i < jsoncString.length) {
    const char = jsoncString[i];
    const nextChar = jsoncString[i + 1] || '';
    
    if (!inString) {
      // Check for single-line comment start (//)
      if (char === '/' && nextChar === '/') {
        // Skip to end of line
        while (i < jsoncString.length && jsoncString[i] !== '\n') {
          i++;
        }
        continue;
      }
      // Check for multi-line comment start (/*)
      if (char === '/' && nextChar === '*') {
        // Skip to end of block comment
        i += 2;
        while (i < jsoncString.length - 1 && !(jsoncString[i] === '*' && jsoncString[i+1] === '/')) {
          i++;
        }
        i += 2;
        continue;
      }
      // Check for string start
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      }
    } else {
      // In string, check for escape or end
      if (char === '\\') {
        result += char + nextChar;
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
    }
    
    result += char;
    i++;
  }
  
  return result;
}

function parseJsonc(jsoncString) {
  const jsonString = stripJsonComments(jsoncString);
  return JSON.parse(jsonString);
}

function loadJsoncFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parseJsonc(content);
}

// Provider aliases for normalization
// Maps various provider names/aliases to their canonical form
// This is the SINGLE SOURCE OF TRUTH for provider alias normalization
const PROVIDER_ALIASES = {
  // Native providers
  'anthropic': 'anthropic',
  'claude': 'anthropic',
  'openai': 'openai',
  'gpt': 'openai',
  'google': 'google',
  'gemini': 'google',

  // Kimi for Coding
  'kimi-for-coding': 'kimi-for-coding',
  'kimi': 'kimi-for-coding',
  'moonshot': 'kimi-for-coding',

  // GitHub Copilot
  'github-copilot': 'github-copilot',
  'copilot': 'github-copilot',
  'github': 'github-copilot',

  // Venice
  'venice': 'venice',

  // OpenCode
  'opencode': 'opencode',
  'opencode-ai': 'opencode',
  'zen': 'opencode',

  // Z.ai Coding Plan
  'zai-coding-plan': 'zai-coding-plan',
  'zai': 'zai-coding-plan',
  'z-ai': 'zai-coding-plan',
  'coding-plan': 'zai-coding-plan',

  // Fireworks AI
  'fireworks-ai': 'fireworks-ai',
  'fireworks': 'fireworks-ai'
};

/**
 * Normalize provider name to canonical form
 * Maps CLI provider IDs and aliases to canonical names
 * @param {string} provider - Provider name to normalize
 * @returns {string} Canonical provider name
 */
function normalizeProviderName(provider) {
  if (!provider) return 'unknown';

  const normalized = provider.toLowerCase().trim();
  return PROVIDER_ALIASES[normalized] || normalized;
}

/**
 * Get all aliases for a canonical provider
 * @param {string} canonicalProvider - Canonical provider name
 * @returns {string[]} Array of aliases for the provider
 */
function getProviderAliases(canonicalProvider) {
  const aliases = [];
  for (const [alias, canonical] of Object.entries(PROVIDER_ALIASES)) {
    if (canonical === canonicalProvider) {
      aliases.push(alias);
    }
  }
  return aliases;
}

// Agent key aliases for normalization (legacy mixed-case -> canonical lowercase)
// Maps legacy/variant agent keys to their canonical lowercase form
const AGENT_KEY_ALIASES = {
  // Mixed-case legacy keys
  'Sisyphus': 'sisyphus',
  'Atlas': 'atlas',
  'Prometheus': 'prometheus',
  'Metis': 'metis',
  'Momus': 'momus',
  'Oracle': 'oracle',
  'Librarian': 'librarian',
  'Explore': 'explore',
  'Multimodal-Looker': 'multimodal-looker',
  'MultimodalLooker': 'multimodal-looker',
  'multimodalLooker': 'multimodal-looker',
  'Hephaestus': 'hephaestus',
  // Any other variant spellings can be added here
};

/**
 * Normalize an agent key to its canonical lowercase form.
 * Handles legacy mixed-case keys by mapping them to canonical form.
 * @param {string} key - The agent key to normalize
 * @returns {string} - The canonical lowercase agent key
 */
function normalizeAgentKey(key) {
  if (!key || typeof key !== 'string') {
    return key;
  }
  // First check if it's a known alias (exact match)
  if (AGENT_KEY_ALIASES[key]) {
    return AGENT_KEY_ALIASES[key];
  }
  // Otherwise, lowercase it (handles already-lowercase keys)
  return key.toLowerCase();
}

// Agent characteristics for recommendations
// Agent profiles based on Oh My Opencode v3.x actual agent purposes
// See: https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/AGENTS.md
const AGENT_PROFILES = {
  "oracle": {
    description: "Read-only consultant for architecture, debugging, and deep review.",
    access: "read-only",
    usage: [
      "Use for: architecture decisions, tricky debugging, and design/code review",
      "Avoid for: making edits or running commands (consultation only)"
    ],
    caveats: [
      "Consultation-only agent (no code changes)."
    ],
    preferred: ["reasoning", "large_context"],
    minContext: 128000
  },
  "sisyphus": {
    description: "Primary orchestrator: plans, delegates, verifies, and ships.",
    access: "write",
    usage: [
      "Use for: most multi-step engineering work",
      "Best with: strong reasoning + extended thinking models"
    ],
    preferred: ["reasoning", "thinking", "large_context"],
    minContext: 128000
  },
  "atlas": {
    description: "Executor/orchestrator for executing structured plans (e.g., from Prometheus).",
    access: "limited",
    usage: [
      "Use for: executing a prepared plan with delegated sub-tasks",
      "Avoid for: ad-hoc prompting without a plan"
    ],
    caveats: [
      "Designed to run with /start-work against a Prometheus plan."
    ],
    preferred: ["reasoning", "thinking", "large_context"],
    minContext: 128000
  },
  "librarian": {
    description: "Read-only researcher: external docs, GitHub examples, multi-repo evidence gathering.",
    access: "read-only",
    usage: [
      "Use for: unfamiliar libraries, official docs, and finding real-world OSS usage",
      "Avoid for: making edits (research only)"
    ],
    preferred: ["reasoning", "large_context"],
    minContext: 128000
  },
  "explore": {
    description: "Read-only codebase navigator: fast contextual search and structure mapping.",
    access: "read-only",
    usage: [
      "Use for: quickly finding patterns, entry points, and call sites",
      "Avoid for: edits (exploration only)"
    ],
    preferred: ["fast", "reasoning", "large_context"],
    minContext: 128000
  },
  "multimodal-looker": {
    description: "Visual analyst: interpret PDFs/images/diagrams; extract structured info from media.",
    access: "read-only",
    usage: [
      "Use for: screenshots, PDFs, diagrams, UI review from images",
      "Avoid for: code edits (analysis only)"
    ],
    preferred: ["multimodal", "image_input", "pdf_input", "video_input", "fast"],
    minContext: 64000
  },
  "prometheus": {
    description: "Planner: requirements gathering + structured implementation plans.",
    access: "limited",
    usage: [
      "Use for: complex projects needing a plan, acceptance criteria, and sequencing",
      "Avoid for: direct coding (planning-focused)"
    ],
    caveats: [
      "Often constrained to producing plans (not direct code changes)."
    ],
    preferred: ["reasoning", "thinking", "large_context"],
    minContext: 128000
  },
  "metis": {
    description: "Pre-planning analyst: finds ambiguity, hidden requirements, and failure modes.",
    access: "read-only",
    usage: [
      "Use for: clarifying scope and spotting missing constraints before planning/implementation"
    ],
    preferred: ["reasoning", "large_context"],
    minContext: 128000
  },
  "momus": {
    description: "Reviewer: validates plans/approaches for gaps, ambiguity, and verifiability.",
    access: "read-only",
    usage: [
      "Use for: plan review, QA on proposed approaches, catching missing acceptance criteria"
    ],
    caveats: [
      "Can be strict; intended to prevent shipping ambiguous work."
    ],
    preferred: ["reasoning", "large_context"],
    minContext: 128000
  },
  "hephaestus": {
    description: "GPT-native coding specialist: optimized for code generation and refactoring with OpenAI models.",
    access: "write",
    usage: [
      "Use for: code generation, refactoring, and GPT-native coding tasks",
      "Best with: OpenAI GPT-5.3 Codex models"
    ],
    caveats: [
      "Requires openai or opencode provider.",
    ],
    preferred: ["reasoning", "thinking", "large_context"],
    minContext: 128000
  }
};

// Provider policy defaults with canonical provider IDs
const PROVIDER_POLICY_DEFAULTS = {
  'anthropic': {
    billingModel: 'subscription',
    speedTier: 'fast',
    priorityTier: 1,
    notes: 'Claude models with strong reasoning capabilities'
  },
  'openai': {
    billingModel: 'subscription',
    speedTier: 'fast',
    priorityTier: 1,
    notes: 'GPT models with excellent coding capabilities'
  },
  'google': {
    billingModel: 'subscription',
    speedTier: 'fast',
    priorityTier: 1,
    notes: 'Gemini models with multimodal capabilities'
  },
  'github-copilot': {
    billingModel: 'subscription',
    speedTier: 'fast',
    priorityTier: 2,
    notes: 'GitHub Copilot integration'
  },
  'opencode': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 3,
    notes: 'OpenCode hosted models'
  },
  'kimi-for-coding': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 4,
    notes: 'Kimi models optimized for coding tasks'
  },
  'zai-coding-plan': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 4,
    notes: 'Z.ai coding plan models'
  },
  'venice': {
    billingModel: 'metered',
    speedTier: 'slow',
    priorityTier: 5,
    notes: 'Venice AI models'
  },
  'fireworks-ai': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 5,
    notes: 'Fireworks AI models'
  }
};

// Provider policy override file path
const PROVIDER_POLICIES_FILE = path.join(CONFIG_DIR, 'provider-policies.json');

// Provider policy defaults
// Defines default policies for known providers with validation
const PROVIDER_POLICIES_DEFAULTS = {
  'anthropic': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 1,
    notes: 'Metered API; strong reasoning models'
  },
  'openai': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 1,
    notes: 'Metered API; broad capability coverage'
  },
  'google': {
    billingModel: 'metered',
    speedTier: 'normal',
    priorityTier: 1,
    notes: 'Metered API; Gemini multimodal models'
  },
  'github-copilot': {
    billingModel: 'subscription',
    speedTier: 'normal',
    priorityTier: 4,
    notes: 'Subscription; quota-limited'
  },
  'opencode': {
    billingModel: 'unknown',
    speedTier: 'normal',
    priorityTier: 6,
    notes: 'Unknown billing; OpenCode native'
  },
  'kimi-for-coding': {
    billingModel: 'unknown',
    speedTier: 'fast',
    priorityTier: 5,
    notes: 'Kimi models optimized for coding'
  },
  'zai-coding-plan': {
    billingModel: 'unknown',
    speedTier: 'normal',
    priorityTier: 7,
    notes: 'Z.ai models for structured coding plans'
  },
  'venice': {
    billingModel: 'free',
    speedTier: 'slow',
    priorityTier: 8,
    notes: 'Free access; slower inference'
  },
  'fireworks-ai': {
    billingModel: 'metered',
    speedTier: 'fast',
    priorityTier: 2,
    notes: 'Fast inference for some model families'
  }
};

// Validation functions for provider policies
function validateBillingModel(value) {
  const valid = ['subscription', 'metered', 'free', 'unknown'];
  return valid.includes(value) ? value : 'unknown';
}

function validateSpeedTier(value) {
  const valid = ['fast', 'normal', 'slow', 'unknown'];
  return valid.includes(value) ? value : 'unknown';
}

function validatePriorityTier(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= 1 && num <= 99 ? num : null;
}

function validateNotes(value) {
  if (!value || typeof value !== 'string') return '';
  return value.length > 120 ? value.substring(0, 120) : value;
}

// In-memory cache for provider policies
let _providerPoliciesCache = null;
let _providerPoliciesMeta = {
  source: 'default',
  overrideFile: null,
  hasOverride: false
};

// Provider policies override file path
const PROVIDER_POLICIES_OVERRIDE_FILE = path.join(CONFIG_DIR, 'provider-policies.json');

/**
 * Load and merge provider policies with validation
 * @returns {Object} Object containing providers, overrideFile, and hasOverride
 */
function getProviderPolicies() {
  // Return cached result if available
  if (_providerPoliciesCache !== null) {
    return {
      providers: _providerPoliciesCache,
      overrideFile: _providerPoliciesMeta.overrideFile,
      hasOverride: _providerPoliciesMeta.hasOverride
    };
  }
  
  let mergedPolicies = { ...PROVIDER_POLICIES_DEFAULTS };
  let hasOverride = false;
  let overrideFile = PROVIDER_POLICIES_OVERRIDE_FILE;
  
  // Try to load override file
  try {
    if (fs.existsSync(PROVIDER_POLICIES_OVERRIDE_FILE)) {
      const overrideContent = fs.readFileSync(PROVIDER_POLICIES_OVERRIDE_FILE, 'utf8');
      const overrideData = JSON.parse(overrideContent);
      
      // Validate override file structure
      const hasValidVersion = (!('version' in overrideData)) || overrideData.version === 1;
      if (!hasValidVersion) {
        console.warn('Warning: provider-policies.json has unsupported version, using defaults');
      } else if (overrideData && typeof overrideData === 'object' && overrideData.providers && typeof overrideData.providers === 'object') {
        hasOverride = true;
        
        // Merge override policies with validation
        for (const [provider, policy] of Object.entries(overrideData.providers)) {
          if (policy && typeof policy === 'object') {
            const normalizedProvider = normalizeProviderName(provider);
            const priorityTier = validatePriorityTier(policy.priorityTier);
            if (priorityTier === null) {
              console.warn(`Warning: provider-policies.json provider '${normalizedProvider}' has invalid priorityTier, ignoring override`);
              continue;
            }
            mergedPolicies[normalizedProvider] = {
              billingModel: validateBillingModel(policy.billingModel),
              speedTier: validateSpeedTier(policy.speedTier),
              priorityTier,
              notes: validateNotes(policy.notes),
              source: 'override'
            };
          }
        }
      } else {
        console.warn(`Warning: provider-policies.json has invalid structure (missing 'providers' object), using defaults`);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, use defaults silently
    } else if (error instanceof SyntaxError) {
      console.warn(`Warning: provider-policies.json contains invalid JSON, using defaults`);
    } else {
      console.warn(`Warning: Failed to load provider-policies.json: ${error.message}, using defaults`);
    }
  }
  
  // Mark default policies with source
  for (const [provider, policy] of Object.entries(mergedPolicies)) {
    if (!policy.source) {
      mergedPolicies[provider] = {
        ...policy,
        source: 'default'
      };
    }
  }
  
  // Cache the result
  _providerPoliciesCache = mergedPolicies;
  _providerPoliciesMeta = {
    source: hasOverride ? 'override' : 'default',
    overrideFile,
    hasOverride
  };
  
  return {
    providers: mergedPolicies,
    overrideFile,
    hasOverride
  };
}

function getProviderPolicy(providerId) {
  const { providers } = getProviderPolicies();
  const key = normalizeProviderName(providerId);
  return providers[key] || null;
}

function invalidateProviderPoliciesCache() {
  _providerPoliciesCache = null;
  _providerPoliciesMeta = {
    source: 'default',
    overrideFile: null,
    hasOverride: false
  };
}

module.exports = {
  colors,
  CONFIG_DIR,
  CONFIG_FILE,
  BACKUP_DIR,
  CONFIGS_DIR,
  ACTIVE_CONFIG_FILE,
  CACHE_DIR,
  SECRETS_DIR,
  OPENCODE_CONFIG_FILE,
  DEFAULTS,
  AGENT_PROFILES,
  AGENT_KEY_ALIASES,
  PROVIDER_ALIASES,
  normalizeAgentKey,
  normalizeProviderName,
  getProviderAliases,
  parseJsonc,
  loadJsoncFile,
  PROVIDER_POLICIES_DEFAULTS,
  PROVIDER_POLICIES_OVERRIDE_FILE,
  getProviderPolicies,
  getProviderPolicy,
  invalidateProviderPoliciesCache
};
