/**
 * Core module for model fetching, caching, and management
 * Handles `opencode models --verbose` parsing and model operations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CACHE_DIR, OPENCODE_CONFIG_FILE, PROVIDER_ALIASES, normalizeProviderName, getProviderPolicy } = require('../constants');

// Cache file paths
const MODELS_CACHE_FILE = path.join(CACHE_DIR, 'models-cache.json');
const MODELS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (increased from 5)
/**
 * Parse models from opencode --verbose output
 * Handles nested JSON with brace counting
 * 
 * @param {string} output - Raw CLI output
 * @returns {Object} - { models: Array, warnings: Array, errors: Array, partial: boolean }
 */
function parseModels(output) {
  const models = [];
  const warnings = [];
  const errors = [];
  
  // Input validation
  if (!output || typeof output !== 'string') {
    errors.push('Invalid input: output must be a non-empty string');
    return { models: [], warnings, errors, partial: false };
  }
  
  const lines = output.split('\n');
  
  // Empty output check - check if all lines are empty/whitespace
  const hasContent = lines.some(line => line.trim() !== '');
  if (!hasContent) {
    errors.push('Empty CLI output received');
    return { models: [], warnings, errors, partial: false };
  }
  
  let currentModel = null;
  let jsonBuffer = '';
  let braceCount = 0;
  let parsedCount = 0;
  let skippedCount = 0;
  let lineNumber = 0;

  const modelHeaderLineRe = /^[a-z0-9_.-]+\/[a-z0-9_.-]+[a-z0-9_.-:/]*$/i;

  for (const line of lines) {
    lineNumber++;
    
    if (modelHeaderLineRe.test(line) && braceCount === 0) {
      currentModel = line.trim();
      jsonBuffer = '';
    } else if (currentModel) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceCount += openBraces - closeBraces;
      
      // Sanity check: brace count should never go negative
      if (braceCount < 0) {
        warnings.push(`Line ${lineNumber}: Brace count went negative for model "${currentModel}" - malformed JSON`);
        braceCount = 0;
        currentModel = null;
        jsonBuffer = '';
        skippedCount++;
        continue;
      }
      
      jsonBuffer += (jsonBuffer ? '\n' : '') + line;
      
      if (braceCount === 0 && jsonBuffer) {
        try {
          const modelData = JSON.parse(jsonBuffer);
          
          // Validate required fields
          if (!modelData.id) {
            warnings.push(`Line ${lineNumber}: Model "${currentModel}" missing 'id' field - using header as fallback`);
            modelData.id = currentModel.split('/').pop() || 'unknown';
          }
          
          // Bounds check: ensure modelData is an object
          if (typeof modelData !== 'object' || modelData === null) {
            warnings.push(`Line ${lineNumber}: Model "${currentModel}" parsed to non-object - skipping`);
            skippedCount++;
            currentModel = null;
            jsonBuffer = '';
            continue;
          }
          
          const baseId = modelData.id;
          models.push({
            ...modelData,
            modelID: baseId,
            id: currentModel
          });
          parsedCount++;
        } catch (e) {
          warnings.push(`Line ${lineNumber}: Failed to parse JSON for model "${currentModel}": ${e.message}`);
          skippedCount++;
        }
        currentModel = null;
        jsonBuffer = '';
      }
    }
  }
  
  // Check for unclosed braces at end of input
  if (braceCount !== 0) {
    errors.push(`Unclosed braces at end of input (braceCount=${braceCount}) - incomplete model data`);
  }
  
  // Check for incomplete model at end
  if (currentModel && jsonBuffer) {
    warnings.push(`Incomplete model at end of input: "${currentModel}" - data may be truncated`);
  }
  
  // Summary warning if many models were skipped
  if (skippedCount > 0 && parsedCount === 0) {
    errors.push(`All ${skippedCount} model(s) failed to parse - CLI output format may have changed`);
  } else if (skippedCount > 0) {
    warnings.push(`${skippedCount} model(s) skipped due to parse errors`);
  }
  
  const partial = errors.length > 0 || (skippedCount > 0 && parsedCount > 0);
  
  return { models, warnings, errors, partial };
}

/**
 * Extract unique providers from models list
 */
function extractProviders(models) {
  const providerSet = new Set();
  models.forEach(model => {
    const provider = model.providerID || model.id.split('/')[0];
    if (provider) {
      providerSet.add(provider);
    }
  });
  return Array.from(providerSet).sort();
}

/**
 * Load models from cache if valid
 */
function loadCachedModels() {
  try {
    if (!fs.existsSync(MODELS_CACHE_FILE)) {
      return null;
    }
    
    const cache = JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
    const age = Date.now() - cache.timestamp;
    
    if (age > MODELS_CACHE_TTL) {
      return null; // Cache expired
    }

    try {
      if (OPENCODE_CONFIG_FILE && fs.existsSync(OPENCODE_CONFIG_FILE)) {
        const mtimeMs = fs.statSync(OPENCODE_CONFIG_FILE).mtimeMs;
        if (mtimeMs > cache.timestamp) {
          return null;
        }
      }
    } catch (e) {
    }
    
    return cache;
  } catch (e) {
    return null;
  }
}

/**
 * Load models from cache ignoring TTL/expiry (emergency fallback)
 */
function loadCachedModelsIgnoreExpiry() {
  try {
    if (!fs.existsSync(MODELS_CACHE_FILE)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Save models to cache
 */
function saveModelsToCache(models, providers) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cache = {
      models,
      providers,
      timestamp: Date.now(),
      count: models.length
    };
    fs.writeFileSync(MODELS_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('Failed to save models cache:', e.message);
  }
}

/**
 * Fetch models from opencode CLI
 * 
 * @param {Object} options - Options
 * @param {boolean} options.allowCachedFallback - Whether to return cached data on parse failure
 * @returns {Object} - { models, providers, fromCache, warnings, errors, partial }
 */
function fetchModelsFromCLI(options = {}) {
  const { allowCachedFallback = true } = options;
  
  try {
    const output = execSync('opencode models --verbose', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: parseInt(process.env.OMO_MODELS_TIMEOUT || '120000', 10) // 2 min default, configurable via env
    });
    
    const parseResult = parseModels(output);
    const { models, warnings, errors, partial } = parseResult;
    
    // If parsing completely failed and we have cached data, use it as fallback
    if (models.length === 0 && errors.length > 0 && allowCachedFallback) {
      const cached = loadCachedModels();
      if (cached && cached.models && cached.models.length > 0) {
        return {
          models: cached.models,
          providers: cached.providers,
          fromCache: true,
          warnings: [...warnings, 'Parse failed - using cached models as fallback'],
          errors,
          partial: true
        };
      }
    }
    
    const providers = extractProviders(models);
    
    return { 
      models, 
      providers, 
      fromCache: false,
      warnings,
      errors,
      partial
    };
  } catch (execError) {
    const stderr = execError?.stderr ? String(execError.stderr) : '';
    
    // Try to use cached data as fallback
    if (allowCachedFallback) {
      const cached = loadCachedModels();
      if (cached && cached.models && cached.models.length > 0) {
        return {
          models: cached.models,
          providers: cached.providers,
          fromCache: true,
          warnings: ['CLI execution failed - using cached models as fallback'],
          errors: [`CLI error: ${execError.message}`],
          partial: true
        };
      }
    }
    
    const messageParts = [
      'Failed to run "opencode models --verbose".',
      '',
      'Possible causes:',
      '  1. OpenCode is not installed',
      '  2. OpenCode is not in your PATH',
      '  3. OpenCode configuration error',
      ''
    ];
    
    if (stderr.trim()) {
      messageParts.push('OpenCode error:', stderr.trim(), '');
    }
    
    messageParts.push(
      'To fix:',
      '  - Verify: opencode --version',
      '  - Try: opencode models'
    );
    
    const error = new Error(messageParts.join('\n'));
    error.cause = execError;
    throw error;
  }
}

/**
 * Get models (from cache or fetch fresh)
 * 
 * @param {boolean} forceRefresh - Force fresh fetch from CLI
 * @returns {Object} - { models, providers, total, cached, fetchedAt, warnings, errors, partial }
 */
async function getModels(forceRefresh = false) {
  // Always try cache first, even if forceRefresh (will be used as fallback)
  const cached = loadCachedModels();
  
  if (!forceRefresh && cached) {
    return {
      models: cached.models,
      providers: cached.providers,
      total: cached.models.length,
      cached: true,
      fetchedAt: new Date(cached.timestamp).toISOString(),
      warnings: [],
      errors: [],
      partial: false
    };
  }
  
  // Try CLI fetch with cache fallback
  try {
    const result = fetchModelsFromCLI({ allowCachedFallback: true });
    
    // Only save to cache if we got valid models and they're not from cache already
    if (result.models.length > 0 && !result.fromCache) {
      saveModelsToCache(result.models, result.providers);
    }
    
    return {
      models: result.models,
      providers: result.providers,
      total: result.models.length,
      cached: result.fromCache,
      fetchedAt: new Date().toISOString(),
      warnings: result.warnings || [],
      errors: result.errors || [],
      partial: result.partial || false
    };
  } catch (cliError) {
    // CLI failed - try cache as emergency fallback (even if stale)
    const emergencyCache = cached || loadCachedModelsIgnoreExpiry();
    if (emergencyCache && emergencyCache.models && emergencyCache.models.length > 0) {
      console.error('CLI fetch failed, using cached models:', cliError.message);
      return {
        models: emergencyCache.models,
        providers: emergencyCache.providers,
        total: emergencyCache.models.length,
        cached: true,
        fetchedAt: new Date(emergencyCache.timestamp).toISOString(),
        warnings: ['Using cached models due to CLI error: ' + cliError.message],
        errors: [],
        partial: false
      };
    }
    // No cache available - rethrow
    throw cliError;
  }
}

/**
 * Filter models based on criteria
 */
function filterModels(models, filters = {}) {
  return models.filter(model => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const name = (model.name || '').toLowerCase();
      const id = (model.id || '').toLowerCase();
      const provider = (model.providerID || '').toLowerCase();
      
      const match = name.includes(searchLower) ||
                   id.includes(searchLower) ||
                   provider.includes(searchLower);
      if (!match) return false;
    }
    
    // Provider filter
    if (filters.providers && filters.providers.length > 0) {
      const provider = model.providerID || model.id.split('/')[0];
      if (!filters.providers.includes(provider)) {
        return false;
      }
    }
    
    // Capability filters
    if (filters.capabilities && filters.capabilities.length > 0) {
      const caps = model.capabilities || {};
      const hasAll = filters.capabilities.every(cap => {
        switch (cap) {
          case 'reasoning':
            return caps.reasoning === true;
          case 'image':
            return caps.input?.image === true;
          case 'pdf':
            return caps.input?.pdf === true;
          case 'thinking':
            return hasExtendedThinking(model);
          default:
            return false;
        }
      });
      if (!hasAll) return false;
    }
    
    // Context size filter
    if (filters.minContext) {
      const context = model.limit?.context || 0;
      if (context < filters.minContext) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Check if model has extended thinking capability
 */
function hasExtendedThinking(model) {
  const interleaved = model.capabilities?.interleaved;

  if (interleaved === true) return true;

  if (interleaved && typeof interleaved === 'object' && interleaved.field) {
    return true;
  }

  const variants = model.variants;
  if (variants && typeof variants === 'object') {
    for (const v of Object.values(variants)) {
      if (v?.thinking?.type === 'enabled') return true;
    }
  }

  return false;
}

/**
 * Check if model is "fast" based on naming or cost
 */
function isFastModel(model) {
  const name = (model.name || '').toLowerCase();
  const id = (model.id || '').toLowerCase();
  const family = (model.family || '').toLowerCase();
  
  const fastPatterns = ['flash', 'fast', 'mini', 'lite', 'haiku', 'instant'];
  for (const pattern of fastPatterns) {
    if (name.includes(pattern) || id.includes(pattern) || family.includes(pattern)) {
      return true;
    }
  }

  const cost = model.cost;
  if (cost) {
    const totalCost = (cost.input || 0) + (cost.output || 0);
    if (totalCost < 5 && totalCost > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Get model by ID
 */
function getModelById(models, modelId) {
  return models.find(m => m.id === modelId || m.modelID === modelId);
}

/**
 * Find duplicate models (same model name/family from different providers)
 */
function findDuplicateModels(models) {
  const duplicates = new Map();
  
  models.forEach(model => {
    const baseName = (model.name || model.id.split('/').pop()).toLowerCase();
    const family = (model.family || '').toLowerCase();
    const key = family || baseName;
    
    if (!duplicates.has(key)) {
      duplicates.set(key, []);
    }
    duplicates.get(key).push(model);
  });
  
  // Filter to only entries with multiple providers
  const result = {};
  duplicates.forEach((models, key) => {
    if (models.length > 1) {
      result[key] = models;
    }
  });
  
  return result;
}

/**
 * Rank providers by preference/cost effectiveness
 * Lower score = better
 *
 * Provider priority (from upstream docs):
 * Native (anthropic, openai, google) > Kimi for Coding > GitHub Copilot > Venice > OpenCode > Z.ai Coding Plan
 */

/**
 * Rank providers by preference/cost effectiveness
 * Lower score = better
 *
 * Provider priority (from upstream docs):
 * Native (anthropic, openai, google) > Kimi for Coding > GitHub Copilot > Venice > OpenCode > Z.ai Coding Plan
 */
function rankProvider(provider, model) {
  const providerId = normalizeProviderName(provider);
  const policy = getProviderPolicy(providerId) || {
    billingModel: 'unknown',
    speedTier: 'unknown',
    priorityTier: 99
  };

  const totalCost = (model.cost?.input || 0) + (model.cost?.output || 0);
  const context = model.limit?.context || 0;

  const tierScore = (policy.priorityTier || 99) * 10;
  const speedScore = policy.speedTier === 'fast' ? -5 : (policy.speedTier === 'slow' ? 5 : 0);
  const contextScore = context >= 200000 ? -20 : (context >= 128000 ? -10 : 0);

  let costScore = 0;
  if (totalCost > 0) {
    costScore = Math.min(totalCost, 50);
  } else {
    if (policy.billingModel === 'subscription' || policy.billingModel === 'free') {
      costScore = -10;
    }
  }

  return tierScore + speedScore + contextScore + costScore;
}

/**
 * Get the best provider for a model among duplicates
 */
function getBestProvider(duplicates) {
  const ranked = duplicates.map(model => {
    const provider = model.providerID || model.id.split('/')[0];
    return {
      model,
      provider,
      score: rankProvider(provider, model)
    };
  });
  
  ranked.sort((a, b) => a.score - b.score);
  return ranked[0];
}

/**
 * Sort models with intelligent criteria
 */
function sortModels(models, sortBy = 'smart', sortOrder = 'asc') {
  const sorted = [...models];
  
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
      
    case 'provider':
      sorted.sort((a, b) => {
        const provA = a.providerID || a.id.split('/')[0];
        const provB = b.providerID || b.id.split('/')[0];
        return provA.localeCompare(provB);
      });
      break;
      
    case 'cost':
      sorted.sort((a, b) => {
        const costA = a.cost ? (a.cost.input || 0) + (a.cost.output || 0) : Infinity;
        const costB = b.cost ? (b.cost.input || 0) + (b.cost.output || 0) : Infinity;
        return costA - costB;
      });
      break;
      
    case 'context':
      sorted.sort((a, b) => (b.limit?.context || 0) - (a.limit?.context || 0));
      break;
      
    case 'smart':
    default: {
      // Smart sort: duplicates ranked by provider preference, then by name
      const duplicates = findDuplicateModels(sorted);
      
      sorted.sort((a, b) => {
        const baseNameA = (a.name || a.id.split('/').pop()).toLowerCase();
        const baseNameB = (b.name || b.id.split('/').pop()).toLowerCase();
        
        // If same model family, rank by provider
        if (baseNameA === baseNameB) {
          const provA = a.providerID || a.id.split('/')[0];
          const provB = b.providerID || b.id.split('/')[0];
          return rankProvider(provA, a) - rankProvider(provB, b);
        }
        
        // Otherwise sort by name
        return baseNameA.localeCompare(baseNameB);
      });
      break;
    }
  }
  
  return sortOrder === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Format model for display
 */
function formatModel(model, options = {}) {
  const caps = model.capabilities || {};
  const context = model.limit?.context || 0;
  const providerRaw = model.providerID || model.id.split('/')[0];
  const providerId = normalizeProviderName(providerRaw);
  const policy = getProviderPolicy(providerId) || {
    billingModel: 'unknown',
    speedTier: 'unknown',
    priorityTier: 99
  };
  
  // Build capability badges
  const badges = [];
  if (caps.reasoning) badges.push('R');
  if (caps.input?.image) badges.push('I');
  if (caps.input?.pdf) badges.push('P');
  if (hasExtendedThinking(model)) badges.push('T');
  
  // Format context size
  const contextDisplay = context >= 1000 ? `${Math.round(context / 1000)}K` : `${context}`;
  
  // Cost indicator
  let costDisplay = '';
  if (model.cost) {
    const total = (model.cost.input || 0) + (model.cost.output || 0);
    if (total > 50) costDisplay = '$$$$';
    else if (total > 20) costDisplay = '$$$';
    else if (total > 5) costDisplay = '$$';
    else if (total > 0) costDisplay = '$';
  }
  
  return {
    id: model.id,
    modelID: model.modelID,
    name: model.name || model.id,
    provider: providerRaw,
    context,
    contextDisplay,
    badges,
    cost: model.cost,
    costDisplay,
    billingModel: policy.billingModel,
    speedTier: policy.speedTier,
    priorityTier: policy.priorityTier,
    unitCost: model.cost,
    pricingSource: 'opencode',
    capabilities: caps,
    isFast: isFastModel(model),
    hasThinking: hasExtendedThinking(model)
  };
}

module.exports = {
  getModels,
  filterModels,
  getModelById,
  formatModel,
  hasExtendedThinking,
  isFastModel,
  parseModels,
  extractProviders,
  sortModels,
  findDuplicateModels,
  getBestProvider,
  rankProvider,
  normalizeProviderName
};
