/**
 * Provider diagnostics module
 * Analyzes provider configuration vs discovered providers for diagnostics
 */

const fs = require('fs');
const path = require('path');
const {
  CONFIG_DIR,
  CONFIG_FILE,
  OPENCODE_CONFIG_FILE,
  CACHE_DIR,
  normalizeProviderName,
  loadJsoncFile
} = require('../constants');

// Cache file path for models
const MODELS_CACHE_FILE = path.join(CACHE_DIR, 'models-cache.json');

/**
 * Build comprehensive provider diagnostics
 * @param {Object} options - Options object
 * @param {boolean} options.dryRun - If true, return skeleton with empty arrays
 * @param {boolean} options.refresh - If true, signal to refresh cache (validation only)
 * @returns {Object} Diagnostics object
 */
function buildProviderDiagnostics(options = {}) {
  const { dryRun = false, refresh } = options;

  // Validate options
  if (refresh !== undefined && typeof refresh !== 'boolean') {
    throw new Error('Invalid option: refresh must be a boolean');
  }

  const generatedAt = new Date().toISOString();

  // Dry run: return skeleton with all required keys but empty arrays
  if (dryRun) {
    return {
      generatedAt,
      sources: {
        fromConfig: {},
        fromAssignments: {}
      },
      normalized: {
        discovered: [],
        expected: []
      },
      mismatches: {
        expectedButMissing: [],
        discoveredNotExpected: [],
        aliasNormalizedMatches: []
      },
      cacheStatus: {
        exists: false,
        timestamp: null,
        ageMs: null
      },
      policy: {
        lmStudio: {
          customDetection: 'disabled',
          reason: 'LMStudio provider requires local server detection which is not implemented'
        }
      },
      hints: []
    };
  }

  // Collect data
  const { discovered, fromConfig: discoveredFromConfig } = collectDiscoveredProviders({ refresh });
  const { expected, fromAssignments, fromConfig: expectedFromConfig } = collectExpectedProviders();
  const mismatches = classifyProviderMismatches(discovered, expected);

  // Determine cache status
  const cacheStatus = getCacheStatus();

  return {
    generatedAt,
    sources: {
      fromConfig: discoveredFromConfig,
      fromAssignments
    },
    normalized: {
      discovered,
      expected
    },
    mismatches,
    cacheStatus,
    policy: {
      lmStudio: {
        customDetection: 'disabled',
        reason: 'LMStudio provider requires local server detection which is not implemented'
      }
    },
    hints: generateHints(mismatches, cacheStatus)
  };
}

/**
 * Collect discovered providers from models cache
 * @param {Object} options - Options object
 * @param {boolean} options.refresh - Refresh signal (not used here, for API consistency)
 * @returns {Object} { discovered, providersRaw, providersNormalized, cached, fetchedAt, cacheStatus, warnings, fromConfig }
 */
function collectDiscoveredProviders(options = {}) {
  const warnings = [];
  const fromConfig = {};
  const discovered = [];
  const providersRaw = [];
  const providersNormalized = [];

  // Initialize cache status
  let cacheStatus = {
    exists: false,
    timestamp: null,
    ageMs: null
  };
  let cached = false;
  let fetchedAt = null;

  try {
    // Check if cache file exists
    if (!fs.existsSync(MODELS_CACHE_FILE)) {
      return {
        discovered,
        providersRaw,
        providersNormalized,
        cached,
        fetchedAt,
        cacheStatus,
        warnings: ['No models cache file found'],
        fromConfig
      };
    }

    // Read models cache to get discovered providers
    const cache = JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
    
    // Populate cache status metadata
    const timestamp = cache.timestamp || null;
    const ageMs = timestamp ? Date.now() - timestamp : null;
    
    cacheStatus = {
      exists: true,
      timestamp,
      ageMs
    };
    cached = true;
    fetchedAt = timestamp ? new Date(timestamp).toISOString() : null;
    
    if (cache.providers && Array.isArray(cache.providers)) {
      // Track raw providers and normalize
      const normalizedSet = new Set();
      
      for (const provider of cache.providers) {
        // Store raw provider name
        providersRaw.push(provider);
        
        // Normalize and dedupe
        const normalized = normalizeProviderName(provider);
        normalizedSet.add(normalized);
        fromConfig[provider] = normalized;
      }
      
      // Build normalized array (sorted, deduped)
      providersNormalized.push(...Array.from(normalizedSet).sort());
      discovered.push(...providersNormalized);
    }
  } catch (error) {
    warnings.push(`Failed to read models cache: ${error.message}`);
  }

  return {
    discovered,
    providersRaw,
    providersNormalized,
    cached,
    fetchedAt,
    cacheStatus,
    warnings,
    fromConfig
  };
}

/**
 * Collect expected providers from configuration files
 * @returns {Object} { expected: string[], fromConfig: Object, fromAssignments: Object, warnings: string[] }
 */
function collectExpectedProviders() {
  const warnings = [];
  const fromConfig = {
    providersNormalized: [],
    pluginHints: [],
    warnings: []
  };
  const fromAssignments = {
    providersNormalized: [],
    sources: [],
    warnings: []
  };
  const expectedSet = new Set();

  // Read opencode.json for configured providers (hard expected) and plugins (informational)
  try {
    if (fs.existsSync(OPENCODE_CONFIG_FILE)) {
      const opencodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_FILE, 'utf8'));
      
      // Extract providers object keys (hard expected providers)
      if (opencodeConfig.providers && typeof opencodeConfig.providers === 'object') {
        for (const [providerKey, providerConfig] of Object.entries(opencodeConfig.providers)) {
          const normalized = normalizeProviderName(providerKey);
          expectedSet.add(normalized);
          fromConfig.providersNormalized.push(normalized);
        }
      }

      // Extract plugins list as informational hints only (NOT hard expected)
      if (opencodeConfig.plugins && Array.isArray(opencodeConfig.plugins)) {
        for (const plugin of opencodeConfig.plugins) {
          if (typeof plugin === 'string') {
            fromConfig.pluginHints.push(plugin);
          } else if (plugin && typeof plugin.name === 'string') {
            fromConfig.pluginHints.push(plugin.name);
          }
        }
      }
    } else {
      fromConfig.warnings.push(`OpenCode config file not found: ${OPENCODE_CONFIG_FILE}`);
    }
  } catch (error) {
    fromConfig.warnings.push(`Failed to read/parse opencode.json: ${error.message}`);
  }

  // Read oh-my-opencode.jsonc for assigned model provider prefixes
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const omoConfig = loadJsoncFile(CONFIG_FILE);
      
      if (omoConfig && omoConfig.agents && typeof omoConfig.agents === 'object') {
        // Track provider reference counts per source file
        const providerRefCount = new Map();
        
        for (const [agentKey, agentConfig] of Object.entries(omoConfig.agents)) {
          if (agentConfig && agentConfig.model && typeof agentConfig.model === 'string') {
            // Extract provider prefix from model assignment (e.g., "anthropic/claude..." -> "anthropic")
            const parts = agentConfig.model.split('/');
            if (parts.length >= 1) {
              const providerPrefix = parts[0];
              const normalized = normalizeProviderName(providerPrefix);
              expectedSet.add(normalized);
              
              // Track reference count
              const count = providerRefCount.get(normalized) || 0;
              providerRefCount.set(normalized, count + 1);
            }
          }
        }
        
        // Build sources array with per-provider trace
        for (const [provider, count] of providerRefCount.entries()) {
          fromAssignments.sources.push({
            sourceFile: CONFIG_FILE,
            provider,
            modelRefCount: count
          });
          fromAssignments.providersNormalized.push(provider);
        }
      }
    } else {
      fromAssignments.warnings.push(`Oh My OpenCode config file not found: ${CONFIG_FILE}`);
    }
  } catch (error) {
    fromAssignments.warnings.push(`Failed to read/parse oh-my-opencode.jsonc: ${error.message}`);
  }

  // Combine all warnings
  warnings.push(...fromConfig.warnings, ...fromAssignments.warnings);

  // Sort normalized arrays for consistent output
  fromConfig.providersNormalized.sort();
  fromConfig.pluginHints.sort();
  fromAssignments.providersNormalized.sort();

  return {
    expected: Array.from(expectedSet).sort(),
    fromConfig,
    fromAssignments,
    warnings
  };
}

/**
 * Classify provider mismatches between discovered and expected
 * @param {string[]} discovered - Normalized discovered providers
 * @param {string[]} expected - Normalized expected providers
 * @param {Object} options - Optional context for source attribution
 * @param {string[]} options.discoveredSources - Source labels for discovered providers
 * @param {string[]} options.expectedSources - Source labels for expected providers
 * @returns {Object} { expectedButMissing, discoveredNotExpected, aliasNormalizedMatches }
 */
function classifyProviderMismatches(discovered, expected, options = {}) {
  const { discoveredSources = [], expectedSources = [] } = options;

  // Re-normalize to canonical form to prevent alias false negatives
  // (defensive: inputs should already be normalized but we ensure it)
  const normalizedDiscovered = new Set(discovered.map(p => normalizeProviderName(p)));
  const normalizedExpected = new Set(expected.map(p => normalizeProviderName(p)));

  const expectedButMissing = [];
  const discoveredNotExpected = [];
  const aliasNormalizedMatches = [];

  // Find expected providers that are missing from discovered
  for (const provider of normalizedExpected) {
    if (!normalizedDiscovered.has(provider)) {
      expectedButMissing.push({
        provider,
        severity: 'warning',
        message: `Provider '${provider}' is configured but no models were discovered`,
        source: 'fromConfig'
      });
    }
  }

  // Find discovered providers that aren't in expected
  for (const provider of normalizedDiscovered) {
    if (!normalizedExpected.has(provider)) {
      discoveredNotExpected.push({
        provider,
        severity: 'info',
        message: `Provider '${provider}' has discovered models but is not explicitly configured`,
        source: 'fromModelsCache'
      });
    } else {
      // Provider exists in both - this is an alias-normalized match
      aliasNormalizedMatches.push({
        provider,
        severity: 'info',
        message: `Provider '${provider}' is both configured and has discovered models`,
        source: 'matched'
      });
    }
  }

  // Stable sort for deterministic test output (alphabetical by provider)
  const sortByProvider = (a, b) => a.provider.localeCompare(b.provider);
  expectedButMissing.sort(sortByProvider);
  discoveredNotExpected.sort(sortByProvider);
  aliasNormalizedMatches.sort(sortByProvider);

  return {
    expectedButMissing,
    discoveredNotExpected,
    aliasNormalizedMatches
  };
}

/**
 * Get cache status information
 * @returns {Object} { exists: boolean, timestamp: number|null, ageMs: number|null }
 */
function getCacheStatus() {
  try {
    if (!fs.existsSync(MODELS_CACHE_FILE)) {
      return {
        exists: false,
        timestamp: null,
        ageMs: null
      };
    }

    const cache = JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
    const timestamp = cache.timestamp || null;
    const ageMs = timestamp ? Date.now() - timestamp : null;

    return {
      exists: true,
      timestamp,
      ageMs
    };
  } catch (error) {
    return {
      exists: false,
      timestamp: null,
      ageMs: null
    };
  }
}

/**
 * Generate helpful hints based on diagnostics
 * Includes explicit remediation commands for cache refresh
 * @param {Object} mismatches - Mismatches object
 * @param {Object} cacheStatus - Cache status object
 * @returns {string[]} Array of hint strings
 */
function generateHints(mismatches, cacheStatus) {
  const hints = [];
  const cachePath = '~/.config/opencode/cache/models-cache.json';

  // Hint for stale cache with explicit remediation
  if (cacheStatus.exists && cacheStatus.ageMs !== null) {
    const ageMinutes = Math.floor(cacheStatus.ageMs / 60000);
    if (ageMinutes > 30) {
      hints.push(`Models cache is ${ageMinutes} minutes old.`);
      hints.push('To refresh:');
      hints.push('  CLI: opencode models --verbose');
      hints.push('  API: GET /api/models?refresh=true');
      hints.push(`  Cache: ${cachePath}`);
    }
  }

  // Hint for missing cache with explicit remediation
  if (!cacheStatus.exists) {
    hints.push('No models cache found. To populate:');
    hints.push('  CLI: opencode models --verbose');
    hints.push('  API: GET /api/models?refresh=true');
    hints.push(`  Cache location: ${cachePath}`);
  }

  // Hint for expected but missing providers
  if (mismatches.expectedButMissing.length > 0) {
    const providers = mismatches.expectedButMissing.map(m => m.provider).join(', ');
    hints.push(`Configured providers with no models: ${providers}.`);
    hints.push('  Check API keys in ~/.config/opencode/opencode.json');
    hints.push('  Refresh models with: opencode models --verbose');
  }

  // Hint for discovered but not expected
  if (mismatches.discoveredNotExpected.length > 0) {
    hints.push('Some discovered providers are not in your configuration.');
    hints.push('  This is informational - models are available for use.');
  }

  return hints;
}

module.exports = {
  buildProviderDiagnostics,
  collectDiscoveredProviders,
  collectExpectedProviders,
  classifyProviderMismatches
};
