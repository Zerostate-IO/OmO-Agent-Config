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
      configSplit: null,
      hints: []
    };
  }

  // Collect data
  const { discovered } = collectDiscoveredProviders({ refresh });
  const { expected, fromAssignments, fromConfig: expectedFromConfig } = collectExpectedProviders();
  const mismatches = classifyProviderMismatches(discovered, expected);

  // Determine cache status
  const cacheStatus = getCacheStatus();

  // Build config-split diagnostics (sibling file, stale schema, plugin rename)
  const configSplit = buildConfigSplitDiagnostics();

  // Merge hints: provider diagnostics hints + config-split warning strings
  const hints = generateHints(mismatches, cacheStatus);
  for (const w of configSplit.warnings) {
    hints.push(`[${w.code}] ${w.message}`);
  }

  return {
    generatedAt,
    sources: {
      fromConfig: expectedFromConfig,
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
    configSplit,
    hints
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
      const configuredProviders = getConfiguredProvidersObject(opencodeConfig);
      const configuredPlugins = getConfiguredPluginsList(opencodeConfig);
      
      // Extract providers object keys (hard expected providers)
      if (configuredProviders) {
        for (const providerKey of Object.keys(configuredProviders)) {
          const normalized = normalizeProviderName(providerKey);
          expectedSet.add(normalized);
          fromConfig.providersNormalized.push(normalized);
        }
      }

      // Extract plugins list as informational hints only (NOT hard expected)
      if (configuredPlugins) {
        for (const plugin of configuredPlugins) {
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
            // Extract provider prefix from model assignment
            // Handles nested paths like "fireworks-ai/accounts/fireworks/models/xxx" -> "fireworks-ai"
            const parts = agentConfig.model.split('/');
            if (parts.length >= 1) {
              const providerPrefix = parts[0];
              const normalized = normalizeProviderName(providerPrefix);
              expectedSet.add(normalized);
              fromAssignments.providersNormalized.push(normalized);
              
              // Track reference count
              const count = providerRefCount.get(normalized) || 0;
              providerRefCount.set(normalized, count + 1);
              
              // Warn about nested model paths (informational, not an error)
              if (parts.length > 2) {
                fromAssignments.warnings.push(
                  `Agent '${agentKey}' uses nested model path: ${agentConfig.model} (provider: ${normalized})`
                );
              }
            }
          }
        }
      
      // Convert reference counts to sources array
      for (const [provider, count] of providerRefCount.entries()) {
        fromAssignments.sources.push({ provider, modelRefCount: count });
      }
      }
    } else {
      fromAssignments.warnings.push(`OmO config file not found: ${CONFIG_FILE}`);
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

function getConfiguredProvidersObject(opencodeConfig) {
  if (!opencodeConfig || typeof opencodeConfig !== 'object') {
    return null;
  }

  // Support both plural 'providers' and singular 'provider' schema keys
  const providers = opencodeConfig.providers || opencodeConfig.provider;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    return null;
  }

  return providers;
}

function getConfiguredPluginsList(opencodeConfig) {
  if (!opencodeConfig || typeof opencodeConfig !== 'object') {
    return null;
  }

  // Support both plural 'plugins' and singular 'plugin' schema keys
  const plugins = opencodeConfig.plugins || opencodeConfig.plugin;
  if (Array.isArray(plugins)) {
    return plugins;
  }
  if (typeof plugins === 'string' || (plugins && typeof plugins === 'object')) {
    return [plugins];
  }
  return null;
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

/**
 * Build config-split diagnostics
 * Read-only detection of sibling config files, stale schema URLs,
 * and plugin rename state. Never writes or mutates any file.
 *
 * @returns {Object} Config split diagnostics
 */
function buildConfigSplitDiagnostics() {
  const generatedAt = new Date().toISOString();
  const warnings = [];

  // --- File existence ---
  const primaryConfigPath = CONFIG_FILE;  // oh-my-opencode.jsonc (intentionally preserved name)
  const siblingConfigPath = path.join(CONFIG_DIR, 'oh-my-openagent.jsonc');

  const primaryExists = fs.existsSync(primaryConfigPath);
  const siblingExists = fs.existsSync(siblingConfigPath);

  // Determine file state
  let fileState;
  if (primaryExists && siblingExists) {
    fileState = 'both';
  } else if (primaryExists && !siblingExists) {
    fileState = 'primary-only';
  } else if (!primaryExists && siblingExists) {
    fileState = 'sibling-only';
    warnings.push({
      severity: 'warning',
      code: 'PRIMARY_CONFIG_MISSING',
      message: 'Primary config oh-my-opencode.jsonc does not exist, but sibling oh-my-openagent.jsonc was found. The upstream rename preserved the oh-my-opencode.jsonc filename; a sibling file is advisory only and not read by OmO at runtime.'
    });
  } else {
    fileState = 'none';
    warnings.push({
      severity: 'info',
      code: 'NO_CONFIG_FOUND',
      message: 'Neither oh-my-opencode.jsonc nor oh-my-openagent.jsonc found in CONFIG_DIR.'
    });
  }

  if (primaryExists && siblingExists) {
    warnings.push({
      severity: 'info',
      code: 'SIBLING_FILE_EXISTS',
      message: 'Sibling oh-my-openagent.jsonc exists alongside primary oh-my-opencode.jsonc. This is advisory only; OmO reads oh-my-opencode.jsonc at runtime. The sibling file is not automatically migrated or deleted.'
    });
  }

  // --- Schema URL checks ---
  const schemaDiagnostics = checkSchemaUrls(primaryConfigPath, primaryExists);

  // --- Plugin rename state ---
  const pluginDiagnostics = checkPluginRenameState();

  // Combine all warnings
  const allWarnings = [
    ...warnings,
    ...schemaDiagnostics.warnings,
    ...pluginDiagnostics.warnings
  ];

  return {
    generatedAt,
    files: {
      primary: {
        path: primaryConfigPath,
        exists: primaryExists,
        name: 'oh-my-opencode.jsonc'
      },
      sibling: {
        path: siblingConfigPath,
        exists: siblingExists,
        name: 'oh-my-openagent.jsonc'
      },
      state: fileState
    },
    schema: schemaDiagnostics,
    plugins: pluginDiagnostics,
    warnings: allWarnings,
    readOnly: true
  };
}

/**
 * Check schema URLs in primary config for stale references
 * @param {string} configPath - Path to oh-my-opencode.jsonc
 * @param {boolean} exists - Whether the file exists
 * @returns {Object} Schema diagnostics
 */
function checkSchemaUrls(configPath, exists) {
  const warnings = [];
  const result = {
    schemaUrl: null,
    isStale: false,
    isCanonical: false,
    canonicalUrl: null,
    stalePattern: 'code-yeongyu/oh-my-opencode/master',
    canonicalPattern: 'code-yeongyu/oh-my-openagent',
    warnings
  };

  try {
    const { getSchemaUrl } = require('../upstream-constants');
    result.canonicalUrl = getSchemaUrl();
  } catch (e) {
    result.canonicalUrl = 'https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json';
  }

  if (!exists) {
    return result;
  }

  try {
    const config = loadJsoncFile(configPath);
    if (!config || typeof config !== 'object') {
      return result;
    }

    const schemaUrl = config.$schema || null;
    result.schemaUrl = schemaUrl;

    if (!schemaUrl) {
      return result;
    }

    if (schemaUrl.includes('code-yeongyu/oh-my-opencode/master') ||
        schemaUrl.includes('code-yeongyu/oh-my-opencode/dev')) {
      result.isStale = true;
      warnings.push({
        severity: 'warning',
        code: 'STALE_SCHEMA_URL',
        message: `The $schema URL in oh-my-opencode.jsonc references the old upstream repository path: ${schemaUrl}. The upstream repo was renamed to code-yeongyu/oh-my-openagent but config filenames intentionally remain unchanged. Consider updating $schema to the canonical URL.`
      });
    }

    if (schemaUrl.includes('code-yeongyu/oh-my-openagent')) {
      result.isCanonical = true;
    }
  } catch (error) {
    warnings.push({
      severity: 'warning',
      code: 'SCHEMA_CHECK_FAILED',
      message: `Could not read config for schema check: ${error.message}`
    });
  }

  return result;
}

/**
 * Check plugin configuration for rename-related state
 * Inspects opencode.json for singular/plural plugin keys and
 * presence of oh-my-opencode vs oh-my-openagent plugin references.
 *
 * @returns {Object} Plugin diagnostics
 */
function checkPluginRenameState() {
  const warnings = [];
  const result = {
    hasPlugin: false,
    hasPlugins: false,
    keyUsed: null,
    plugins: [],
    hasOldPlugin: false,
    hasNewPlugin: false,
    oldPluginNames: [],
    newPluginNames: [],
    warnings
  };

  try {
    if (!fs.existsSync(OPENCODE_CONFIG_FILE)) {
      return result;
    }

    const opencodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_FILE, 'utf8'));
    if (!opencodeConfig || typeof opencodeConfig !== 'object') {
      return result;
    }

    // Detect singular vs plural key usage
    const hasPluginKey = 'plugin' in opencodeConfig;
    const hasPluginsKey = 'plugins' in opencodeConfig;
    result.hasPlugin = hasPluginKey;
    result.hasPlugins = hasPluginsKey;

    // Determine which key is actually used
    if (hasPluginsKey) {
      result.keyUsed = 'plugins';
    } else if (hasPluginKey) {
      result.keyUsed = 'plugin';
    }

    // Extract plugin list (reuse existing helper logic inline)
    let pluginList = null;
    if (hasPluginsKey) {
      pluginList = Array.isArray(opencodeConfig.plugins) ? opencodeConfig.plugins : null;
    }
    if (!pluginList && hasPluginKey) {
      const plugin = opencodeConfig.plugin;
      if (Array.isArray(plugin)) {
        pluginList = plugin;
      } else if (typeof plugin === 'string') {
        pluginList = [plugin];
      } else if (plugin && typeof plugin === 'object') {
        pluginList = [plugin];
      }
    }

    if (!pluginList) {
      return result;
    }

    // Extract names from plugin entries
    for (const entry of pluginList) {
      const name = typeof entry === 'string' ? entry : (entry && entry.name ? entry.name : null);
      if (name) {
        result.plugins.push(name);

        // Check for old/new rename-related plugin names
        const lower = name.toLowerCase();
        if (lower.includes('oh-my-opencode') && !lower.includes('oh-my-openagent')) {
          result.hasOldPlugin = true;
          result.oldPluginNames.push(name);
        }
        if (lower.includes('oh-my-openagent')) {
          result.hasNewPlugin = true;
          result.newPluginNames.push(name);
        }
      }
    }

    // Warnings for rename state
    if (result.hasOldPlugin && !result.hasNewPlugin) {
      warnings.push({
        severity: 'info',
        code: 'OLD_PLUGIN_ONLY',
        message: `Plugin config contains only pre-rename plugin references (${result.oldPluginNames.join(', ')}). The upstream repo was renamed to oh-my-openagent. Plugin functionality may still work if the plugin was also renamed upstream.`
      });
    }

    if (result.hasOldPlugin && result.hasNewPlugin) {
      warnings.push({
        severity: 'info',
        code: 'MIXED_PLUGIN_NAMES',
        message: `Plugin config contains both old (${result.oldPluginNames.join(', ')}) and new (${result.newPluginNames.join(', ')}) rename references. This may indicate a partial migration.`
      });
    }
  } catch (error) {
    warnings.push({
      severity: 'info',
      code: 'PLUGIN_CHECK_FAILED',
      message: `Could not check plugin rename state: ${error.message}`
    });
  }

  return result;
}

module.exports = {
  buildProviderDiagnostics,
  collectDiscoveredProviders,
  collectExpectedProviders,
  classifyProviderMismatches,
  buildConfigSplitDiagnostics
};
