/**
 * Provider diagnostics module
 * Analyzes provider configuration vs discovered providers for diagnostics
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  CONFIG_DIR,
  CONFIG_FILE,
  OPENCODE_CONFIG_FILE,
  OPENCODE_AUTH_FILE,
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
 * @param {boolean} options.refresh - If true, refresh models cache via getModels(true) before building
 * @param {Function} [options.loadModels] - Test-only: async () => { models, providers, warnings } injection
 * @returns {Promise<Object>} Diagnostics object
 */
async function buildProviderDiagnostics(options = {}) {
  const { dryRun = false, refresh, loadModels } = options;

  // Validate options
  if (refresh !== undefined && typeof refresh !== 'boolean') {
    throw new Error('Invalid option: refresh must be a boolean');
  }
  if (loadModels !== undefined && typeof loadModels !== 'function') {
    throw new Error('Invalid option: loadModels must be a function');
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
        matched: []
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
      auth: buildEmptyAuthDiagnostics(),
      configSplit: null,
      hints: []
    };
  }

  // Collect discovered providers — use refresh path when requested
  let discovered;
  const refreshWarnings = [];

  if (refresh) {
    try {
      const loader = loadModels || (async () => {
        const { getModels } = require('./models');
        return getModels(true);
      });
      const refreshed = await loader();
      const providers = refreshed.providers && Array.isArray(refreshed.providers) && refreshed.providers.length > 0
        ? refreshed.providers
        : deriveProvidersFromModels(refreshed.models);
      discovered = normalizeProviderList(providers);
    } catch (refreshError) {
      // Refresh failed — fall back to cache-only diagnostics with a structured warning
      refreshWarnings.push(`Model refresh failed: ${refreshError.message}; using cached data`);
      const cached = collectDiscoveredProviders({ refresh: false });
      discovered = cached.discovered;
    }
  } else {
    const cacheResult = collectDiscoveredProviders({ refresh: false });
    discovered = cacheResult.discovered;
  }

  const { expected, fromAssignments, fromConfig: expectedFromConfig } = collectExpectedProviders();
  const mismatches = classifyProviderMismatches(discovered, expected);

  // Determine cache status
  const cacheStatus = getCacheStatus();

  // Build config-split diagnostics (sibling file, stale schema, plugin rename)
  const configSplit = buildConfigSplitDiagnostics();

  const auth = collectProviderAuthDiagnostics();

  // Merge hints: provider diagnostics hints + config-split warning strings + refresh warnings
  const hints = generateHints(mismatches, cacheStatus);
  for (const w of configSplit.warnings) {
    hints.push(`[${w.code}] ${w.message}`);
  }
  for (const rw of refreshWarnings) {
    hints.push(rw);
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
    auth,
    configSplit,
    hints
  };
}

async function buildProviderHealthCheck(options = {}) {
  const {
    live = false,
    refreshModels = false,
    providers,
    timeoutMs = 15000,
    modelsResult,
    probeModel
  } = options;

  if (typeof live !== 'boolean') throw new Error('Invalid option: live must be a boolean');
  if (typeof refreshModels !== 'boolean') throw new Error('Invalid option: refreshModels must be a boolean');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('Invalid option: timeoutMs must be an integer between 1000 and 120000');
  }
  if (providers !== undefined && !Array.isArray(providers)) {
    throw new Error('Invalid option: providers must be an array');
  }

  const expectedData = collectExpectedProviders();
  const authDiagnostics = collectProviderAuthDiagnostics({ providers: expectedData.expected });
  const modelData = await resolveHealthModels({ refreshModels, modelsResult });
  const discovered = normalizeProviderList(modelData.providers);
  const assignmentModels = collectAssignedModelsByProvider();
  const visibleModels = collectVisibleModelsByProvider(modelData.models);
  const selectedProviders = selectHealthProviders(providers, expectedData.expected);
  const activeProbe = probeModel || runOpenCodeModelProbe;

  const providerResults = [];
  const warnings = [...expectedData.warnings, ...modelData.warnings];

  for (const provider of selectedProviders) {
    const authState = getHealthAuthState(provider, authDiagnostics);
    const assignedModels = assignmentModels[provider] || [];
    const providerModels = visibleModels[provider] || [];
    const selectedModel = chooseHealthModel(assignedModels, providerModels);
    const configured = expectedData.expected.includes(provider);
    const visible = discovered.includes(provider) || providerModels.length > 0;
    const result = {
      provider,
      configured,
      visible,
      authPresent: authState.status === 'present',
      liveOk: null,
      liveStatus: live ? 'skipped' : 'not-requested',
      model: selectedModel,
      sources: buildHealthSources(provider, expectedData, visible, authState),
      auth: authState,
      reason: live ? null : 'Live provider probe was not requested'
    };

    if (live) {
      if (!visible) {
        if (configured && result.authPresent) {
          result.suggestion = 'refresh_discovery';
          result.reason = 'Provider is configured with credentials but not visible in model discovery; refresh model discovery (opencode models --verbose) before retrying live probe';
        } else {
          result.reason = 'Provider is not visible in OpenCode model discovery';
        }
      } else if (!selectedModel) {
        result.reason = 'No visible model was available for this provider';
      } else {
        const probe = await runHealthProbe(activeProbe, selectedModel, timeoutMs);
        result.liveOk = probe.ok;
        result.liveStatus = probe.ok ? 'ok' : 'failed';
        result.reason = probe.reason;
        if (probe.errorCategory) result.errorCategory = probe.errorCategory;
      }
    }

    providerResults.push(result);
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    optIn: true,
    noSecretOutput: true,
    modelDiscoverySource: 'opencode models --verbose',
    liveRequested: live,
    refreshModels,
    timeoutMs,
    policy: {
      noPageLoadProbe: true,
      lmStudio: {
        customDetection: 'disabled',
        reason: 'Models only surface through opencode models --verbose; no localhost probing is performed'
      }
    },
    providers: providerResults,
    warnings,
    hints: buildHealthHints(providerResults)
  };
}

function normalizeProviderList(providers) {
  if (!Array.isArray(providers)) return [];
  return Array.from(new Set(providers.map(p => normalizeProviderName(p)).filter(Boolean))).sort();
}

/**
 * Derive canonical provider names from an array of model objects.
 * Uses model.providerID when present, falls back to model.id.split('/')[0].
 * Returns a sorted, deduped array of normalized provider names.
 *
 * @param {Array} models - Array of model objects with id and optional providerID
 * @returns {string[]} Sorted, deduped, normalized provider names
 */
function deriveProvidersFromModels(models) {
  if (!Array.isArray(models)) return [];
  const providerSet = new Set();
  for (const model of models) {
    if (!model || typeof model !== 'object') continue;
    let raw;
    if (typeof model.providerID === 'string' && model.providerID) {
      raw = model.providerID;
    } else if (typeof model.id === 'string') {
      raw = model.id.split('/')[0];
    } else {
      continue;
    }
    const normalized = normalizeProviderName(raw);
    if (normalized) providerSet.add(normalized);
  }
  return Array.from(providerSet).sort();
}

async function resolveHealthModels(options = {}) {
  const { refreshModels = false, modelsResult } = options;
  if (modelsResult) {
    return {
      models: Array.isArray(modelsResult.models) ? modelsResult.models : [],
      providers: Array.isArray(modelsResult.providers) ? modelsResult.providers : [],
      warnings: Array.isArray(modelsResult.warnings) ? modelsResult.warnings : []
    };
  }

  if (refreshModels) {
    const { getModels } = require('./models');
    const result = await getModels(true);
    return {
      models: Array.isArray(result.models) ? result.models : [],
      providers: Array.isArray(result.providers) ? result.providers : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : []
    };
  }

  try {
    if (!fs.existsSync(MODELS_CACHE_FILE)) {
      return { models: [], providers: [], warnings: ['No models cache file found'] };
    }
    const cache = JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
    const models = Array.isArray(cache.models) ? cache.models : [];
    const providers = cache.providers && Array.isArray(cache.providers) && cache.providers.length > 0
      ? cache.providers
      : deriveProvidersFromModels(models);
    return { models, providers, warnings: [] };
  } catch (error) {
    return { models: [], providers: [], warnings: [`Failed to read models cache: ${error.message}`] };
  }
}

function collectAssignedModelsByProvider() {
  const out = {};
  try {
    if (!fs.existsSync(CONFIG_FILE)) return out;
    const config = loadJsoncFile(CONFIG_FILE);
    const agents = config && config.agents && typeof config.agents === 'object' ? config.agents : {};
    for (const agentConfig of Object.values(agents)) {
      if (!agentConfig || typeof agentConfig.model !== 'string') continue;
      const provider = normalizeProviderName(agentConfig.model.split('/')[0]);
      if (!out[provider]) out[provider] = [];
      if (!out[provider].includes(agentConfig.model)) out[provider].push(agentConfig.model);
    }
  } catch (error) {
    return out;
  }
  return out;
}

function collectVisibleModelsByProvider(models) {
  const out = {};
  if (!Array.isArray(models)) return out;
  for (const model of models) {
    if (!model || typeof model.id !== 'string') continue;
    const provider = normalizeProviderName(model.providerID || model.id.split('/')[0]);
    if (!out[provider]) out[provider] = [];
    if (!out[provider].includes(model.id)) out[provider].push(model.id);
  }
  for (const ids of Object.values(out)) ids.sort();
  return out;
}

function selectHealthProviders(requestedProviders, expectedProviders) {
  const source = requestedProviders && requestedProviders.length > 0 ? requestedProviders : expectedProviders;
  return normalizeProviderList(source);
}

function chooseHealthModel(assignedModels, visibleModels) {
  for (const model of assignedModels) {
    if (visibleModels.includes(model)) return model;
  }
  return visibleModels[0] || assignedModels[0] || null;
}

function getHealthAuthState(provider, authDiagnostics) {
  const state = authDiagnostics.providers[provider];
  if (state) {
    return {
      status: state.status,
      detectedAuthTypes: state.detectedAuthTypes,
      sources: state.sources,
      warnings: state.warnings || []
    };
  }
  return {
    status: 'unknown',
    detectedAuthTypes: [],
    sources: [],
    warnings: ['Auth source detection is not implemented for this provider']
  };
}

function buildHealthSources(provider, expectedData, visible, authState) {
  const sources = [];
  if (expectedData.fromConfig.providersNormalized.includes(provider)) sources.push('opencode-config');
  if (expectedData.fromAssignments.providersNormalized.includes(provider)) sources.push('assignment');
  if (visible) sources.push('models-cache');
  if (authState.status === 'present') sources.push(...authState.sources.map(source => source.kind));
  return Array.from(new Set(sources)).sort();
}

async function runHealthProbe(probeModel, modelId, timeoutMs) {
  try {
    const probeResult = await probeModel(modelId, { timeoutMs });
    if (probeResult && probeResult.ok === false) {
      return {
        ok: false,
        reason: probeResult.reason || 'OpenCode probe failed',
        errorCategory: probeResult.errorCategory || 'unknown'
      };
    }
    return { ok: true, reason: 'OpenCode probe succeeded' };
  } catch (error) {
    const category = classifyProbeError(error);
    return {
      ok: false,
      reason: buildProbeFailureReason(category),
      errorCategory: category
    };
  }
}

function runOpenCodeModelProbe(modelId, options = {}) {
  execFileSync('opencode', [
    'run',
    '--model', modelId,
    '--format', 'json',
    'Respond with exactly OK.'
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs || 15000,
    env: process.env
  });
  return { ok: true };
}

function classifyProbeError(error) {
  if (error && (error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT')) return 'timeout';
  const text = `${error && error.message ? error.message : ''} ${error && error.stderr ? String(error.stderr) : ''}`.toLowerCase();
  if (text.includes('unauthorized') || text.includes('authentication') || text.includes('api key') || text.includes('invalid key') || text.includes('forbidden')) return 'auth';
  if (text.includes('rate limit') || text.includes('quota')) return 'rate-limit';
  if (text.includes('not found') || text.includes('model')) return 'model-unavailable';
  if (text.includes('network') || text.includes('econn') || text.includes('timeout')) return 'network';
  return 'unknown';
}

function buildProbeFailureReason(category) {
  const reasons = {
    auth: 'OpenCode probe failed; authentication or authorization was rejected',
    'rate-limit': 'OpenCode probe failed because the provider reported a rate limit or quota issue',
    'model-unavailable': 'OpenCode probe failed because the selected model was unavailable',
    network: 'OpenCode probe failed because of a network or connectivity issue',
    timeout: 'OpenCode probe timed out',
    unknown: 'OpenCode probe failed'
  };
  return reasons[category] || reasons.unknown;
}

function buildHealthHints(providerResults) {
  const hints = [];
  for (const provider of providerResults) {
    if (!provider.configured) hints.push(`${provider.provider}: provider is not referenced by the active config`);
    if (!provider.visible && provider.suggestion === 'refresh_discovery') {
      hints.push(`${provider.provider}: provider is configured with credentials but not visible; refresh model discovery (opencode models --verbose) before retrying live probe`);
    } else if (!provider.visible) {
      hints.push(`${provider.provider}: provider is not visible in opencode models --verbose`);
    }
    if (provider.liveStatus === 'failed') hints.push(`${provider.provider}: live probe failed (${provider.errorCategory || 'unknown'})`);
  }
  return hints;
}

function buildEmptyAuthDiagnostics(extraProviders = []) {
  const providers = {
    xai: buildProviderAuthState('xai', ['api-key', 'oauth']),
    deepseek: buildProviderAuthState('deepseek', ['api-key'])
  };
  for (const provider of normalizeProviderList(extraProviders)) {
    if (!providers[provider]) providers[provider] = buildProviderAuthState(provider, ['api-key', 'oauth']);
  }

  return {
    readOnly: true,
    noSecretOutput: true,
    authFile: {
      path: OPENCODE_AUTH_FILE,
      exists: false
    },
    providers,
    warnings: []
  };
}

function buildProviderAuthState(provider, supportedAuthTypes) {
  return {
    provider,
    supportedAuthTypes,
    detectedAuthTypes: [],
    status: 'missing',
    sources: [],
    warnings: []
  };
}

function collectProviderAuthDiagnostics(options = {}) {
  const diagnostics = buildEmptyAuthDiagnostics(options.providers || []);

  collectAuthFileSources(diagnostics);
  collectConfigAuthSources(diagnostics);
  collectEnvAuthSources(diagnostics);

  for (const providerState of Object.values(diagnostics.providers)) {
    providerState.detectedAuthTypes = Array.from(new Set(providerState.detectedAuthTypes)).sort();
    providerState.status = providerState.sources.length > 0 ? 'present' : 'missing';
  }

  diagnostics.warnings.push(...Object.values(diagnostics.providers).flatMap(state => state.warnings));
  return diagnostics;
}

function collectAuthFileSources(diagnostics) {
  diagnostics.authFile.exists = fs.existsSync(OPENCODE_AUTH_FILE);
  if (!diagnostics.authFile.exists) return;

  let authData;
  try {
    authData = JSON.parse(fs.readFileSync(OPENCODE_AUTH_FILE, 'utf8'));
  } catch (error) {
    diagnostics.warnings.push(`Failed to read OpenCode auth file: ${error.message}`);
    return;
  }

  for (const provider of Object.keys(diagnostics.providers)) {
    const entry = authData && typeof authData === 'object' ? authData[provider] : null;
    if (!entry || typeof entry !== 'object') continue;

    const state = diagnostics.providers[provider];
    const fields = Object.keys(entry).sort();
    const authType = classifyAuthFileEntry(entry);
    state.detectedAuthTypes.push(authType);
    if (authType === 'unknown') {
      state.warnings.push(`OpenCode auth file has ${provider} credentials with an unrecognized shape`);
    }
    state.sources.push({
      kind: 'auth-file',
      path: OPENCODE_AUTH_FILE,
      provider,
      authType,
      fields,
      present: true,
      redacted: true
    });
  }
}

function classifyAuthFileEntry(entry) {
  const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
  if (type.includes('oauth') || 'access' in entry || 'refresh' in entry) return 'oauth';
  if (type.includes('key') || 'key' in entry || 'apiKey' in entry || 'api_key' in entry) return 'api-key';
  return 'unknown';
}

function collectConfigAuthSources(diagnostics) {
  if (!fs.existsSync(OPENCODE_CONFIG_FILE)) return;

  let opencodeConfig;
  try {
    opencodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_FILE, 'utf8'));
  } catch (error) {
    diagnostics.warnings.push(`Failed to read OpenCode config for auth diagnostics: ${error.message}`);
    return;
  }

  const configuredProviders = getConfiguredProvidersObject(opencodeConfig);
  if (!configuredProviders) return;

  for (const provider of Object.keys(diagnostics.providers)) {
    const matchingConfigs = Object.entries(configuredProviders)
      .filter(([providerKey]) => normalizeProviderName(providerKey) === provider)
      .filter(([, providerConfig]) => providerConfig && typeof providerConfig === 'object');
    if (matchingConfigs.length === 0) continue;

    const authFields = matchingConfigs.flatMap(([providerKey, providerConfig]) => {
      return findAuthFieldPaths(providerConfig, `provider.${providerKey}`);
    }).sort();
    if (authFields.length === 0) continue;

    const state = diagnostics.providers[provider];
    state.detectedAuthTypes.push('api-key');
    state.sources.push({
      kind: 'opencode-config',
      path: OPENCODE_CONFIG_FILE,
      provider,
      authType: 'api-key',
      fields: authFields,
      present: true,
      redacted: true
    });
  }
}

function findAuthFieldPaths(value, prefix) {
  const fields = [];
  const authKeyPattern = /^(apiKey|api_key|key|token|access|refresh)$/i;

  function walk(current, currentPath) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${currentPath}.${key}`;
      if (authKeyPattern.test(key)) fields.push(childPath);
      if (child && typeof child === 'object') walk(child, childPath);
    }
  }

  walk(value, prefix);
  return fields.sort();
}

function collectEnvAuthSources(diagnostics) {
  const envByProvider = {
    xai: ['XAI_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY']
  };

  for (const provider of Object.keys(diagnostics.providers)) {
    const genericEnvName = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
    const envNames = Array.from(new Set([...(envByProvider[provider] || []), genericEnvName]));
    const state = diagnostics.providers[provider];
    for (const envName of envNames) {
      if (!process.env[envName]) continue;
      state.detectedAuthTypes.push('api-key');
      state.sources.push({
        kind: 'environment',
        provider,
        authType: 'api-key',
        env: envName,
        present: true,
        redacted: true
      });
    }
  }
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
    
    const cacheProviders = cache.providers && Array.isArray(cache.providers) && cache.providers.length > 0
      ? cache.providers
      : null;

    if (cacheProviders) {
      const normalizedSet = new Set();
      
      for (const provider of cacheProviders) {
        providersRaw.push(provider);
        const normalized = normalizeProviderName(provider);
        normalizedSet.add(normalized);
        fromConfig[provider] = normalized;
      }
      
      providersNormalized.push(...Array.from(normalizedSet).sort());
      discovered.push(...providersNormalized);
    } else if (Array.isArray(cache.models) && cache.models.length > 0) {
      // Legacy cache: derive providers from model entries
      const derived = deriveProvidersFromModels(cache.models);
      providersNormalized.push(...derived);
      discovered.push(...derived);
      warnings.push('Cache providers key absent/empty; derived providers from model entries');
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
 * @returns {Object} { expectedButMissing, discoveredNotExpected, matched }
 */
function classifyProviderMismatches(discovered, expected, options = {}) {
  const { discoveredSources = [], expectedSources = [] } = options;

  // Re-normalize to canonical form to prevent alias false negatives
  // (defensive: inputs should already be normalized but we ensure it)
  const normalizedDiscovered = new Set(discovered.map(p => normalizeProviderName(p)));
  const normalizedExpected = new Set(expected.map(p => normalizeProviderName(p)));

  const expectedButMissing = [];
  const discoveredNotExpected = [];
  const matched = [];

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
      matched.push({
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
  matched.sort(sortByProvider);

  return {
    expectedButMissing,
    discoveredNotExpected,
    matched
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
  buildProviderHealthCheck,
  collectDiscoveredProviders,
  collectExpectedProviders,
  collectProviderAuthDiagnostics,
  classifyProviderMismatches,
  buildConfigSplitDiagnostics,
  deriveProvidersFromModels
};
