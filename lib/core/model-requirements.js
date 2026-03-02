/**
 * Model requirements and fallback chain resolution
 * Mirrors upstream oh-my-opencode model requirements
 * Dependency-free: Node built-ins only
 *
 * @upstream-url https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/model-requirements.ts
 * @upstream-sha 15519b95802376d4e3a631443c0fa74d895e960d
 */

const { PROVIDER_ALIASES, getProviderAliases } = require('../constants');

/**
 * @typedef {Object} FallbackEntry
 * @property {string[]} providers - List of providers to try
 * @property {string} model - Model identifier
 * @property {string} [variant] - Entry-specific variant (e.g., "high", "max")
 */

/**
 * @typedef {Object} ModelRequirement
 * @property {FallbackEntry[]} fallbackChain - Ordered list of fallback entries
 * @property {string} [variant] - Default variant when entry doesn't specify one
 * @property {string} [requiresModel] - Only activates when this model is available (fuzzy match)
 * @property {boolean} [requiresAnyModel] - Requires at least ONE model in fallbackChain to be available
 * @property {string[]} [requiresProvider] - Only activates when any of these providers is connected
 */

/**
 * Agent-specific model requirements
 * @type {Record<string, ModelRequirement>}
 */
const AGENT_MODEL_REQUIREMENTS = {
  sisyphus: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["zai-coding-plan", "opencode"], model: "glm-5" },
      { providers: ["opencode"], model: "big-pickle" },
    ],
    requiresAnyModel: true,
  },
  hephaestus: {
    fallbackChain: [
      { providers: ["openai", "opencode"], model: "gpt-5.3-codex", variant: "medium" },
    ],
    requiresProvider: ["openai", "opencode"],
  },
  oracle: {
    fallbackChain: [
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
    ],
  },
  librarian: {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["opencode"], model: "minimax-m2.5-free" },
      { providers: ["opencode"], model: "big-pickle" },
    ],
  },
  explore: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "grok-code-fast-1" },
      { providers: ["opencode"], model: "minimax-m2.5-free" },
      { providers: ["anthropic", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
      { providers: ["zai-coding-plan"], model: "glm-4.6v" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5-nano" },
    ],
  },
  prometheus: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  metis: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
    ],
  },
  momus: {
    fallbackChain: [
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "medium" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
    ],
  },
  atlas: {
    fallbackChain: [
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-6" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
    ],
  },
};

/**
 * Category-specific model requirements
 * @type {Record<string, ModelRequirement>}
 */
const CATEGORY_MODEL_REQUIREMENTS = {
  "visual-engineering": {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
      { providers: ["zai-coding-plan", "opencode"], model: "glm-5" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
    ],
  },
  ultrabrain: {
    fallbackChain: [
      { providers: ["openai", "opencode"], model: "gpt-5.3-codex", variant: "xhigh" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
    ],
  },
  deep: {
    fallbackChain: [
      { providers: ["openai", "opencode"], model: "gpt-5.3-codex", variant: "medium" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
    ],
    requiresModel: "gpt-5.3-codex",
  },
  artistry: {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "high" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
    ],
    requiresModel: "gemini-3-pro",
  },
  quick: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "unspecified-low": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-6" },
      { providers: ["openai", "opencode"], model: "gpt-5.3-codex", variant: "medium" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
    ],
  },
  "unspecified-high": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  writing: {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-6" },
    ],
  },
};

/**
 * Transform model ID for specific provider naming conventions
 * @param {string} provider - Provider name
 * @param {string} model - Model identifier
 * @returns {string} Transformed model ID
 */
function transformModelForProvider(provider, model) {
  if (provider === "github-copilot") {
    return model
      .replace("claude-opus-4-6", "claude-opus-4.6")
      .replace("claude-sonnet-4-6", "claude-sonnet-4.6")
      .replace("claude-haiku-4-5", "claude-haiku-4.5")
      .replace("claude-sonnet-4", "claude-sonnet-4")
      .replace("gemini-3-pro", "gemini-3-pro-preview")
      .replace("gemini-3-flash", "gemini-3-flash-preview");
  }
  return model;
}

/**
 * Normalize model ID for punctuation-tolerant matching
 * Handles variations like claude-opus-4-6 vs claude-opus-4.6
 * @param {string} modelId - Model identifier to normalize
 * @returns {string} Normalized model ID
 */
function normalizeModelId(modelId) {
  if (!modelId) return '';
  
  return modelId
    .toLowerCase()
    .replace(/[-_.]+/g, '-')  // Normalize all separators to hyphen
    .replace(/-preview$/, '')  // Strip preview suffix for matching
    .replace(/-latest$/, '');  // Strip latest suffix for matching
}

/**
 * Check if a model ID matches a pattern with tolerant matching
 * @param {string} modelId - Model identifier to check
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} True if model matches pattern
 */
function modelIdMatches(modelId, pattern) {
  if (!modelId || !pattern) return false;
  
  const normalizedModel = normalizeModelId(modelId);
  const normalizedPattern = normalizeModelId(pattern);
  
  // Direct match after normalization
  if (normalizedModel === normalizedPattern) return true;
  
  // Pattern is a substring of model
  if (normalizedModel.includes(normalizedPattern)) return true;
  
  // Model is a substring of pattern
  if (normalizedPattern.includes(normalizedModel)) return true;
  
  return false;
}

/**
 * Check if a provider is available in the availability map
 * Uses canonical PROVIDER_ALIASES from constants.js
 * @param {string} provider - Provider name to check
 * @param {Record<string, boolean>} availability - Map of provider availability
 * @returns {boolean} True if provider is available
 */
function isProviderAvailable(provider, availability) {
  if (!availability || typeof availability !== 'object') return false;

  // Check exact match
  if (availability[provider] === true) return true;

  // Check normalized provider name
  const normalizedProvider = provider.toLowerCase().trim();
  if (availability[normalizedProvider] === true) return true;

  // Use canonical aliases from constants.js
  const canonicalProvider = PROVIDER_ALIASES[normalizedProvider];
  if (canonicalProvider && availability[canonicalProvider] === true) return true;

  // Check all aliases for the canonical provider
  const allAliases = getProviderAliases(canonicalProvider || normalizedProvider);
  return allAliases.some(alias => availability[alias] === true);
}

/**
 * Resolve model from fallback chain based on availability
 * @param {FallbackEntry[]} fallbackChain - Ordered list of fallback entries
 * @param {Record<string, boolean>} availability - Map of provider availability
 * @returns {{model: string, variant?: string}|null} Resolved model or null if none available
 */
function resolveModelFromChain(fallbackChain, availability) {
  if (!Array.isArray(fallbackChain) || fallbackChain.length === 0) {
    return null;
  }
  
  for (const entry of fallbackChain) {
    for (const provider of entry.providers) {
      if (isProviderAvailable(provider, availability)) {
        const transformedModel = transformModelForProvider(provider, entry.model);
        return {
          model: `${provider}/${transformedModel}`,
          variant: entry.variant,
        };
      }
    }
  }
  return null;
}

/**
 * Check if any fallback entry is available
 * @param {FallbackEntry[]} fallbackChain - List of fallback entries
 * @param {Record<string, boolean>} availability - Map of provider availability
 * @returns {boolean} True if at least one entry is available
 */
function isAnyFallbackEntryAvailable(fallbackChain, availability) {
  if (!Array.isArray(fallbackChain) || fallbackChain.length === 0) {
    return false;
  }
  
  return fallbackChain.some((entry) =>
    entry.providers.some((provider) => isProviderAvailable(provider, availability))
  );
}

/**
 * Check if a required model is available in the fallback chain
 * @param {string} requiresModel - Model that must be available
 * @param {FallbackEntry[]} fallbackChain - List of fallback entries
 * @param {Record<string, boolean>} availability - Map of provider availability
 * @returns {boolean} True if required model is available
 */
function isRequiredModelAvailable(requiresModel, fallbackChain, availability) {
  if (!requiresModel || !Array.isArray(fallbackChain)) return false;
  
  const matchingEntry = fallbackChain.find((entry) => 
    modelIdMatches(entry.model, requiresModel)
  );
  
  if (!matchingEntry) return false;
  
  return matchingEntry.providers.some((provider) => 
    isProviderAvailable(provider, availability)
  );
}

/**
 * Check if any required provider is available
 * @param {string[]} requiredProviders - List of required providers
 * @param {Record<string, boolean>} availability - Map of provider availability
 * @returns {boolean} True if at least one required provider is available
 */
function isRequiredProviderAvailable(requiredProviders, availability) {
  if (!Array.isArray(requiredProviders) || requiredProviders.length === 0) {
    return true; // No requirements means always available
  }
  
  return requiredProviders.some((provider) => 
    isProviderAvailable(provider, availability)
  );
}

/**
 * Normalize agent key for lookup
 * Handles case variations, camelCase, snake_case, and spaces
 * @param {string} agentKey - Agent name/key to normalize
 * @returns {string} Normalized lowercase key
 */
function normalizeAgentKeyForLookup(agentKey) {
  if (!agentKey || typeof agentKey !== 'string') {
    return '';
  }
  
  const normalized = agentKey
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase to kebab-case
    .replace(/_/g, '-')                   // snake_case to kebab-case
    .replace(/\s+/g, '-');                // spaces to hyphens
  
  return normalized;
}

/**
 * Create a signature for a fallback entry for deduplication
 * Uses model + variant + first provider (providers[0]) as the signature
 * @param {FallbackEntry} entry - Fallback entry
 * @returns {string} Signature string
 */
function createEntrySignature(entry) {
  if (!entry) return '';
  
  const model = entry.model || '';
  const variant = entry.variant || '';
  // Use first provider for signature (primary provider determines uniqueness)
  const firstProvider = Array.isArray(entry.providers) && entry.providers.length > 0 
    ? entry.providers[0] 
    : '';
  
  return `${model}|${variant}|${firstProvider}`;
}

/**
 * De-duplicate fallback chain entries by model+variant+providers signature
 * Preserves first occurrence
 * @param {FallbackEntry[]} chain - Fallback chain to de-duplicate
 * @returns {FallbackEntry[]} De-duplicated chain
 */
function deduplicateFallbackChain(chain) {
  if (!Array.isArray(chain)) {
    return [];
  }
  
  const seen = new Set();
  const result = [];
  
  for (const entry of chain) {
    const signature = createEntrySignature(entry);
    if (!seen.has(signature)) {
      seen.add(signature);
      result.push(entry);
    }
  }
  
  return result;
}

/**
 * Get the effective fallback chain for an agent, merging overrides with upstream
 * 
 * Merge semantics:
 * - Agent keys are normalized (PascalCase -> lowercase, camelCase -> kebab-case, etc.)
 * - If agent has an override, the override chain completely replaces upstream
 * - If agent has no override, returns the upstream chain
 * - Unknown agents (not in upstream) return null unless they have an override
 * - De-duplicates entries by model+variant+providers signature
 * 
 * @param {string} agentName - Agent name (may need normalization)
 * @param {Object} overrides - Override envelope { version, updatedAt, agents: { [name]: { fallbackChain } } }
 * @returns {FallbackEntry[]|null} Effective fallback chain or null for unknown agents
 */
function getEffectiveFallbackChain(agentName, overrides) {
  // Handle null/undefined/empty agent name
  if (!agentName || typeof agentName !== 'string') {
    return null;
  }
  
  // Normalize the agent key for lookup
  const normalizedKey = normalizeAgentKeyForLookup(agentName);
  if (!normalizedKey) {
    return null;
  }
  
  // Get upstream requirements
  const upstreamRequirements = AGENT_MODEL_REQUIREMENTS[normalizedKey];
  const upstreamChain = upstreamRequirements?.fallbackChain || null;
  
  // Handle null/undefined/missing overrides
  if (!overrides || typeof overrides !== 'object') {
    // No overrides, return upstream (or null for unknown agent)
    return upstreamChain ? deduplicateFallbackChain(upstreamChain) : null;
  }
  
  // Get agents map from overrides
  const agentsMap = overrides.agents;
  if (!agentsMap || typeof agentsMap !== 'object') {
    // No agents in overrides, return upstream
    return upstreamChain ? deduplicateFallbackChain(upstreamChain) : null;
  }
  
  // Check for override (case-insensitive match)
  let overrideEntry = null;
  
  // First try exact normalized match
  if (agentsMap[normalizedKey]) {
    overrideEntry = agentsMap[normalizedKey];
  } else {
    // Try case-insensitive match on override keys
    for (const [overrideKey, entry] of Object.entries(agentsMap)) {
      const normalizedOverrideKey = normalizeAgentKeyForLookup(overrideKey);
      if (normalizedOverrideKey === normalizedKey) {
        overrideEntry = entry;
        break;
      }
    }
  }
  
  // If we have an override for this agent, use it
  if (overrideEntry && Array.isArray(overrideEntry.fallbackChain)) {
    return deduplicateFallbackChain(overrideEntry.fallbackChain);
  }
  
  // No override, return upstream (or null for unknown agent)
  return upstreamChain ? deduplicateFallbackChain(upstreamChain) : null;
}


module.exports = {
  AGENT_MODEL_REQUIREMENTS,
  CATEGORY_MODEL_REQUIREMENTS,
  transformModelForProvider,
  resolveModelFromChain,
  isAnyFallbackEntryAvailable,
  isRequiredModelAvailable,
  isRequiredProviderAvailable,
  normalizeModelId,
  modelIdMatches,
  isProviderAvailable,
  getEffectiveFallbackChain,
  normalizeAgentKeyForLookup,
  deduplicateFallbackChain,
  createEntrySignature
};
