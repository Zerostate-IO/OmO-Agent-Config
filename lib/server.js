/**
 * HTTP Server for OmO Agent Config Web UI
 * Zero-dependency server using Node.js built-in http module
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getModels, filterModels, formatModel, sortModels, findDuplicateModels, getBestProvider, rankProvider } = require('./core/models');
const { CONFIG_FILE, CONFIGS_DIR, CACHE_DIR, BACKUP_DIR, ACTIVE_CONFIG_FILE, AGENT_PROFILES, normalizeAgentKey, loadJsoncFile, getAgentFallbackOverrides, saveAgentFallbackOverrides, resetAgentFallbackOverride, validateFallbackChain } = require('./constants');
const { createBackup, listBackups, restoreBackup, deleteBackup, purgeBackups } = require('./core/backup');
const { buildProviderDiagnostics } = require('./core/provider-diagnostics');
const { getEffectiveFallbackChain } = require('./core/model-requirements');

function getDuplicateKey(model) {
  const baseName = (model.name || model.id.split('/').pop()).toLowerCase();
  const family = (model.family || '').toLowerCase();
  return family || baseName;
}

function appendAlternativeProviders(recommendedModels, allModels) {
  if (!Array.isArray(recommendedModels) || recommendedModels.length === 0 || !Array.isArray(allModels)) {
    return recommendedModels;
  }

  const duplicates = findDuplicateModels(allModels);
  const seen = new Set(recommendedModels.map(r => r.id).filter(Boolean));
  const out = [];

  for (const rec of recommendedModels) {
    out.push(rec);
    if (!rec || !rec.id) continue;

    const model = allModels.find(m => m.id === rec.id);
    if (!model) continue;

    const key = getDuplicateKey(model);
    const dups = duplicates[key];
    if (!dups || dups.length < 2) continue;

    const ranked = dups
      .filter(m => m.id !== model.id)
      .map(m => {
        const p = m.providerID || m.id.split('/')[0];
        return { model: m, provider: p, score: rankProvider(p, m) };
      })
      .sort((a, b) => a.score - b.score);

    let added = 0;
    for (const entry of ranked) {
      if (added >= 3) break;
      if (seen.has(entry.model.id)) continue;
      seen.add(entry.model.id);
      added++;
      out.push({
        id: entry.model.id,
        name: entry.model.name || entry.model.id,
        score: typeof rec.score === 'number' ? (rec.score - added * 0.01) : rec.score,
        provider: entry.provider,
        variant: rec.variant,
        provenance: 'alternative-provider'
      });
    }
  }

  return out;
}

let writeQueue = Promise.resolve();

async function withWriteLock(fn) {
  const next = writeQueue.then(fn).catch(err => {
    console.error('Write operation failed:', err);
    throw err;
  });
  writeQueue = next;
  return next;
}

// Configuration
const DEFAULT_PORT = 3456;
const MAX_PORT_ATTEMPTS = 10;
const WEB_DIR = path.join(__dirname, 'web');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Parse URL query parameters
 */
function parseQueryParams(urlStr) {
  const url = new URL(urlStr, 'http://localhost');
  const params = {};
  for (const [key, value] of url.searchParams) {
    // Handle array parameters (e.g., capabilities=reasoning&capabilities=image)
    if (params[key]) {
      if (Array.isArray(params[key])) {
        params[key].push(value);
      } else {
        params[key] = [params[key], value];
      }
    } else {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Send JSON response
 */
function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res, message, statusCode = 500) {
  sendJSON(res, { error: message, status: 'error' }, statusCode);
}

/**
 * Parse request body
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body));
        } else {
          resolve({});
        }
      } catch (e) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
  });
}

/**
 * Get currently active profile name
 */
function getActiveProfile() {
  try {
    if (fs.existsSync(ACTIVE_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_CONFIG_FILE, 'utf8'));
      return data.active;
    }
  } catch (e) {
    console.error('Error reading active profile:', e);
  }
  return null;
}

/**
 * API Route Handlers
 */
const routes = {
  // GET /api/models - List all models
  'GET /api/models': async (req, res) => {
    try {
      const params = parseQueryParams(req.url);
      const forceRefresh = params.refresh === 'true';
      
      let { models, providers, total, cached, fetchedAt } = await getModels(forceRefresh);
      
      // Apply filters if provided
      if (params.search || params.providers || params.capabilities || params.minContext) {
        const filters = {
          search: params.search,
          providers: params.providers ? (Array.isArray(params.providers) ? params.providers : [params.providers]) : undefined,
          capabilities: params.capabilities ? (Array.isArray(params.capabilities) ? params.capabilities : [params.capabilities]) : undefined,
          minContext: params.minContext ? parseInt(params.minContext) : undefined
        };
        models = filterModels(models, filters);
      }
      
      // Find duplicates before sorting
      const duplicates = findDuplicateModels(models);
      const duplicateKeys = Object.keys(duplicates);
      
      // Apply sorting if provided
      if (params.sortBy) {
        models = sortModels(models, params.sortBy, params.sortOrder);
      }
      
      // Format models for display
      const formattedModels = models.map(m => {
        const formatted = formatModel(m);
        
        // Check if this model is a duplicate and mark the best one
        const baseName = (m.name || m.id.split('/').pop()).toLowerCase();
        const family = (m.family || '').toLowerCase();
        const dupKey = family || baseName;
        
        if (duplicates[dupKey]) {
          const best = getBestProvider(duplicates[dupKey]);
          formatted.isDuplicate = true;
          formatted.isBestProvider = best.provider === formatted.provider;
          formatted.duplicateCount = duplicates[dupKey].length;
          formatted.alternativeProviders = duplicates[dupKey]
            .filter(dm => (dm.providerID || dm.id.split('/')[0]) !== formatted.provider)
            .map(dm => dm.providerID || dm.id.split('/')[0]);
        }
        
        return formatted;
      });
      
      sendJSON(res, {
        models: formattedModels,
        providers,
        total: formattedModels.length,
        cached,
        fetchedAt,
        hasDuplicates: duplicateKeys.length > 0,
        duplicateCount: duplicateKeys.length
      });
    } catch (error) {
      console.error('Error fetching models:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/models/refresh - Force refresh model list
  'POST /api/models/refresh': async (req, res) => {
    try {
      const { models, providers, total, fetchedAt } = await getModels(true);
      const formattedModels = models.map(m => formatModel(m));
      
      sendJSON(res, {
        models: formattedModels,
        providers,
        total,
        cached: false,
        fetchedAt
      });
    } catch (error) {
      console.error('Error refreshing models:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/config - Get current configuration
  'GET /api/config': async (req, res) => {
    try {
      let config = loadJsoncFile(CONFIG_FILE) || {};

      // Normalize agent keys in the config for consistent UI handling
      // Legacy keys like "Sisyphus" are mapped to canonical "sisyphus"
      if (config.agents) {
        const normalizedAgents = {};
        for (const [key, value] of Object.entries(config.agents)) {
          const normalizedKey = normalizeAgentKey(key);
          // Only use the first occurrence if there are duplicates after normalization
          if (!normalizedAgents[normalizedKey]) {
            normalizedAgents[normalizedKey] = value;
          }
        }
        config.agents = normalizedAgents;
      }

      sendJSON(res, {
        config,
        configFile: CONFIG_FILE,
        exists: fs.existsSync(CONFIG_FILE)
      });
    } catch (error) {
      console.error('Error loading config:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/providers - Get provider policies
  'GET /api/providers': async (req, res) => {
    try {
      const { getProviderPolicies } = require('./constants');
      const policiesData = getProviderPolicies();
      
      sendJSON(res, {
        providers: policiesData.providers,
        hasOverride: policiesData.hasOverride,
        overrideFile: policiesData.overrideFile
      });
    } catch (error) {
      console.error('Error loading provider policies:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/providers - Update provider policies
  'POST /api/providers': async (req, res) => {
    try {
      const body = await parseBody(req);
      const updates = body.providers || {};
      
      const {
        getProviderPolicies,
        invalidateProviderPoliciesCache,
        PROVIDER_POLICIES_OVERRIDE_FILE,
        normalizeProviderName
      } = require('./constants');
      
      const validBillingModels = new Set(['subscription', 'metered', 'free', 'unknown']);
      const validSpeedTiers = new Set(['fast', 'normal', 'slow', 'unknown']);
      const sanitizedUpdates = {};

      // Validate and sanitize updates
      for (const [providerId, policy] of Object.entries(updates)) {
        if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
          sendError(res, `Invalid policy for provider '${providerId}'`, 400);
          return;
        }

        const normalizedProviderId = normalizeProviderName(providerId);
        const nextPolicy = {};

        if (policy.billingModel !== undefined) {
          if (!validBillingModels.has(policy.billingModel)) {
            sendError(res, 'Invalid billingModel: must be one of subscription|metered|free|unknown', 400);
            return;
          }
          nextPolicy.billingModel = policy.billingModel;
        }

        if (policy.speedTier !== undefined) {
          if (!validSpeedTiers.has(policy.speedTier)) {
            sendError(res, 'Invalid speedTier: must be one of fast|normal|slow|unknown', 400);
            return;
          }
          nextPolicy.speedTier = policy.speedTier;
        }

        if (policy.notes !== undefined) {
          if (typeof policy.notes !== 'string') {
            sendError(res, 'Invalid notes: must be a string', 400);
            return;
          }
          nextPolicy.notes = policy.notes.slice(0, 120);
        }

        if (policy.priorityTier !== undefined) {
          const priority = parseInt(policy.priorityTier, 10);
          if (isNaN(priority) || priority < 1 || priority > 99) {
            sendError(res, 'Invalid priorityTier: must be an integer between 1 and 99', 400);
            return;
          }
          nextPolicy.priorityTier = priority;
        }

        sanitizedUpdates[normalizedProviderId] = {
          ...(sanitizedUpdates[normalizedProviderId] || {}),
          ...nextPolicy
        };
      }
      
      // Get current policies
      const currentData = getProviderPolicies();
      
      const mergedProviders = {};

      for (const [providerId, policy] of Object.entries(currentData.providers)) {
        mergedProviders[providerId] = {
          billingModel: policy.billingModel || 'unknown',
          speedTier: policy.speedTier || 'unknown',
          priorityTier: Number.isInteger(policy.priorityTier) ? policy.priorityTier : 99,
          notes: typeof policy.notes === 'string' ? policy.notes : ''
        };
      }
      
      // Apply updates
      for (const [providerId, policy] of Object.entries(sanitizedUpdates)) {
        mergedProviders[providerId] = {
          ...mergedProviders[providerId],
          ...policy
        };
      }
      
      // Save to override file using constant path
      const overrideFile = PROVIDER_POLICIES_OVERRIDE_FILE;
      
      const overrideData = {
        version: 1,
        updatedAt: new Date().toISOString(),
        providers: mergedProviders
      };
      
      fs.writeFileSync(overrideFile, JSON.stringify(overrideData, null, 2));
      
      invalidateProviderPoliciesCache();
      const refreshedPolicies = getProviderPolicies();
      sendJSON(res, {
        providers: refreshedPolicies.providers,
        hasOverride: refreshedPolicies.hasOverride,
        overrideFile: refreshedPolicies.overrideFile
      });
    } catch (error) {
      console.error('Error saving provider policies:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/providers/reset - Reset provider policies to defaults
  'POST /api/providers/reset': async (req, res) => {
    try {
      const { invalidateProviderPoliciesCache, PROVIDER_POLICIES_OVERRIDE_FILE } = require('./constants');
      
      if (fs.existsSync(PROVIDER_POLICIES_OVERRIDE_FILE)) {
        fs.unlinkSync(PROVIDER_POLICIES_OVERRIDE_FILE);
      }
      
      // Invalidate cache
      invalidateProviderPoliciesCache();
      
      sendJSON(res, {
        success: true,
        message: 'Provider policies reset to defaults'
      });
    } catch (error) {
      console.error('Error resetting provider policies:', error);
      sendError(res, error.message, 500);
    }
  },
  // GET /api/providers/diagnostics - Get provider diagnostics
  'GET /api/providers/diagnostics': async (req, res) => {
    try {
      const query = new URL(req.url, 'http://localhost').searchParams;
      const refresh = query.get('refresh') === 'true';
      
      const diagnostics = buildProviderDiagnostics({ refresh });
      
      sendJSON(res, diagnostics);
    } catch (error) {
      console.error('Error building provider diagnostics:', error);
      sendError(res, error.message, 500);
    }
  },
  // GET /api/profiles - List all profiles
  'GET /api/profiles': async (req, res) => {
    try {
      const profiles = [];
      
      if (fs.existsSync(CONFIGS_DIR)) {
        const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
          const profilePath = path.join(CONFIGS_DIR, file);
          try {
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            profiles.push({
              name: data.name || file.replace('.json', ''),
              description: data.description || '',
              modifiedAt: data.modified,
              agentCount: Object.keys(data.config?.agents || {}).length
            });
          } catch (e) {
            console.error(`Failed to load profile ${file}:`, e.message);
          }
        }
      }
      
      sendJSON(res, { profiles, total: profiles.length });
    } catch (error) {
      console.error('Error listing profiles:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/profiles/:name - Get single profile
  'GET /api/profiles/:name': async (req, res, name) => {
    try {
      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);
      
      if (!fs.existsSync(profilePath)) {
        sendError(res, 'Profile not found', 404);
        return;
      }
      
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      sendJSON(res, { profile: data });
    } catch (error) {
      console.error('Error loading profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/profiles/switch - Switch active profile
  'POST /api/profiles/switch': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name } = body;

      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);

      if (!fs.existsSync(profilePath)) {
        sendError(res, 'Profile not found', 404);
        return;
      }

      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

      await withWriteLock(async () => {
        const { createBackup } = require('./core/backup');
        const backup = await createBackup();

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(profileData.config, null, 2));
        fs.writeFileSync(ACTIVE_CONFIG_FILE, JSON.stringify({ active: name }, null, 2));

        sendJSON(res, {
          success: true,
          profile: name,
          backupCreated: backup.timestamp
        });
      });
    } catch (error) {
      console.error('Error switching profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/profiles - Create new profile
  'POST /api/profiles': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name, description, fromCurrent } = body;

      if (!name || !/^[a-zA-Z0-9-_]+$/.test(name)) {
        sendError(res, 'Invalid profile name', 400);
        return;
      }

      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);

      if (fs.existsSync(profilePath)) {
        sendError(res, 'Profile already exists', 409);
        return;
      }

      let config;
      if (fromCurrent && fs.existsSync(CONFIG_FILE)) {
        config = loadJsoncFile(CONFIG_FILE) || { agents: {} };
      } else {
        config = { agents: {} };
      }

      const now = new Date().toISOString();
      const profileData = {
        name,
        description: description || '',
        created: now,
        modified: now,
        config
      };

      await withWriteLock(async () => {
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
      });

      sendJSON(res, {
        success: true,
        profile: { name, description, modifiedAt: now }
      });
    } catch (error) {
      console.error('Error creating profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/profiles/:name/duplicate - Duplicate profile
  'POST /api/profiles/:name/duplicate': async (req, res, name) => {
    try {
      const body = await parseBody(req);
      const { newName } = body;

      const sourcePath = path.join(CONFIGS_DIR, `${name}.json`);
      const destPath = path.join(CONFIGS_DIR, `${newName}.json`);

      if (!fs.existsSync(sourcePath)) {
        sendError(res, 'Source profile not found', 404);
        return;
      }

      if (fs.existsSync(destPath)) {
        sendError(res, 'Destination profile already exists', 409);
        return;
      }

      const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
      const now = new Date().toISOString();

      const newProfile = {
        name: newName,
        description: sourceData.description ? `Copy of ${sourceData.description}` : `Copy of ${name}`,
        created: now,
        modified: now,
        config: sourceData.config
      };

      await withWriteLock(async () => {
        fs.writeFileSync(destPath, JSON.stringify(newProfile, null, 2));
      });

      sendJSON(res, { success: true, newProfile: newName });
    } catch (error) {
      console.error('Error duplicating profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // DELETE /api/profiles/:name - Delete profile
  'DELETE /api/profiles/:name': async (req, res, name) => {
    try {
      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);

      if (!fs.existsSync(profilePath)) {
        sendError(res, 'Profile not found', 404);
        return;
      }

      await withWriteLock(async () => {
        fs.unlinkSync(profilePath);
      });

      sendJSON(res, { success: true, deleted: name });
    } catch (error) {
      console.error('Error deleting profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/profiles/:name/export - Export profile
  'GET /api/profiles/:name/export': async (req, res, name) => {
    try {
      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);
      
      if (!fs.existsSync(profilePath)) {
        sendError(res, 'Profile not found', 404);
        return;
      }
      
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      sendJSON(res, data);
    } catch (error) {
      console.error('Error exporting profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/profiles/import - Import profile
  'POST /api/profiles/import': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name, description, config } = body;

      if (!name || !/^[a-zA-Z0-9-_]+$/.test(name)) {
        sendError(res, 'Invalid profile name', 400);
        return;
      }

      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);

      if (fs.existsSync(profilePath)) {
        sendError(res, 'Profile already exists', 409);
        return;
      }

      const now = new Date().toISOString();
      const profileData = {
        name,
        description: description || 'Imported profile',
        created: now,
        modified: now,
        config
      };

      await withWriteLock(async () => {
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
      });

      sendJSON(res, { success: true, profile: { name, description, modifiedAt: now } });
    } catch (error) {
      console.error('Error importing profile:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/profiles/import-active - Import currently active config as new profile
  'POST /api/profiles/import-active': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name, description } = body;

      if (!name || !/^[a-zA-Z0-9-_]+$/.test(name)) {
        sendError(res, 'Invalid profile name', 400);
        return;
      }

      const profilePath = path.join(CONFIGS_DIR, `${name}.json`);

      if (fs.existsSync(profilePath)) {
        sendError(res, 'Profile already exists', 409);
        return;
      }

      if (!fs.existsSync(CONFIG_FILE)) {
        sendError(res, 'No active configuration found', 404);
        return;
      }

      const activeConfig = loadJsoncFile(CONFIG_FILE);

      const now = new Date().toISOString();
      const profileData = {
        name,
        description: description || 'Imported from active configuration',
        created: now,
        modified: now,
        config: activeConfig
      };

      await withWriteLock(async () => {
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
      });

      sendJSON(res, { success: true, profile: { name, description, modifiedAt: now } });
    } catch (error) {
      console.error('Error importing active config:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/config - Save current configuration
  'POST /api/config': async (req, res) => {
    try {
      const body = await parseBody(req);

      if (body.agents) {
        const normalizedAgents = {};
        for (const [key, value] of Object.entries(body.agents)) {
          const normalizedKey = normalizeAgentKey(key);
          normalizedAgents[normalizedKey] = value;
        }
        body.agents = normalizedAgents;
      }

      await withWriteLock(async () => {
        const { createBackup } = require('./core/backup');
        const backup = await createBackup();

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(body, null, 2));

        const activeProfile = getActiveProfile();
        if (activeProfile) {
          const profilePath = path.join(CONFIGS_DIR, `${activeProfile}.json`);
          if (fs.existsSync(profilePath)) {
            const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            profileData.config = body;
            profileData.modified = new Date().toISOString();
            fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
          }
        }

        sendJSON(res, {
          success: true,
          backupCreated: backup.timestamp
        });
      });
    } catch (error) {
      console.error('Error saving config:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/agents - List all agents with documentation
  'GET /api/agents': async (req, res) => {
    try {
      const { getAllAgentDocumentation } = require('./core/agents');
      const { getModels, formatModel } = require('./core/models');

      const { models } = await getModels();
      // Format models for scoring (agents.js expects formatted shape with context, hasThinking, costDisplay)
      const formattedModels = models.map(m => formatModel(m));
      const agents = await getAllAgentDocumentation(formattedModels);

      sendJSON(res, {
        agents: agents.map(agent => {
          // Normalize agent name for profile lookup
          const normalizedName = normalizeAgentKey(agent.name);
          const profile = AGENT_PROFILES[normalizedName] || null;
          const access = (profile && profile.access) ? profile.access : (agent.access || 'unknown');

          const recommendedModels = appendAlternativeProviders((agent.recommendedModels || [])
            .filter(rec => rec.provenance !== 'gating-failed')
            .map(rec => ({
              id: rec.id,
              name: rec.name,
              score: rec.score,
              provider: rec.provider,
              variant: rec.variant,
              provenance: rec.provenance,
              discouragedReason: rec.discouragedReason,
              discouragedSeverity: rec.discouragedSeverity
            })), models);

          const gatingFailures = (agent.recommendedModels || [])
            .filter(rec => rec.provenance === 'gating-failed' && rec.warnings);
          const recommendationWarnings = gatingFailures
            .flatMap(rec => rec.warnings.map(w => w.message || w));

          return {
            name: normalizedName, // Return canonical name
            displayName: agent.displayName || agent.name,
            description: agent.description,
            summary: profile ? profile.description : agent.description,
            identity: agent.role && agent.role.identity ? agent.role.identity : '',
            access,
            usage: profile && Array.isArray(profile.usage) ? profile.usage : [],
            caveats: profile && Array.isArray(profile.caveats) ? profile.caveats : [],
            preferred: profile && Array.isArray(profile.preferred) ? profile.preferred : [],
            category: agent.category,
            cost: agent.cost,
            capabilities: agent.capabilities,
            minContext: profile && profile.minContext ? profile.minContext : agent.minContext,
            thinking: agent.thinking,
            fallbackChain: agent.fallbackChain,
            recommendedModel: agent.recommendedModel,
            recommendedModels,
            recommendationWarnings: recommendationWarnings.length > 0 ? recommendationWarnings : undefined
          };
        }),
        total: agents.length,
        cached: true
      });
    } catch (error) {
      console.error('Error listing agents:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/agents/:name - Get single agent documentation
  'GET /api/agents/:name': async (req, res, name) => {
    try {
      const { getAgentDocumentation } = require('./core/agents');
      const { getModels, formatModel } = require('./core/models');

      // Normalize the agent name for lookup
      const normalizedName = normalizeAgentKey(name);

      const { models } = await getModels();
      // Format models for scoring (agents.js expects formatted shape with context, hasThinking, costDisplay)
      const formattedModels = models.map(m => formatModel(m));
      const agent = await getAgentDocumentation(normalizedName, formattedModels);

      const profile = AGENT_PROFILES[normalizedName] || null;
      const access = (profile && profile.access) ? profile.access : (agent.access || 'unknown');

      const recommendedModels = appendAlternativeProviders((agent.recommendedModels || [])
        .filter(rec => rec.provenance !== 'gating-failed')
        .map(rec => ({
          id: rec.id,
          name: rec.name,
          score: rec.score,
          provider: rec.provider,
          variant: rec.variant,
          provenance: rec.provenance,
          discouragedReason: rec.discouragedReason,
          discouragedSeverity: rec.discouragedSeverity
        })), models);

      const gatingFailures = (agent.recommendedModels || [])
        .filter(rec => rec.provenance === 'gating-failed' && rec.warnings);
      const recommendationWarnings = gatingFailures
        .flatMap(rec => rec.warnings.map(w => w.message || w));
      // Get effective fallback chain (from AGENT_MODEL_REQUIREMENTS + overrides)
      const overrides = getAgentFallbackOverrides();
      const effectiveFallbackChain = getEffectiveFallbackChain(normalizedName, overrides);
      sendJSON(res, {
        agent: {
          name: normalizedName,
          displayName: agent.displayName || agent.name,
          description: agent.description,
          summary: profile ? profile.description : agent.description,
          identity: agent.role && agent.role.identity ? agent.role.identity : '',
          access,
          usage: profile && Array.isArray(profile.usage) ? profile.usage : [],
          caveats: profile && Array.isArray(profile.caveats) ? profile.caveats : [],
          preferred: profile && Array.isArray(profile.preferred) ? profile.preferred : [],
          category: agent.category,
          cost: agent.cost,
          capabilities: agent.capabilities,
          minContext: profile && profile.minContext ? profile.minContext : agent.minContext,
          thinking: agent.thinking,
          fallbackChain: effectiveFallbackChain || [],
          toolAccess: agent.toolAccess,
          role: agent.role,
          behaviors: agent.behaviors,
          recommendedModel: agent.recommendedModel,
          recommendedModels,
          recommendationWarnings: recommendationWarnings.length > 0 ? recommendationWarnings : undefined,
          rawPrompt: agent.rawPrompt
        }
      });
    } catch (error) {
      console.error('Error getting agent:', error);
      sendError(res, error.message, 404);
    }
  },

  // POST /api/agents/refresh - Refresh agent cache from GitHub
  'POST /api/agents/refresh': async (req, res) => {
    try {
      const { refreshAgentCache } = require('./core/agents');
      const result = await refreshAgentCache();
      
      sendJSON(res, {
        success: true,
        updated: result.updated,
        failed: result.failed,
        total: result.total
      });
    } catch (error) {
      console.error('Error refreshing agents:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/agents/discover - Check for new agents
  'GET /api/agents/discover': async (req, res) => {
    try {
      const { discoverNewAgents, getAllCachedAgents } = require('./core/agents');
      
      const cached = getAllCachedAgents();
      const newAgents = await discoverNewAgents(cached);
      
      sendJSON(res, {
        newAgents: newAgents.map(agent => {
          const normalizedName = normalizeAgentKey(agent.name);
          const isProfiled = !!AGENT_PROFILES[normalizedName];
          return {
            name: agent.name,
            description: agent.description,
            category: agent.category,
            cost: agent.cost,
            isProfiled
          };
        }),
        totalAgents: cached.length,
        hasNew: newAgents.length > 0
      });
    } catch (error) {
      console.error('Error discovering agents:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/agents/:name/fallbacks - Get effective fallback chain for an agent
  'GET /api/agents/:name/fallbacks': async (req, res, name) => {
    try {
      // Normalize the agent name for lookup
      const normalizedName = normalizeAgentKey(name);
      
      // Check if agent is known (exists in AGENT_PROFILES)
      if (!AGENT_PROFILES[normalizedName]) {
        sendError(res, `Unknown agent: ${name}`, 404);
        return;
      }
      
      // Get current overrides
      const overrides = getAgentFallbackOverrides();
      
      // Check if this agent has an override
      const hasOverride = overrides.agents && overrides.agents[normalizedName];
      
      // Get effective fallback chain
      const fallbackChain = getEffectiveFallbackChain(normalizedName, overrides);
      
      sendJSON(res, {
        agent: normalizedName,
        source: hasOverride ? 'override' : 'upstream',
        fallbackChain: fallbackChain || []
      });
    } catch (error) {
      console.error('Error getting agent fallbacks:', error);
      sendError(res, error.message, 500);
    }
  },

  // PUT /api/agents/:name/fallbacks - Update fallback override for an agent
  'PUT /api/agents/:name/fallbacks': async (req, res, name) => {
    try {
      // Normalize the agent name for lookup
      const normalizedName = normalizeAgentKey(name);
      
      // Check if agent is known (exists in AGENT_PROFILES)
      if (!AGENT_PROFILES[normalizedName]) {
        sendError(res, `Unknown agent: ${name}`, 404);
        return;
      }
      
      // Parse request body
      const body = await parseBody(req);
      
      // Validate payload structure
      if (!body || typeof body !== 'object') {
        sendError(res, 'Request body must be a JSON object', 400);
        return;
      }
      
      if (!Array.isArray(body.fallbackChain)) {
        sendError(res, 'fallbackChain must be an array', 400);
        return;
      }
      
      // Validate fallback chain
      const validation = validateFallbackChain(body.fallbackChain);
      if (!validation.valid) {
        sendError(res, validation.errors.join('; '), 400);
        return;
      }
      
      // Get current overrides
      const currentOverrides = getAgentFallbackOverrides();
      
      // Update the agent's fallback chain
      const updatedAgents = {
        ...currentOverrides.agents,
        [normalizedName]: {
          fallbackChain: body.fallbackChain
        }
      };
      
      // Save the updated overrides
      const saveResult = saveAgentFallbackOverrides({
        version: 1,
        agents: updatedAgents
      });
      
      if (!saveResult.success) {
        sendError(res, saveResult.error || 'Failed to save overrides', 500);
        return;
      }
      
      // Get the effective chain (should now be the override)
      const overrides = getAgentFallbackOverrides();
      const fallbackChain = getEffectiveFallbackChain(normalizedName, overrides);
      
      sendJSON(res, {
        agent: normalizedName,
        source: 'override',
        fallbackChain: fallbackChain || []
      });
    } catch (error) {
      console.error('Error updating agent fallbacks:', error);
      sendError(res, error.message, 500);
    }
  },

  // DELETE /api/agents/:name/fallbacks - Reset fallback override for an agent
  'DELETE /api/agents/:name/fallbacks': async (req, res, name) => {
    try {
      // Normalize the agent name for lookup
      const normalizedName = normalizeAgentKey(name);
      
      // Check if agent is known (exists in AGENT_PROFILES)
      if (!AGENT_PROFILES[normalizedName]) {
        sendError(res, `Unknown agent: ${name}`, 404);
        return;
      }
      
      // Reset the override for this agent
      const resetResult = resetAgentFallbackOverride(normalizedName);
      
      if (!resetResult.success) {
        sendError(res, resetResult.error || 'Failed to reset override', 500);
        return;
      }
      
      // Get the effective chain (should now be upstream)
      const overrides = getAgentFallbackOverrides();
      const fallbackChain = getEffectiveFallbackChain(normalizedName, overrides);
      
      sendJSON(res, {
        agent: normalizedName,
        source: 'upstream',
        fallbackChain: fallbackChain || []
      });
    } catch (error) {
      console.error('Error resetting agent fallbacks:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/models/compare/:modelId - Compare providers for a model
  'GET /api/models/:modelId/compare': async (req, res, modelId) => {
    try {
      const { getModels, findDuplicateModels, rankProvider } = require('./core/models');
      const { models } = await getModels();
      
      // Find all variants of this model
      const duplicates = findDuplicateModels(models);
      let targetModel = null;
      let allVariants = [];
      
      // Find the model and its duplicates
      for (const [key, dupModels] of Object.entries(duplicates)) {
        const found = dupModels.find(m => m.id === modelId || m.modelID === modelId);
        if (found) {
          targetModel = found;
          allVariants = dupModels;
          break;
        }
      }
      
      if (!targetModel) {
        // Try to find the model directly (no duplicates)
        targetModel = models.find(m => m.id === modelId || m.modelID === modelId);
        if (!targetModel) {
          sendError(res, 'Model not found', 404);
          return;
        }
        allVariants = [targetModel];
      }
      
      // Rank all variants
      const ranked = allVariants.map(m => {
        const provider = m.providerID || m.id.split('/')[0];
        const cost = m.cost ? (m.cost.input || 0) + (m.cost.output || 0) : 0;
        return {
          model: formatModel(m),
          provider,
          score: rankProvider(provider, m),
          cost,
          context: m.limit?.context || 0,
          isBest: false
        };
      });
      
      // Sort by score (lower is better)
      ranked.sort((a, b) => a.score - b.score);
      
      // Mark the best one
      if (ranked.length > 0) {
        ranked[0].isBest = true;
        ranked[0].recommendation = 'Recommended - Best overall value';
      }
      
      // Add recommendations for others
      if (ranked.length > 1) {
        // Lowest cost
        const cheapest = ranked.reduce((min, curr) => curr.cost < min.cost ? curr : min, ranked[0]);
        if (!cheapest.isBest && cheapest.cost < ranked[0].cost) {
          cheapest.recommendation = 'Cheapest option';
        }
        
        // Largest context
        const largest = ranked.reduce((max, curr) => curr.context > max.context ? curr : max, ranked[0]);
        if (!largest.isBest && largest.context > ranked[0].context) {
          largest.recommendation = 'Largest context window';
        }
      }
      
      sendJSON(res, {
        modelId,
        modelName: targetModel.name || targetModel.id,
        variants: ranked,
        totalVariants: ranked.length,
        bestProvider: ranked[0]?.provider || null
      });
    } catch (error) {
      console.error('Error comparing model providers:', error);
      sendError(res, error.message, 500);
    }
  },

  // GET /api/backups - List all backups
  'GET /api/backups': async (req, res) => {
    try {
      const backups = listBackups();
      sendJSON(res, { backups, total: backups.length });
    } catch (error) {
      console.error('Error listing backups:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/backups - Create a new backup
  'POST /api/backups': async (req, res) => {
    try {
      const backup = await withWriteLock(async () => {
        return await createBackup();
      });
      sendJSON(res, { success: true, backup });
    } catch (error) {
      console.error('Error creating backup:', error);
      sendError(res, error.message, 500);
    }
  },

  // POST /api/backups/:timestamp/restore - Restore from a backup
  'POST /api/backups/:timestamp/restore': async (req, res, timestamp) => {
    try {
      const result = await withWriteLock(async () => {
        return await restoreBackup(timestamp);
      });
      sendJSON(res, { success: true, restored: result });
    } catch (error) {
      console.error('Error restoring backup:', error);
      if (error.message.includes('not found')) {
        sendError(res, error.message, 404);
      } else {
        sendError(res, error.message, 500);
      }
    }
  },

  // DELETE /api/backups/:timestamp - Delete a backup
  'DELETE /api/backups/:timestamp': async (req, res, timestamp) => {
    try {
      const result = await withWriteLock(async () => {
        return deleteBackup(timestamp);
      });
      sendJSON(res, { success: true, deleted: result });
    } catch (error) {
      console.error('Error deleting backup:', error);
      if (error.message.includes('not found')) {
        sendError(res, error.message, 404);
      } else {
        sendError(res, error.message, 500);
      }
    }
  },

  // POST /api/backups/purge - Purge old backups
  'POST /api/backups/purge': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { keepNewest, keepDays, dryRun } = body;

      const result = await withWriteLock(async () => {
        return purgeBackups({ keepNewest, keepDays, dryRun });
      });

      sendJSON(res, {
        success: true,
        dryRun: result.dryRun,
        kept: result.kept,
        purged: result.purged || result.wouldPurge
      });
    } catch (error) {
      console.error('Error purging backups:', error);
      sendError(res, error.message, 500);
    }
  }
};

/**
 * Match request to route handler
 * Returns { handler, params } or null
 */
function matchRoute(method, pathname) {
  const routeKey = `${method} ${pathname}`;
  
  // Exact match
  if (routes[routeKey]) {
    return { handler: routes[routeKey], params: [] };
  }
  
  // Parameterized routes (simple implementation)
  // e.g., GET /api/agents/:name
  const routePatterns = Object.keys(routes);
  for (const pattern of routePatterns) {
    const [routeMethod, routePath] = pattern.split(' ');
    if (routeMethod !== method) continue;
    
    // Convert pattern to regex
    // /api/agents/:name -> /api/agents/([^/]+)
    const paramNames = [];
    const regexPattern = routePath.replace(/:([^/]+)/g, (match, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const patternRegex = new RegExp('^' + regexPattern + '$');
    
    const match = pathname.match(patternRegex);
    if (match) {
      // Extract and decode parameter values
      const rawParams = match.slice(1);
      const decodedParams = [];
      
      for (const param of rawParams) {
        try {
          // Decode URL-encoded parameter values
          decodedParams.push(decodeURIComponent(param));
        } catch (e) {
          // Return error if parameter decoding fails
          return { error: 'Invalid URL encoding' };
        }
      }
      
      return { handler: routes[pattern], params: decodedParams };
    }
  }
  
  return null;
}

/**
 * Serve static file
 */
function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
      return;
    }
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    });
    res.end(data);
  });
}

/**
 * Main request handler
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // Validate host header for local-only access (defense-in-depth)
  const host = req.headers.host || '';
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];
  // Handle IPv6 with port ([::1]:3456) vs without ([::1] or ::1)
  let hostWithoutPort = host;
  if (host.startsWith('[')) {
    // IPv6 format: [::1] or [::1]:3456
    const bracketEnd = host.indexOf(']');
    if (bracketEnd !== -1) {
      hostWithoutPort = host.slice(1, bracketEnd);
    }
  } else if (host.includes(':')) {
    // Could be IPv4 with port (127.0.0.1:3456) or bare IPv6 (::1)
    // Check if it's IPv6 by counting colons (IPv6 has multiple, IPv4 has one before port)
    const colonCount = host.split(':').length - 1;
    if (colonCount === 1) {
      // IPv4 with port
      hostWithoutPort = host.split(':')[0];
    }
    // If colonCount > 1, it's bare IPv6 like ::1, keep as-is
  }
  if (!allowedHosts.includes(hostWithoutPort) && process.env.OMO_ALLOW_EXTERNAL_HOST !== '1') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied. This tool is for localhost use only.' }));
    return;
  }

  // CORS preflight - same-origin only, no wildcard
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API routes
  if (pathname.startsWith('/api/')) {
    const match = matchRoute(req.method, pathname);
    if (match) {
      // Check for parameter decoding error
      if (match.error) {
        sendError(res, match.error, 400);
        return;
      }
      
      try {
        await match.handler(req, res, ...match.params);
      } catch (error) {
        console.error('Route handler error:', error);
        sendError(res, error.message, 500);
      }
    } else {
      sendError(res, 'Not found', 404);
    }
    return;
  }
  
  // Static files
  let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Default to index.html for SPA routes
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(WEB_DIR, 'index.html');
  }
  
  serveStaticFile(res, filePath);
}

/**
 * Find available port
 */
async function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    function tryPort(port) {
      if (port > startPort + MAX_PORT_ATTEMPTS) {
        reject(new Error(`Could not find available port after ${MAX_PORT_ATTEMPTS} attempts`));
        return;
      }

      const onError = (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} in use, trying ${port + 1}...`);
          // Remove the listening listener for this failed port before trying next
          server.removeListener('listening', onListening);
          tryPort(port + 1);
        } else {
          reject(err);
        }
      };

      const onListening = () => {
        server.close(() => resolve(port));
      };

      server.once('error', onError);
      server.once('listening', onListening);

      server.listen(port, '127.0.0.1');
    }

    tryPort(startPort);
  });
}

/**
 * Start the HTTP server
 */
async function startServer() {
  // Check for explicit port override from environment
  const explicitPort = process.env.OMO_PORT ? parseInt(process.env.OMO_PORT, 10) : null;
  let port;

  if (explicitPort && !isNaN(explicitPort)) {
    // Use explicit port, skip probing
    port = explicitPort;
    console.log(`Using explicit port from OMO_PORT: ${port}`);
  } else {
    // Use port probing
    port = await findAvailablePort(DEFAULT_PORT);
  }
  
  const server = http.createServer(handleRequest);
  
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n🚀 OmO Agent Config server running at http://localhost:${port}\n`);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down server...');
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
  
  return { port, server };
}

/**
 * Open browser automatically
 */
function openBrowser(url) {
  const platform = process.platform;
  let command;
  
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log(`Could not open browser automatically.`);
      console.log(`Please open: ${url}`);
    }
  });
}

module.exports = {
  startServer,
  openBrowser,
  findAvailablePort,
  handleRequest
};

// If run directly (for testing)
if (require.main === module) {
  startServer().then(({ port }) => {
    const url = `http://localhost:${port}`;
    console.log(`Opening browser...`);
    openBrowser(url);
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
