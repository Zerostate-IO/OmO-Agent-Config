/**
 * Core module for model fetching, caching, and management
 * Handles `opencode models --verbose` parsing and model operations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CACHE_DIR, OPENCODE_CONFIG_FILE } = require('../constants');

// Cache file paths
const MODELS_CACHE_FILE = path.join(CACHE_DIR, 'models-cache.json');
const MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Parse models from opencode --verbose output
 * Handles nested JSON with brace counting
 */
function parseModels(output) {
  const models = [];
  const lines = output.split('\n');
  let currentModel = null;
  let jsonBuffer = '';
  let braceCount = 0;

  const modelHeaderLineRe = /^[a-z0-9_.-]+\/[a-z0-9_.-]+[a-z0-9_.-:/]*$/i;

  for (const line of lines) {
    if (modelHeaderLineRe.test(line) && braceCount === 0) {
      currentModel = line.trim();
      jsonBuffer = '';
    } else if (currentModel) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceCount += openBraces - closeBraces;
      
      jsonBuffer += (jsonBuffer ? '\n' : '') + line;
      
      if (braceCount === 0 && jsonBuffer) {
        try {
          const modelData = JSON.parse(jsonBuffer);
          const baseId = modelData.id;
          models.push({
            ...modelData,
            modelID: baseId,
            id: currentModel
          });
        } catch (e) {
          // Skip malformed JSON
        }
        currentModel = null;
        jsonBuffer = '';
      }
    }
  }

  return models;
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
 */
function fetchModelsFromCLI() {
  try {
    const output = execSync('opencode models --verbose', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000 // 30 second timeout
    });
    
    const models = parseModels(output);
    const providers = extractProviders(models);
    
    return { models, providers, fromCache: false };
  } catch (execError) {
    const stderr = execError?.stderr ? String(execError.stderr) : '';
    
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
 */
async function getModels(forceRefresh = false) {
  // Try cache first
  if (!forceRefresh) {
    const cached = loadCachedModels();
    if (cached) {
      return {
        models: cached.models,
        providers: cached.providers,
        total: cached.models.length,
        cached: true,
        fetchedAt: new Date(cached.timestamp).toISOString()
      };
    }
  }
  
  // Fetch fresh
  const { models, providers } = fetchModelsFromCLI();
  saveModelsToCache(models, providers);
  
  return {
    models,
    providers,
    total: models.length,
    cached: false,
    fetchedAt: new Date().toISOString()
  };
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
            return caps.interleaved?.field === 'thinking';
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
  return interleaved && typeof interleaved === 'object' && interleaved.field;
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
 */
function rankProvider(provider, model) {
  const cost = model.cost ? (model.cost.input || 0) + (model.cost.output || 0) : 0;
  const context = model.limit?.context || 0;
  
  // Provider tiers (lower is better)
  const providerTiers = {
    'opencode': 1,    // Native - best
    'cerebras': 2,    // New - good performance
    'nvidia': 3,      // Good for specific workloads
    'google': 4,      // Standard
    'openrouter': 5,  // Aggregator - variable
    'xai': 6,         // Newer provider
    'zai-coding-plan': 7,
    'anthropic': 8,
    'openai': 9
  };
  
  let score = 0;
  
  // Provider tier (0-100 points)
  score += (providerTiers[provider] || 10) * 10;
  
  // Cost effectiveness (lower cost = better, 0-50 points)
  if (cost > 0) {
    score += Math.min(cost, 50);
  } else {
    score -= 10; // Free/cheap gets bonus
  }
  
  // Context size bonus (larger context = better, -20 to 0 points)
  if (context >= 200000) score -= 20;
  else if (context >= 128000) score -= 10;
  
  return score;
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
    provider: model.providerID || model.id.split('/')[0],
    context,
    contextDisplay,
    badges,
    cost: model.cost,
    costDisplay,
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
  rankProvider
};
