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
  'coding-plan': 'zai-coding-plan'
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
      "GPT-native agent; may not perform as well on non-OpenAI models."
    ],
    preferred: ["reasoning", "thinking", "large_context"],
    minContext: 128000
  }
};

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
  loadJsoncFile
};
