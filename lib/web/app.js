/**
 * OmO Agent Config - Frontend Application
 * Phase 2: Enhanced Model Browser with Filtering
 */

// Global state
const state = {
    models: [],
    providers: [],
    profiles: [],
    currentProfile: null,
    currentConfig: null,
    savedConfig: null,
    pendingSaveChanges: [],
    agentDocs: [],
    agentDocsByName: {},
    isLoading: false,
    unsavedChanges: false,
    providerDiagnostics: null
};

// DOM Elements
const elements = {
    agentsGrid: document.getElementById('agents-grid'),
    saveBtn: document.getElementById('save-btn'),
    undoBtn: document.getElementById('undo-btn'),
    profileSelect: document.getElementById('profile-select'),
    statusBar: document.getElementById('status-bar'),
    lastUpdated: document.getElementById('last-updated'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalClose: document.querySelector('.modal-close')
};

function init() {
    setupEventListeners();
    loadData();
}

function setupEventListeners() {
    elements.saveBtn.addEventListener('click', saveConfiguration);
    elements.undoBtn.addEventListener('click', undoLastChange);
    elements.profileSelect.addEventListener('change', switchProfile);
    
    const manageProfilesBtn = document.getElementById('manage-profiles-btn');
    if (manageProfilesBtn) {
        manageProfilesBtn.addEventListener('click', openProfileManagement);
    }
    
    const providerPoliciesBtn = document.getElementById('provider-policies-btn');
    if (providerPoliciesBtn) {
        providerPoliciesBtn.addEventListener('click', openProviderPolicies);
    }

    const providerDiagnosticsBtn = document.getElementById('provider-diagnostics-btn');
    if (providerDiagnosticsBtn) {
        providerDiagnosticsBtn.addEventListener('click', openProviderDiagnostics);
    }

    // Diagnostics Banner "View Details" button
    const diagnosticsBanner = document.getElementById('provider-diagnostics-banner');
    if (diagnosticsBanner) {
        const viewDetailsBtn = diagnosticsBanner.querySelector('.view-details-btn');
        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', showProviderDiagnosticsModal);
        }
    }

    elements.modalClose.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (state.unsavedChanges) saveConfiguration();
        }
    });
}

function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Normalize fallback_models to an ordered array of unique strings
 * Matches backend logic in lib/core/fallback-models.js
 */
function normalizeFallbackModels(input) {
    if (!input) return [];
    if (typeof input === 'string') {
        input = [input];
    }
    if (!Array.isArray(input)) return [];

    const seen = new Set();
    const result = [];

    for (const entry of input) {
        if (typeof entry !== 'string') continue;
        const trimmed = entry.trim();
        if (trimmed.length === 0) continue;
        // Basic provider/model format check
        if (trimmed.indexOf('/') <= 0 || trimmed.indexOf('/') === trimmed.length - 1) continue;
        if (!seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result;
}

/**
 * Calculate the difference between two fallback arrays
 * Returns object with changes: { reordered, added, removed, hasChanges }
 */
function calculateFallbackDiff(oldFallback, newFallback) {
    const oldArr = normalizeFallbackModels(oldFallback);
    const newArr = normalizeFallbackModels(newFallback);

    const result = {
        reordered: false,
        oldOrder: oldArr,
        newOrder: newArr,
        added: [],
        removed: [],
        hasChanges: false
    };

    // Check for additions
    for (const model of newArr) {
        if (!oldArr.includes(model)) {
            result.added.push(model);
        }
    }

    // Check for removals
    for (const model of oldArr) {
        if (!newArr.includes(model)) {
            result.removed.push(model);
        }
    }

    // Check for reorder (same elements, different order)
    if (result.added.length === 0 && result.removed.length === 0 && oldArr.length === newArr.length) {
        for (let i = 0; i < oldArr.length; i++) {
            if (oldArr[i] !== newArr[i]) {
                result.reordered = true;
                break;
            }
        }
    }

    result.hasChanges = result.added.length > 0 || result.removed.length > 0 || result.reordered;
    return result;
}

/**
 * Format fallback changes for display in the save review modal
 * @param {Object} fallbackDiff - Diff object from calculateFallbackDiff
 * @returns {string} Formatted HTML description of changes
 */
function formatFallbackChangeDisplay(fallbackDiff) {
    if (!fallbackDiff || !fallbackDiff.hasChanges) {
        return '';
    }

    const parts = [];

    if (fallbackDiff.added && fallbackDiff.added.length > 0) {
        const addedList = fallbackDiff.added.map(m => '<code>' + m + '</code>').join(', ');
        parts.push('<span class="fallback-added">+ Added: ' + addedList + '</span>');
    }

    if (fallbackDiff.removed && fallbackDiff.removed.length > 0) {
        const removedList = fallbackDiff.removed.map(m => '<code>' + m + '</code>').join(', ');
        parts.push('<span class="fallback-removed">- Removed: ' + removedList + '</span>');
    }

    if (fallbackDiff.reordered) {
        parts.push('<span class="fallback-reordered">↻ Reordered priority</span>');
    }

    return '<small>Fallback changes: ' + parts.join(' • ') + '</small>';
}


async function loadData() {
    setLoading(true, 'Loading models and profiles...');
    
    try {
        await Promise.all([
            loadModels(),
            loadProfiles(),
            loadCurrentConfig()
        ]);
        
        // Render initial view (agents is default)
        renderAgentConfigView();

        // Load provider diagnostics non-blocking after initial render
        loadProviderDiagnostics().catch(err => {
            console.warn('Provider diagnostics failed (non-critical):', err);
        });
    } catch (error) {
        console.error('Error loading initial data:', error);
        updateStatus('Error loading data. Please refresh.', 'error');
    } finally {
        setLoading(false);
    }
}

async function loadModels(forceRefresh = false) {
    try {
        let url = '/api/models';
        if (forceRefresh) url += '?refresh=true';
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        state.models = data.models || [];
        state.providers = data.providers || [];
        
        const statusMsg = 'Loaded ' + data.total + ' models' + (data.cached ? ' (from cache)' : '');
        updateStatus(statusMsg);
        elements.lastUpdated.textContent = 'Updated: ' + new Date(data.fetchedAt).toLocaleTimeString();
    } catch (error) {
        console.error('Failed to load models:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}



async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();
        
        state.profiles = data.profiles || [];
        
        const currentValue = elements.profileSelect.value;
        elements.profileSelect.innerHTML = state.profiles.map(p => 
            '<option value="' + p.name + '"' + (p.isActive ? ' selected' : '') + '>' + p.name + '</option>'
        ).join('');
        
        if (currentValue) elements.profileSelect.value = currentValue;
    } catch (error) {
        console.error('Failed to load profiles:', error);
    }
}

async function loadCurrentConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        state.currentConfig = data.config || { agents: {} };
        state.savedConfig = cloneConfig(state.currentConfig);
        syncUnsavedState();

    } catch (error) {
        console.error('Failed to load config:', error);
        state.currentConfig = { agents: {} };
        state.savedConfig = cloneConfig(state.currentConfig);
        syncUnsavedState();
    }
}

function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config || { agents: {} }));
}

function normalizeModelId(modelId) {
    return modelId || 'none';
}

function findModelByIdFlexible(modelId) {
    if (!modelId || !state.models || state.models.length === 0) return null;

    let model = state.models.find(m => m.id === modelId || m.modelID === modelId);
    if (model) return model;

    const modelIdSuffix = modelId.split('/').pop().toLowerCase();

    model = state.models.find(m => {
        const mIdSuffix = m.id.split('/').pop().toLowerCase();
        return mIdSuffix === modelIdSuffix;
    });
    if (model) return model;

    let bestMatch = null;
    let bestMatchLength = 0;
    state.models.forEach(m => {
        const mIdSuffix = m.id.split('/').pop().toLowerCase();
        if (mIdSuffix.includes(modelIdSuffix) || modelIdSuffix.includes(mIdSuffix)) {
            if (mIdSuffix.length > bestMatchLength) {
                bestMatch = m;
                bestMatchLength = mIdSuffix.length;
            }
        }
    });

    return bestMatch;
}

function getModelDisplay(modelId) {
    if (!modelId) return 'none';
    const model = findModelByIdFlexible(modelId);
    if (!model) return modelId;

    return (model.name || model.id) + ' (' + model.provider + ')';
}

function getSavedAssignmentsSummary() {
    if (!state.savedConfig || !state.savedConfig.agents) return {};

    const summary = {};
    Object.entries(state.savedConfig.agents).forEach(([agent, config]) => {
        summary[agent] = {
            model: config.model || 'none',
            fallback_models: normalizeFallbackModels(config.fallback_models)
        };
    });
    return summary;
}

function getPendingModelChanges() {
    const savedAssignments = getSavedAssignmentsSummary();
    const currentAssignments = getCurrentAssignmentsSummary();
    const diff = calculateDiff(savedAssignments, currentAssignments);

    return diff.map(change => {
        const fromModelId = change.type === 'added' ? null : change.from;
        const toModelId = change.type === 'removed' ? null : change.to;

        const result = {
            agent: change.agent,
            type: change.type,
            fromModelId,
            toModelId,
            fromDisplay: getModelDisplay(fromModelId),
            toDisplay: getModelDisplay(toModelId)
        };

        if (change.fallbackDiff && change.fallbackDiff.hasChanges) {
            result.fallbackDiff = change.fallbackDiff;
        }

        return result;
    });
}

function syncUnsavedState() {
    const pendingCount = getPendingModelChanges().length;
    state.unsavedChanges = pendingCount > 0;
    elements.saveBtn.disabled = !state.unsavedChanges;
    
    if (pendingCount > 0) {
        elements.saveBtn.textContent = '💾 Save Changes (' + pendingCount + ')';
    } else {
        elements.saveBtn.textContent = '💾 Save Changes';
    }
}







function renderCostBadge(model) {
    if (!model.costDisplay) return '';
    const costClass = model.costDisplay.indexOf('$$$$') !== -1 ? 'expensive' : 
                     model.costDisplay.indexOf('$$') !== -1 ? 'moderate' : 'cheap';
    return '<span class="badge cost-' + costClass + '">' + model.costDisplay + '</span>';
}

function renderBillingBadge(model) {
    const bm = model.billingModel;
    if (!bm || bm === 'unknown') return '';
    const labels = {
        'subscription': { text: 'SUB', cls: 'billing-sub', title: 'Subscription-based pricing' },
        'metered': { text: 'PAY', cls: 'billing-pay', title: 'Pay-per-use (metered)' },
        'free': { text: 'FREE', cls: 'billing-free', title: 'Free to use' }
    };
    const info = labels[bm];
    if (!info) return '';
    return '<span class="badge ' + info.cls + '" title="' + info.title + '">' + info.text + '</span>';
}

function renderSpeedBadge(model) {
    const st = model.speedTier;
    if (!st || st !== 'fast') return '';
    return '<span class="badge speed-fast" title="Fast inference">\u26a1</span>';
}

function getAgentsUsingModel(modelId) {
    if (!state.currentConfig || !state.currentConfig.agents) return [];
    
    return Object.entries(state.currentConfig.agents)
        .filter(function([agent, config]) { return config.model === modelId; })
        .map(function([agent]) { return agent; });
}

async function renderAgentConfigView() {
    if (!state.currentConfig || !state.currentConfig.agents) {
        elements.agentsGrid.innerHTML = '<div class="no-results"><h3>No agents configured</h3><p>Load a profile to see agents</p></div>';
        return;
    }
    
    const agents = Object.keys(state.currentConfig.agents);
    
    if (agents.length === 0) {
        elements.agentsGrid.innerHTML = '<div class="no-results"><h3>No agents configured</h3><p>Load a profile to see agents</p></div>';
        return;
    }
    
    // Show loading state
    elements.agentsGrid.innerHTML = '<div class="no-results"><span class="loading">Loading agent details...</span></div>';
    
    try {
        // Fetch agent documentation
        const response = await fetch('/api/agents');
        const data = await response.json();
        const agentDocs = data.agents || [];
        state.agentDocs = agentDocs;
        state.agentDocsByName = {};
        agentDocs.forEach(a => { state.agentDocsByName[a.name] = a; });
        
        elements.agentsGrid.innerHTML = agents.map(agentName => {
            const agentConfig = state.currentConfig.agents[agentName];
            const currentModelId = agentConfig.model;
            const savedModelId = state.savedConfig && state.savedConfig.agents && state.savedConfig.agents[agentName]
                ? state.savedConfig.agents[agentName].model
                : null;
            const hasPendingChange = normalizeModelId(savedModelId) !== normalizeModelId(currentModelId);
            const currentModel = findModelByIdFlexible(currentModelId);
            
            const agentInfo = state.agentDocsByName[agentName];
            
            let html = '<div class="agent-config-card' + (hasPendingChange ? ' pending-change' : '') + '" data-agent-name="' + agentName + '">';
            
            // Header
            html += '<div class="agent-config-header">';
            html += '<div class="agent-config-title">';
            html += '<span class="agent-config-name">' + (agentInfo ? (agentInfo.displayName || agentName) : agentName) + '</span>';
            if (agentInfo) {
                html += '<span class="agent-config-category">' + (agentInfo.category || 'utility') + '</span>';
                if (agentInfo.cost) {
                    html += '<span class="agent-config-cost ' + String(agentInfo.cost).toLowerCase() + '">' + agentInfo.cost + '</span>';
                }
                if (agentInfo.access) {
                    html += '<span class="agent-config-access ' + String(agentInfo.access).replace(/[^a-z0-9-]/gi, '').toLowerCase() + '">' + agentInfo.access + '</span>';
                }
            }
            html += '</div>';
            html += '</div>';
            
            // Current model
            html += '<div class="agent-config-model">';
            html += '<div class="agent-config-model-info">';
            if (currentModel) {
                html += '<span class="agent-config-model-name">' + (currentModel.name || currentModelId) + '</span>';
                html += '<span class="agent-config-model-meta">' + currentModel.provider + ' • ' + currentModel.contextDisplay + '</span>';
            } else {
                html += '<span class="agent-config-model-name" style="color: var(--color-error)">No model assigned</span>';
            }
            html += '</div>';
            if (hasPendingChange) {
                html += '<div class="agent-config-pending">';
                html += '<div class="agent-config-pending-label">Pending change</div>';
                html += '<div class="agent-config-pending-diff">';
                html += '<span>' + getModelDisplay(savedModelId) + '</span>';
                html += '<span class="diff-arrow">→</span>';
                html += '<span>' + getModelDisplay(currentModelId) + '</span>';
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';
            
            const configuredFallbacks = normalizeFallbackModels(agentConfig.fallback_models);
            const hasConfiguredFallbacks = configuredFallbacks.length > 0;
            const upstreamFallbacks = agentInfo && agentInfo.fallbackChain ? agentInfo.fallbackChain : [];
            
            if (hasConfiguredFallbacks || upstreamFallbacks.length > 0) {
                html += '<div class="agent-config-fallbacks">';
                if (hasConfiguredFallbacks) {
                    html += '<span class="fallback-indicator configured" title="' + configuredFallbacks.length + ' configured fallback(s)">⚙️ ' + configuredFallbacks.length + ' fallback' + (configuredFallbacks.length > 1 ? 's' : '') + '</span>';
                }
                if (upstreamFallbacks.length > 0 && !hasConfiguredFallbacks) {
                    html += '<span class="fallback-indicator upstream" title="Upstream recommendations available">🔗 ' + upstreamFallbacks.length + ' recommended</span>';
                }
                html += '</div>';
            }
            
            // Requirements
            if (agentInfo) {
                html += '<div class="agent-config-requirements">';
                html += '<h4>Requirements</h4>';
                html += '<div class="agent-config-req-list">';
                html += '<div class="agent-config-req-item">📏 Min Context: ' + formatContext(agentInfo.minContext || 128000) + '</div>';
                if (agentInfo.thinking) {
                    html += '<div class="agent-config-req-item">💭 Requires thinking capability</div>';
                }
                if (agentInfo.capabilities && agentInfo.capabilities.length > 0) {
                    html += '<div class="agent-config-req-item">✨ ' + agentInfo.capabilities.join(', ') + '</div>';
                }
                if (agentInfo.preferred && agentInfo.preferred.length > 0) {
                    html += '<div class="agent-config-req-item">🎯 Preferred: ' + agentInfo.preferred.join(', ') + '</div>';
                }
                html += '</div>';
                html += '</div>';
                
                // Description
                const desc = agentInfo.summary || agentInfo.description;
                if (desc) {
                    html += '<div class="agent-config-description">';
                    html += desc;
                    html += '</div>';
                }

                if (agentInfo.usage && agentInfo.usage.length > 0) {
                    html += '<div class="agent-config-usage">';
                    html += '<div class="agent-config-usage-title">Best utilized for</div>';
                    html += '<ul>';
                    agentInfo.usage.slice(0, 3).forEach(item => {
                        html += '<li>' + item + '</li>';
                    });
                    html += '</ul>';
                    html += '</div>';
                }

                if (agentInfo.caveats && agentInfo.caveats.length > 0) {
                    html += '<div class="agent-config-caveats">';
                    agentInfo.caveats.slice(0, 2).forEach(c => {
                        html += '<div class="agent-config-caveat">⚠️ ' + c + '</div>';
                    });
                    html += '</div>';
                }
            }
            
            // Actions
            html += '<div class="agent-config-actions">';
            html += '<button class="btn btn-primary" onclick="changeAgentModel(\'' + agentName + '\')">Change Model</button>';
            html += '<button class="btn btn-secondary" onclick="openFallbackEditor(\'' + agentName + '\')">Edit Fallbacks</button>';
            html += '<button class="btn btn-secondary" onclick="viewAgentDetails(\'' + agentName + '\')">View Details</button>';
            html += '</div>';
            
            html += '</div>';
            return html;
        }).join('');
        
    } catch (error) {
        console.error('Failed to load agent details:', error);
        elements.agentsGrid.innerHTML = '<div class="error-message"><h3>Error loading agents</h3><p>' + error.message + '</p></div>';
    }
}

async function getAgentInfo(agentName) {
    if (state.agentDocsByName && state.agentDocsByName[agentName]) {
        return state.agentDocsByName[agentName];
    }

    try {
        const response = await fetch('/api/agents/' + encodeURIComponent(agentName));
        const data = await response.json();
        if (data && data.agent) {
            if (!state.agentDocsByName) state.agentDocsByName = {};
            state.agentDocsByName[agentName] = data.agent;
            return data.agent;
        }
    } catch (e) {
    }

    return null;
}

function changeAgentModel(agentName) {
    // Show model selection modal for this specific agent
    showAgentModelSelector(agentName);
}

function viewAgentDetails(agentName) {
    // Fetch and show detailed agent info
    viewAgentDetail(agentName);
}

async function showAgentModelSelector(agentName) {
    const currentModelId = state.currentConfig.agents[agentName]?.model;

    const agentInfo = await getAgentInfo(agentName);
    const summary = agentInfo ? (agentInfo.summary || agentInfo.description || '') : '';
    const preferred = agentInfo && agentInfo.preferred && agentInfo.preferred.length > 0 ? agentInfo.preferred : [];
    const minContext = agentInfo && agentInfo.minContext ? agentInfo.minContext : null;
    const recommended = agentInfo && agentInfo.recommendedModels ? agentInfo.recommendedModels : [];

    let content = '<div class="model-selector">';
    content += '<div class="model-selector-header">';
    content += '<h3>Select model for ' + agentName + '</h3>';
    if (summary) {
        content += '<div class="model-selector-summary">' + summary + '</div>';
    }
    content += '<div class="model-selector-current">Current: <code>' + (currentModelId ? currentModelId : 'none') + '</code></div>';
    if (preferred.length > 0 || minContext) {
        content += '<div class="model-selector-hints">';
        if (preferred.length > 0) content += '<span class="hint">Preferred: ' + preferred.join(', ') + '</span>';
        if (minContext) content += '<span class="hint">Min context: ' + formatContext(minContext) + '</span>';
        content += '</div>';
    }
    content += '</div>';

    content += '<div class="model-selector-controls">';
    content += '<div class="model-selector-search">';
    content += '<input type="text" id="agent-model-search" placeholder="Search models (name, provider, id)...">';
    content += '</div>';

    content += '<div class="model-selector-filters">';
    content += '<select id="agent-model-provider" class="filter-select"><option value="">All Providers</option>';
    state.providers.forEach(p => {
        content += '<option value="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
    });
    content += '</select>';

    content += '<select id="agent-model-context" class="filter-select">';
    content += '<option value="">Any context</option>';
    [64000, 128000, 200000, 500000, 1000000].forEach(v => {
        content += '<option value="' + v + '">' + formatContext(v) + '+</option>';
    });
    content += '</select>';
    content += '</div>';

    content += '<div class="model-selector-chips" id="agent-model-chips">';
    content += '<button class="chip" data-filter="reasoning">🧠 Reasoning</button>';
    content += '<button class="chip" data-filter="image">🖼️ Image</button>';
    content += '<button class="chip" data-filter="pdf">📄 PDF</button>';
    content += '<button class="chip" data-filter="thinking">💭 Thinking</button>';
    content += '<button class="chip" data-filter="fast">⚡ Fast</button>';
    content += '</div>';
    content += '</div>';

    content += '<div id="agent-model-results" class="model-selector-results"></div>';
    content += '</div>';

    showModal('Select Model', content);

    const selectorState = {
        search: '',
        provider: '',
        minContext: null,
        capabilities: []
    };

    function filterModelsForSelector(models) {
        let filtered = models;

        if (selectorState.search) {
            const q = selectorState.search.toLowerCase();
            filtered = filtered.filter(m => {
                const name = (m.name || '').toLowerCase();
                const id = (m.id || '').toLowerCase();
                const provider = (m.provider || '').toLowerCase();
                const family = (m.family || '').toLowerCase();
                return name.includes(q) || id.includes(q) || provider.includes(q) || family.includes(q);
            });
        }

        if (selectorState.provider) {
            filtered = filtered.filter(m => m.provider === selectorState.provider);
        }

        if (selectorState.capabilities.length > 0) {
            filtered = filtered.filter(model => {
                return selectorState.capabilities.every(cap => {
                    switch (cap) {
                        case 'reasoning': return model.capabilities && model.capabilities.reasoning;
                        case 'image': return model.capabilities && model.capabilities.input && model.capabilities.input.image;
                        case 'pdf': return model.capabilities && model.capabilities.input && model.capabilities.input.pdf;
                        case 'thinking': return model.hasThinking;
                        case 'fast': return model.isFast;
                        default: return false;
                    }
                });
            });
        }

        if (selectorState.minContext) {
            filtered = filtered.filter(m => (m.context || 0) >= selectorState.minContext);
        }

        return filtered;
    }

    function renderModelButton(model, extraMeta, recommendation) {
        const isCurrent = model.id === currentModelId || model.modelID === currentModelId;
        const usedBy = getAgentsUsingModel(model.id);
        const variant = recommendation && recommendation.variant ? recommendation.variant : null;
        const provenance = recommendation && recommendation.provenance ? recommendation.provenance : null;
        const discouragedReason = recommendation && recommendation.discouragedReason ? recommendation.discouragedReason : null;
        const discouragedSeverity = recommendation && recommendation.discouragedSeverity ? recommendation.discouragedSeverity : null;
        const variantAttr = variant ? ' data-variant="' + variant + '"' : '';
        let html = '<button class="btn btn-secondary model-select-btn ' + (isCurrent ? 'current' : '') + '" onclick="assignModelToAgent(\'' + model.id + '\', \'' + agentName + '\', ' + (variant ? '\'' + variant + '\'' : 'null') + '); closeModal();"' + variantAttr + '>';
        html += '<div class="model-select-name">' + (model.name || model.id.split('/').pop());
        if (variant) {
            html += ' <span class="variant-badge variant-' + variant + '">' + variant + '</span>';
        }
        if (provenance === 'fallback-chain') {
            html += ' <span class="provenance-badge" title="From upstream requirements">⬡</span>';
        }
        if (discouragedReason) {
            const warningIcon = discouragedSeverity === 'avoid' ? '⚠️' : '⚠';
            const warningClass = discouragedSeverity === 'avoid' ? 'warning-badge-avoid' : 'warning-badge';
            html += ' <span class="badge ' + warningClass + '" title="' + discouragedReason + '">' + warningIcon + '</span>';
        }
        html += renderBillingBadge(model);
        html += renderSpeedBadge(model);
        html += '</div>';
        html += '<div class="model-select-meta">' + model.provider + ' • ' + model.contextDisplay;
        if (model.badges && model.badges.length > 0) {
            html += ' • ' + model.badges.join(', ');
        }
        if (extraMeta) {
            html += ' • ' + extraMeta;
        }
        if (isCurrent) html += ' ✓ Current';
        html += '</div>';
        if (usedBy && usedBy.length > 0) {
            html += '<div class="model-select-used">Used by: ' + usedBy.join(', ') + '</div>';
        }
        html += '</button>';
        return html;
    }

    function renderResults() {
        const el = document.getElementById('agent-model-results');
        if (!el) return;

        const filtered = filterModelsForSelector(state.models);

        let html = '';

        const recModels = recommended
            .map(r => ({
                info: r,
                model: state.models.find(m => m.id === r.id)
            }))
            .filter(x => x.model);

        if (recModels.length > 0) {
            html += '<div class="model-selector-section">';
            html += '<h4>Recommended for ' + agentName + '</h4>';
            html += '<div class="model-selector-list">';
            recModels.forEach(r => {
                html += renderModelButton(r.model, 'score ' + r.info.score, r.info);
            });
            html += '</div></div>';
        }

        const inUseIds = Object.entries((state.currentConfig && state.currentConfig.agents) ? state.currentConfig.agents : {})
            .map(([a, cfg]) => cfg && cfg.model ? cfg.model : null)
            .filter(Boolean);
        const uniqueInUse = Array.from(new Set(inUseIds))
            .map(id => state.models.find(m => m.id === id))
            .filter(Boolean);

        if (uniqueInUse.length > 0) {
            html += '<div class="model-selector-section">';
            html += '<h4>In use in this config</h4>';
            html += '<div class="model-selector-list">';
            uniqueInUse.slice(0, 8).forEach(m => {
                html += renderModelButton(m);
            });
            if (uniqueInUse.length > 8) {
                html += '<div class="model-selector-note">Showing 8 of ' + uniqueInUse.length + ' assigned models</div>';
            }
            html += '</div></div>';
        }

        html += '<div class="model-selector-section">';
        html += '<h4>All models (' + filtered.length + ')</h4>';
        if (filtered.length === 0) {
            html += '<div class="no-results"><h3>No models found</h3><p>Try adjusting your search or filters.</p></div>';
        } else {
            const capped = filtered.slice(0, 120);
            const groups = {};
            capped.forEach(m => {
                if (!groups[m.provider]) groups[m.provider] = [];
                groups[m.provider].push(m);
            });
            Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([provider, models]) => {
                html += '<div class="model-provider-group">';
                html += '<div class="model-provider-group-title">' + provider + ' <span class="count">(' + models.length + ')</span></div>';
                html += '<div class="model-selector-list">';
                models.forEach(m => { html += renderModelButton(m); });
                html += '</div></div>';
            });

            if (filtered.length > 120) {
                html += '<div class="model-selector-note">Showing first 120 results. Refine filters to narrow further.</div>';
            }
        }
        html += '</div>';

        el.innerHTML = html;
    }

    const searchEl = document.getElementById('agent-model-search');
    const providerEl = document.getElementById('agent-model-provider');
    const contextEl = document.getElementById('agent-model-context');
    const chipsEl = document.getElementById('agent-model-chips');

    if (searchEl) {
        searchEl.addEventListener('input', debounce((e) => {
            selectorState.search = e.target.value;
            renderResults();
        }, 120));
        searchEl.focus();
    }

    if (providerEl) {
        providerEl.addEventListener('change', (e) => {
            selectorState.provider = e.target.value;
            renderResults();
        });
    }

    if (contextEl) {
        contextEl.addEventListener('change', (e) => {
            selectorState.minContext = e.target.value ? parseInt(e.target.value, 10) : null;
            renderResults();
        });
    }

    if (chipsEl) {
        chipsEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chip')) return;
            e.target.classList.toggle('active');
            const active = chipsEl.querySelectorAll('.chip.active');
            selectorState.capabilities = Array.from(active).map(ch => ch.dataset.filter);
            renderResults();
        });
    }

    renderResults();
}

function viewModelDetails(modelId) {
    const model = state.models.find(m => m.id === modelId);
    if (!model) return;
    
    const agents = getAgentsUsingModel(modelId);
    
    let content = '<div class="model-detail">';
    content += '<div class="detail-section"><h4>Model Information</h4>';
    content += '<table class="detail-table">';
    content += '<tr><td>ID:</td><td><code>' + model.id + '</code></td></tr>';
    content += '<tr><td>Provider:</td><td>' + model.provider + '</td></tr>';
    content += '<tr><td>Context:</td><td>' + model.contextDisplay + ' (' + (model.context || 0).toLocaleString() + ' tokens)</td></tr>';
    content += '<tr><td>Capabilities:</td><td>' + (model.badges.join(', ') || 'None') + '</td></tr>';
    content += '<tr><td>Cost:</td><td>' + (model.costDisplay || 'Unknown') + '</td></tr>';
    content += '</table></div>';
    
    if (agents.length > 0) {
        content += '<div class="detail-section"><h4>Currently Assigned To</h4><div class="assigned-agents">';
        agents.forEach(agent => {
            content += '<div class="assigned-agent"><span class="agent-name">' + agent + '</span>';
            content += '<button class="btn btn-small btn-secondary" onclick="viewAlternatives(\'' + agent + '\')">Change</button></div>';
        });
        content += '</div></div>';
    }
    
    content += '<div class="detail-section"><h4>Raw Data</h4><pre class="raw-data">' + JSON.stringify(model, null, 2) + '</pre></div>';
    content += '</div>';
    
    showModal(model.name, content);
}

function viewAlternatives(agentName) {
    const currentModelId = state.currentConfig && state.currentConfig.agents && state.currentConfig.agents[agentName] ? state.currentConfig.agents[agentName].model : null;
    const currentModel = currentModelId ? state.models.find(m => m.id === currentModelId) : null;
    
    let content = '';
    
    if (currentModel) {
        content += '<div class="current-model"><h4>Current Model</h4>';
        content += '<div class="model-card">';
        content += '<div class="model-header">';
        content += '<span class="model-provider ' + currentModel.provider.toLowerCase() + '">' + currentModel.provider + '</span>';
        content += renderCostBadge(currentModel);
        content += '</div>';
        content += '<div class="model-name">' + currentModel.name + '</div>';
        content += '<div class="model-badges">';
        content += '<span class="badge context">' + currentModel.contextDisplay + '</span>';
        currentModel.badges.forEach(b => { content += '<span class="badge">' + b + '</span>'; });
        content += '</div></div></div>';
    }
    
    content += '<div class="alternatives-list"><h4>Suggested Alternatives</h4>';
    
    const alternatives = currentModel ? findSimilarModels(currentModel) : state.models.slice(0, 5).map(m => ({ model: m, score: 50 }));
    
    if (alternatives.length > 0) {
        alternatives.forEach(alt => {
            content += '<div class="alternative-item">';
            content += '<div class="alt-info">';
            content += '<span class="model-provider ' + alt.model.provider.toLowerCase() + '">' + alt.model.provider + '</span>';
            content += '<span class="alt-name">' + alt.model.name + '</span>';
            content += '<span class="alt-score">' + alt.score + '% match</span>';
            content += '</div>';
            content += '<div class="alt-badges">';
            content += '<span class="badge context">' + alt.model.contextDisplay + '</span>';
            alt.model.badges.forEach(b => { content += '<span class="badge">' + b + '</span>'; });
            if (alt.costDelta && alt.costDelta > 0) content += '<span class="badge cost-cheap">💰 Cheaper</span>';
            content += '</div>';
            content += '<button class="btn btn-primary" onclick="assignModelToAgent(\'' + alt.model.id + '\', \'' + agentName + '\')">Switch to This</button>';
            content += '</div>';
        });
    } else {
        content += '<p>No alternatives found</p>';
    }
    
    content += '</div>';
    
    showModal('Alternatives for ' + agentName, content);
}

function findSimilarModels(currentModel) {
    return state.models
        .filter(m => m.id !== currentModel.id)
        .map(model => {
            let score = 0;
            
            const contextRatio = Math.min(model.context || 0, currentModel.context || 0) / Math.max(model.context || 1, currentModel.context || 1);
            if (contextRatio > 0.8) score += 30;
            else if (contextRatio > 0.5) score += 15;
            
            const currentBadges = new Set(currentModel.badges || []);
            const modelBadges = new Set(model.badges || []);
            const matching = Array.from(currentBadges).filter(b => modelBadges.has(b));
            score += (matching.length / Math.max(currentBadges.size, 1)) * 40;
            
            let costDelta = 0;
            if (currentModel.costDisplay && model.costDisplay) {
                costDelta = currentModel.costDisplay.length - model.costDisplay.length;
                if (costDelta > 0) score += 10;
            }
            
            return { model, score: Math.round(score), costDelta };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}

function assignModelToAgent(modelId, agentName, variant) {
    if (!state.currentConfig.agents) state.currentConfig.agents = {};
    if (!state.currentConfig.agents[agentName]) state.currentConfig.agents[agentName] = {};

    const oldModelId = state.currentConfig.agents[agentName].model;
    const oldVariant = state.currentConfig.agents[agentName].variant;
    if (oldModelId === modelId && oldVariant === variant) {
        updateStatus(agentName + ' is already using that model' + (variant ? ' (variant: ' + variant + ')' : ''), 'info');
        return;
    }

    state.currentConfig.agents[agentName].model = modelId;

    // Store variant only if provided, otherwise remove it to keep config clean
    if (variant) {
        state.currentConfig.agents[agentName].variant = variant;
    } else {
        delete state.currentConfig.agents[agentName].variant;
    }

    const model = state.models.find(m => m.id === modelId);
    const oldModel = oldModelId ? state.models.find(m => m.id === oldModelId) : null;

    const changeDesc = agentName + ' model changed' +
        (oldModel ? ' from ' + oldModel.name : '') +
        ' to ' + (model ? model.name : modelId) +
        (variant ? ' (variant: ' + variant + ')' : '');

    recordChange(
        'model_change',
        changeDesc,
        () => {
            state.currentConfig.agents[agentName].model = oldModelId;
            if (oldVariant) {
                state.currentConfig.agents[agentName].variant = oldVariant;
            } else {
                delete state.currentConfig.agents[agentName].variant;
            }
        }
    );

    syncUnsavedState();
    closeModal();

    if (!elements.agentsGrid.classList.contains('hidden')) {
        renderAgentConfigView();
    }

    updateStatus(agentName + ' changed to ' + (model ? model.name : modelId) + (variant ? ' (variant: ' + variant + ')' : ''), 'success');
}

function assignModel(modelId) {
    let content = '<p>Select an agent to assign <strong>' + modelId + '</strong> to:</p><div class="agent-list">';
    
    const agents = state.currentConfig && state.currentConfig.agents ? Object.keys(state.currentConfig.agents) : [];
    
    if (agents.length > 0) {
        agents.forEach(agent => {
            content += '<button class="btn btn-secondary assign-agent-btn" onclick="assignModelToAgent(\'' + modelId + '\', \'' + agent + '\')">' + agent + '</button>';
        });
    } else {
        content += '<p>No agents available</p>';
    }
    
    content += '</div>';
    showModal('Assign Model', content);
}

async function switchProfile(e) {
    const profileName = e.target.value;
    if (!profileName || profileName === state.currentProfile) return;
    
    if (state.unsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them and switch profiles?')) {
            e.target.value = state.currentProfile;
            return;
        }
    }
    
    try {
        const response = await fetch('/api/profiles/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentProfile = profileName;
            state.unsavedChanges = false;
            elements.saveBtn.disabled = true;
            await loadCurrentConfig();
            updateStatus('Switched to profile: ' + profileName, 'success');
        } else {
            throw new Error(data.error || 'Failed to switch profile');
        }
    } catch (error) {
        console.error('Failed to switch profile:', error);
        updateStatus('Error: ' + error.message, 'error');
        e.target.value = state.currentProfile;
    }
}

async function saveConfiguration() {
    const pendingChanges = getPendingModelChanges();

    if (pendingChanges.length === 0) {
        syncUnsavedState();
        updateStatus('No pending model changes to save', 'info');
        return;
    }

    state.pendingSaveChanges = pendingChanges;
    openSaveChangesReviewModal();
}

function openSaveChangesReviewModal() {
    const pendingChanges = state.pendingSaveChanges || [];
    if (pendingChanges.length === 0) {
        syncUnsavedState();
        updateStatus('No pending model changes to save', 'info');
        return;
    }

    let content = '<div class="profile-diff">';
    content += '<h4>Apply these model changes?</h4>';

    pendingChanges.forEach(change => {
        content += '<div class="diff-section ' + change.type + '">';
        content += '<div class="diff-title">' + change.agent + '</div>';
        content += '<div class="diff-content">';
        if (change.type === 'added') {
            content += '<span class="diff-to">none → ' + change.toDisplay + '</span>';
        } else if (change.type === 'removed') {
            content += '<span class="diff-from">' + change.fromDisplay + '</span>';
            content += '<span class="diff-arrow">→</span>';
            content += '<span class="diff-to">none</span>';
        }
        
        if (change.fallbackDiff && change.fallbackDiff.hasChanges) {
            content += '<div class="fallback-changes">';
            content += formatFallbackChangeDisplay(change.fallbackDiff);
            content += '</div>';
        }
        content += '</div>';
        content += '</div>';
    });
    
    content += '<div class="form-actions">';
    content += '<button class="btn btn-primary" onclick="confirmSaveConfiguration()">Apply Changes</button>';
    content += '<button class="btn btn-secondary" onclick="cancelSaveConfiguration()">Cancel</button>';
    content += '</div>';
    content += '</div>';

    showModal('Review Model Changes', content);
}

function cancelSaveConfiguration() {
    state.pendingSaveChanges = [];
    closeModal();
}

async function confirmSaveConfiguration() {
    const pendingChanges = state.pendingSaveChanges || [];
    if (pendingChanges.length === 0) {
        cancelSaveConfiguration();
        syncUnsavedState();
        updateStatus('No pending model changes to save', 'info');
        return;
    }

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.currentConfig)
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.savedConfig = cloneConfig(state.currentConfig);
            state.pendingSaveChanges = [];
            syncUnsavedState();

            if (!elements.agentsGrid.classList.contains('hidden')) {
                await renderAgentConfigView();
            }

            updateStatus('Configuration saved successfully • applied ' + pendingChanges.length + ' model change(s)', 'success');
            closeModal();
        } else {
            throw new Error(data.error || 'Failed to save');
        }
    } catch (error) {
        console.error('Failed to save:', error);
        updateStatus('Error saving: ' + error.message, 'error');
    }
}

function showModal(title, content) {
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = content;
    elements.modal.classList.remove('hidden');
}

function closeModal() {
    elements.modal.classList.add('hidden');
}

function setLoading(loading, message) {
    state.isLoading = loading;
    if (loading) {
        elements.statusBar.innerHTML = '<span class="loading">' + message + '</span>';
    }
}

function updateStatus(message, type) {
    const typeClass = type === 'error' ? 'status-error' : type === 'success' ? 'status-success' : '';
    elements.statusBar.innerHTML = '<span class="' + typeClass + '">' + message + '</span>';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            if (elements.statusBar.textContent === message) {
                elements.statusBar.innerHTML = '<span>Ready - ' + state.models.length + ' models available</span>';
            }
        }, 5000);
    }
}

function markUnsaved() {
    syncUnsavedState();
}

document.addEventListener('DOMContentLoaded', init);

window.viewModelDetails = viewModelDetails;
window.viewAlternatives = viewAlternatives;
window.assignModelToAgent = assignModelToAgent;
window.assignModel = assignModel;

window.loadModels = loadModels;
window.confirmSaveConfiguration = confirmSaveConfiguration;
window.cancelSaveConfiguration = cancelSaveConfiguration;

// Profile Management Functions

// Track change history for undo
const changeHistory = [];
const MAX_HISTORY = 10;

/**
 * Add change to history
 */
function recordChange(type, description, revertFn) {
    changeHistory.unshift({
        type,
        description,
        timestamp: new Date(),
        revert: revertFn,
        configSnapshot: JSON.parse(JSON.stringify(state.currentConfig))
    });
    
    if (changeHistory.length > MAX_HISTORY) {
        changeHistory.pop();
    }
    
    elements.undoBtn.disabled = false;
}

/**
 * Undo last change
 */
async function undoLastChange() {
    if (changeHistory.length === 0) return;
    
    const lastChange = changeHistory.shift();
    
    // Use revert function to restore the original state (configSnapshot captures wrong state)
    if (lastChange.revert) {
        lastChange.revert();
    }
    

    syncUnsavedState();
    
    // Re-render Agents view if visible to update pending indicators
    if (!elements.agentsGrid.classList.contains('hidden')) {
        await renderAgentConfigView();
    }
    
    updateStatus('Undone: ' + lastChange.description, 'success');
    
    if (changeHistory.length === 0) {
        elements.undoBtn.disabled = true;
    }
}

/**
 * Open profile management modal
 */
function openProfileManagement() {
    const currentProfileName = state.currentProfile || 'default';
    
    let content = '<div class="profile-management">';
    
    content += '<div class="profile-list">';
    state.profiles.forEach(profile => {
        const isActive = profile.name === currentProfileName;
        const agentCount = profile.agentCount || 0;
        
        content += '<div class="profile-item ' + (isActive ? 'active' : '') + '">';
        content += '<div class="profile-info">';
        content += '<div class="profile-name">';
        content += profile.name;
        if (isActive) {
            content += '<span class="profile-badge">ACTIVE</span>';
        }
        content += '</div>';
        
        if (profile.description) {
            content += '<div class="profile-meta">' + profile.description + '</div>';
        }
        
        content += '<div class="profile-meta">' + agentCount + ' agents | Modified: ' + new Date(profile.modifiedAt).toLocaleDateString() + '</div>';
        
        if (isActive && state.currentConfig && state.currentConfig.agents) {
            const agents = state.currentConfig.agents;
            const agentList = Object.entries(agents).slice(0, 3).map(([name, config]) => {
                const model = config.model ? config.model.split('/').pop() : 'none';
                return name + ': ' + model;
            }).join(', ');
            content += '<div class="profile-agents-preview">' + agentList + (Object.keys(agents).length > 3 ? '...' : '') + '</div>';
        }
        
        content += '</div>';
        content += '<div class="profile-actions">';
        
        if (!isActive) {
            content += '<button class="btn btn-primary" onclick="activateProfile(\'' + profile.name + '\')">Activate</button>';
        }
        
        content += '<button class="btn btn-secondary" onclick="duplicateProfile(\'' + profile.name + '\')">Duplicate</button>';
        content += '<button class="btn btn-secondary" onclick="exportProfile(\'' + profile.name + '\')">Export</button>';
        
        if (!isActive) {
            content += '<button class="btn btn-text" style="color: var(--color-error)" onclick="deleteProfile(\'' + profile.name + '\')">Delete</button>';
        }
        
        content += '</div>';
        content += '</div>';
    });
    content += '</div>';
    
    // Backups Section
    content += '<div class="backups-section" style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--color-border)">';
    content += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md)">';
    content += '<h4>📦 Configuration Backups</h4>';
    content += '<button class="btn btn-secondary" onclick="refreshBackupsList()">🔄 Refresh</button>';
    content += '</div>';
    content += '<div id="backups-list-container">';
    content += '<div class="loading">Loading backups...</div>';
    content += '</div>';
    content += '<div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm)">';
    content += '<button class="btn btn-text" style="color: var(--color-warning)" onclick="openPurgeBackupsModal()">🗑️ Purge Old Backups</button>';
    content += '</div>';
    content += '</div>';
    
    content += '<div class="profile-create-section">';
    content += '<h4>Create New Profile</h4>';
    content += '<div class="profile-form">';
    content += '<div class="form-group">';
    content += '<label>Profile Name</label>';
    content += '<input type="text" id="new-profile-name" placeholder="e.g., work-credits, home-expensive">';
    content += '</div>';
    content += '<div class="form-group">';
    content += '<label>Description (optional)</label>';
    content += '<input type="text" id="new-profile-description" placeholder="Brief description of this profile">';
    content += '</div>';
    content += '<div class="form-actions">';
    content += '<button class="btn btn-primary" onclick="createProfileFromCurrent()">Create from Current</button>';
    content += '<button class="btn btn-secondary" onclick="importCurrentConfig()">Import Active Config</button>';
    content += '</div>';
    content += '</div>';
    content += '</div>';
    
    content += '<div class="import-export-section">';
    content += '<div class="import-section">';
    content += '<h4>Import Profile</h4>';
    content += '<div class="file-drop-zone" id="import-drop-zone">';
    content += '<p>📁 Drop JSON file here or click to browse</p>';
    content += '<input type="file" id="import-file-input" accept=".json" style="display: none">';
    content += '</div>';
    content += '</div>';
    content += '<div class="export-section">';
    content += '<h4>Export All</h4>';
    content += '<button class="btn btn-secondary" onclick="exportAllProfiles()" style="width: 100%">Export All Profiles</button>';
    content += '</div>';
    content += '</div>';
    
    if (changeHistory.length > 0) {
        content += '<div class="change-history-section" style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--color-border)">';
        content += '<h4>Recent Changes</h4>';
        content += '<div class="change-history">';
        changeHistory.slice(0, 5).forEach((change, index) => {
            content += '<div class="history-item">';
            content += '<span class="history-time">' + change.timestamp.toLocaleTimeString() + '</span>';
            content += '<span class="history-action">' + change.description + '</span>';
            if (index === 0) {
                content += '<button class="btn btn-secondary history-undo-btn" onclick="undoLastChange(); openProfileManagement()">Undo</button>';
            }
            content += '</div>';
        });
        content += '</div>';
        content += '</div>';
    }
    
    content += '</div>';
    
    showModal('Profile Management', content);
    
    // Setup import drop zone and load backups
    setTimeout(() => {
        setupImportDropZone();
        refreshBackupsList();
    }, 0);
}

/**
 * Open provider policies modal
 */
async function openProviderPolicies() {
    let content = '<div class="provider-policies">';
    
    content += '<div class="policies-header">';
    content += '<p style="margin-bottom: var(--spacing-md); color: var(--color-text-secondary);">Configure billing model, speed tier, and priority for each provider. Lower priority = better ranking.</p>';
    content += '</div>';
    
    content += '<div id="policies-list" class="policies-list">';
    content += '<div class="loading">Loading provider policies...</div>';
    content += '</div>';
    
    content += '<div class="policies-actions" style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--color-border); display: flex; gap: var(--spacing-sm);">';
    content += '<button class="btn btn-primary" onclick=\"saveProviderPolicies()\">Save Changes</button>';
    content += '<button class="btn btn-secondary" onclick=\"resetProviderPolicies()\">Reset to Defaults</button>';
    content += '</div>';
    
    content += '</div>';
    
    showModal('Provider Policies', content);
    
    // Load provider policies
    loadProviderPolicies();
}

/**
 * Load provider policies from server
 */
async function loadProviderPolicies() {
    try {
        const response = await fetch('/api/providers');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        renderProviderPolicies(data.providers || {});
    } catch (error) {
        console.error('Failed to load provider policies:', error);
        const container = document.getElementById('policies-list');
        if (container) {
            container.innerHTML = '<div class="error-message">Failed to load provider policies: ' + error.message + '</div>';
        }
    }
}

/**
 * Render provider policies list
 */
function renderProviderPolicies(policies) {
    const container = document.getElementById('policies-list');
    if (!container) return;
    
    const providers = Object.keys(policies).sort();
    
    if (providers.length === 0) {
        container.innerHTML = '<div class="no-results"><p>No provider policies found</p></div>';
        return;
    }
    
    let html = '';
    
    providers.forEach(providerId => {
        const policy = policies[providerId];
        
        html += '<div class="policy-item" style="padding: var(--spacing-md); background-color: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); margin-bottom: var(--spacing-sm);">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-sm);">';
        html += '<span style="font-weight: 600; text-transform: capitalize;">' + providerId.replace(/-/g, ' ') + '</span>';
        html += '<span class="badge" style="font-size: 0.7rem;">' + (policy.source || 'default') + '</span>';
        html += '</div>';
        
        // Billing Model
        html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">';
        html += '<div>';
        html += '<label style="font-size: 0.8rem; color: var(--color-text-secondary);">Billing Model</label><br>';
        html += '<select id="policy-' + providerId + '-billing" class="filter-select" style="width: 100%; margin-top: 4px;">';
        html += '<option value="unknown"' + (policy.billingModel === 'unknown' ? ' selected' : '') + '>Unknown</option>';
        html += '<option value="subscription"' + (policy.billingModel === 'subscription' ? ' selected' : '') + '>Subscription</option>';
        html += '<option value="metered"' + (policy.billingModel === 'metered' ? ' selected' : '') + '>Pay-as-you-go</option>';
        html += '<option value="free"' + (policy.billingModel === 'free' ? ' selected' : '') + '>Free</option>';
        html += '</select>';
        html += '</div>';
        
        // Speed Tier
        html += '<div>';
        html += '<label style="font-size: 0.8rem; color: var(--color-text-secondary);">Speed Tier</label><br>';
        html += '<select id="policy-' + providerId + '-speed" class="filter-select" style="width: 100%; margin-top: 4px;">';
        html += '<option value="unknown"' + (policy.speedTier === 'unknown' ? ' selected' : '') + '>Unknown</option>';
        html += '<option value="fast"' + (policy.speedTier === 'fast' ? ' selected' : '') + '>Fast</option>';
        html += '<option value="normal"' + (policy.speedTier === 'normal' ? ' selected' : '') + '>Normal</option>';
        html += '<option value="slow"' + (policy.speedTier === 'slow' ? ' selected' : '') + '>Slow</option>';
        html += '</select>';
        html += '</div>';
        
        // Priority Tier
        html += '<div>';
        html += '<label style="font-size: 0.8rem; color: var(--color-text-secondary);">Priority (1=best)</label><br>';
        html += '<input type="number" id="policy-' + providerId + '-priority" class="filter-select" style="width: 100%; margin-top: 4px;" min="1" max="99" value="' + (policy.priorityTier || 99) + '">';
        html += '</div>';
        
        html += '<div style="margin-top: var(--spacing-sm);">';
        html += '<label style="font-size: 0.8rem; color: var(--color-text-secondary);">Notes (optional)</label><br>';
        html += '<input type="text" id="policy-' + providerId + '-notes" class="filter-select" style="width: 100%; margin-top: 4px;" maxlength="120" placeholder="Max 120 characters" value="' + (policy.notes || '').replace(/"/g, '&quot;') + '">';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    
    container.innerHTML = html;
}

/**
 * Save provider policies
 */
async function saveProviderPolicies() {
    // First, get current policies to know which providers exist
    try {
        const response = await fetch('/api/providers');
        const data = await response.json();
        const currentPolicies = data.providers || {};
        
        const updates = {};
        
        Object.keys(currentPolicies).forEach(providerId => {
            const billingEl = document.getElementById('policy-' + providerId + '-billing');
            const speedEl = document.getElementById('policy-' + providerId + '-speed');
            const priorityEl = document.getElementById('policy-' + providerId + '-priority');
            const notesEl = document.getElementById('policy-' + providerId + '-notes');
            
            if (billingEl && speedEl && priorityEl) {
                const notes = notesEl ? notesEl.value.slice(0, 120) : '';
                updates[providerId] = {
                    billingModel: billingEl.value,
                    speedTier: speedEl.value,
                    priorityTier: parseInt(priorityEl.value, 10) || 99,
                    notes: notes
                };
            }
        });
        
        // Send update to server
        const saveResponse = await fetch('/api/providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providers: updates })
        });
        
        const saveData = await saveResponse.json();
        
        if (saveData.error) {
            throw new Error(saveData.error);
        }
        
        updateStatus('Provider policies saved successfully', 'success');
        closeModal();
        
        // Refresh models to reflect new policies
        loadModels(true);
    } catch (error) {
        console.error('Failed to save provider policies:', error);
        updateStatus('Failed to save: ' + error.message, 'error');
    }
}

/**
 * Reset provider policies to defaults
 */
async function resetProviderPolicies() {
    if (!confirm('Reset all provider policies to defaults? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/providers/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateStatus('Provider policies reset to defaults', 'success');
        loadProviderPolicies();
        loadModels(true);
    } catch (error) {
        console.error('Failed to reset provider policies:', error);
        updateStatus('Failed to reset: ' + error.message, 'error');
    }
}

/**
 * Setup file import drop zone
 */
function setupImportDropZone() {
    const dropZone = document.getElementById('import-drop-zone');
    const fileInput = document.getElementById('import-file-input');
    
    if (!dropZone || !fileInput) return;
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleProfileImport(e.target.files[0]);
        }
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handleProfileImport(e.dataTransfer.files[0]);
        }
    });
}

/**
 * Activate a profile with confirmation
 */
async function activateProfile(profileName) {
    if (state.unsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them and switch to "' + profileName + '"?')) {
            return;
        }
    }
    
    // Show diff before switching
    const currentAssignments = getCurrentAssignmentsSummary();
    const newAssignments = await getProfileAssignments(profileName);
    
    const diff = calculateDiff(currentAssignments, newAssignments);
    
    if (diff.length > 0) {
        let diffContent = '<div class="profile-diff">';
        diffContent += '<h4>Changes that will be applied:</h4>';
        
        diff.forEach(change => {
            diffContent += '<div class="diff-section ' + change.type + '">';
            diffContent += '<div class="diff-title">' + change.agent + '</div>';
            diffContent += '<div class="diff-content">';
            if (change.type === 'changed') {
                diffContent += '<span class="diff-from">' + change.from + '</span>';
                diffContent += '<span class="diff-arrow">→</span>';
                diffContent += '<span class="diff-to">' + change.to + '</span>';
            } else if (change.type === 'added') {
                diffContent += '<span class="diff-to">New: ' + change.to + '</span>';
            } else if (change.type === 'removed') {
                diffContent += '<span class="diff-from">Removed: ' + change.from + '</span>';
            }
            diffContent += '</div>';
            diffContent += '</div>';
        });
        
        diffContent += '<div style="margin-top: var(--spacing-lg); display: flex; gap: var(--spacing-sm)">';
        diffContent += '<button class="btn btn-primary" onclick="confirmActivateProfile(\'' + profileName + '\')">Confirm Switch</button>';
        diffContent += '<button class="btn btn-secondary" onclick="openProfileManagement()">Cancel</button>';
        diffContent += '</div>';
        diffContent += '</div>';
        
        showModal('Review Changes', diffContent);
    } else {
        await confirmActivateProfile(profileName);
    }
}

/**
 * Get current assignments summary
 */
function getCurrentAssignmentsSummary() {
    if (!state.currentConfig || !state.currentConfig.agents) return {};
    
    const summary = {};
    Object.entries(state.currentConfig.agents).forEach(([agent, config]) => {
        summary[agent] = {
            model: config.model || 'none',
            fallback_models: normalizeFallbackModels(config.fallback_models)
        };
    });
    return summary;
}

function extractPromptSection(rawPrompt, sectionTag) {
    if (!rawPrompt) return '';
    const regex = new RegExp('<' + sectionTag + '>([\\s\\S]*?)<\\/' + sectionTag + '>', 'i');
    const match = rawPrompt.match(regex);
    if (!match || !match[1]) return '';

    return match[1].replace(/\r/g, '').trim();
}

/**
 * Get profile assignments from server
 */
async function getProfileAssignments(profileName) {
    try {
        const response = await fetch('/api/profiles/' + encodeURIComponent(profileName));
        const data = await response.json();
        
        if (data.profile && data.profile.config && data.profile.config.agents) {
            const summary = {};
            Object.entries(data.profile.config.agents).forEach(([agent, config]) => {
                summary[agent] = {
                    model: config.model || 'none',
                    fallback_models: normalizeFallbackModels(config.fallback_models)
                };
            });
            return summary;
        }
        return {};
    } catch (error) {
        console.error('Failed to get profile:', error);
        return {};
    }
}

/**
 * Confirm and activate profile
 */
async function confirmActivateProfile(profileName) {
    try {
        const response = await fetch('/api/profiles/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentProfile = profileName;
            state.unsavedChanges = false;
            elements.saveBtn.disabled = true;
            
            await loadCurrentConfig();
            await loadProfiles();
            
            updateStatus('Switched to profile: ' + profileName, 'success');
            closeModal();
        } else {
            throw new Error(data.error || 'Failed to switch profile');
        }
    } catch (error) {
        console.error('Failed to switch profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Create new profile from current configuration
 */
async function createProfileFromCurrent() {
    const nameInput = document.getElementById('new-profile-name');
    const descInput = document.getElementById('new-profile-description');
    
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    
    if (!name) {
        alert('Please enter a profile name');
        return;
    }
    
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        alert('Profile name can only contain letters, numbers, hyphens, and underscores');
        return;
    }
    
    try {
        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                fromCurrent: true
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadProfiles();
            openProfileManagement();
            updateStatus('Created profile: ' + name, 'success');
        } else {
            throw new Error(data.error || 'Failed to create profile');
        }
    } catch (error) {
        console.error('Failed to create profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Import the currently active configuration as a new profile
 */
async function importCurrentConfig() {
    const name = prompt('Enter a name for this profile (e.g., backup-2025-02-11):');
    if (!name) return;
    
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        alert('Profile name can only contain letters, numbers, hyphens, and underscores');
        return;
    }
    
    try {
        const response = await fetch('/api/profiles/import-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description: 'Imported from active configuration on ' + new Date().toLocaleString()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadProfiles();
            openProfileManagement();
            updateStatus('Imported active config as profile: ' + name, 'success');
        } else {
            throw new Error(data.error || 'Failed to import profile');
        }
    } catch (error) {
        console.error('Failed to import profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Duplicate an existing profile
 */
async function duplicateProfile(profileName) {
    const newName = profileName + '-copy';
    
    try {
        const response = await fetch('/api/profiles/' + encodeURIComponent(profileName) + '/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadProfiles();
            openProfileManagement();
            updateStatus('Duplicated profile: ' + newName, 'success');
        } else {
            throw new Error(data.error || 'Failed to duplicate profile');
        }
    } catch (error) {
        console.error('Failed to duplicate profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Delete a profile
 */
async function deleteProfile(profileName) {
    if (!confirm('Are you sure you want to delete profile "' + profileName + '"? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/profiles/' + encodeURIComponent(profileName), {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadProfiles();
            openProfileManagement();
            updateStatus('Deleted profile: ' + profileName, 'success');
        } else {
            throw new Error(data.error || 'Failed to delete profile');
        }
    } catch (error) {
        console.error('Failed to delete profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Export a profile
 */
async function exportProfile(profileName) {
    try {
        const response = await fetch('/api/profiles/' + encodeURIComponent(profileName) + '/export');
        
        if (!response.ok) {
            throw new Error('Failed to export profile');
        }
        
        const data = await response.json();
        
        // Create download
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = profileName + '-profile.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('Exported profile: ' + profileName, 'success');
    } catch (error) {
        console.error('Failed to export profile:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Export all profiles
 */
async function exportAllProfiles() {
    try {
        const allProfiles = {};
        
        for (const profile of state.profiles) {
            const response = await fetch('/api/profiles/' + encodeURIComponent(profile.name) + '/export');
            if (response.ok) {
                allProfiles[profile.name] = await response.json();
            }
        }
        
        const blob = new Blob([JSON.stringify(allProfiles, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'omo-agent-config-profiles.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('Exported all profiles', 'success');
    } catch (error) {
        console.error('Failed to export profiles:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

/**
 * Handle profile import from file
 */
async function handleProfileImport(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Detect if it's a single profile or multiple
        const isMultiProfile = Object.keys(data).some(key => data[key] && data[key].config);
        
        let imported = 0;
        
        if (isMultiProfile) {
            // Multiple profiles
            for (const [name, profileData] of Object.entries(data)) {
                await importSingleProfile(name, profileData);
                imported++;
            }
        } else {
            // Single profile - use filename
            const name = file.name.replace('.json', '').replace('-profile', '');
            await importSingleProfile(name, data);
            imported++;
        }
        
        await loadProfiles();
        openProfileManagement();
        updateStatus('Imported ' + imported + ' profile(s)', 'success');
    } catch (error) {
        console.error('Failed to import profile:', error);
        updateStatus('Import error: ' + error.message, 'error');
        alert('Failed to import: ' + error.message);
    }
}

/**
 * Import a single profile
 */
async function importSingleProfile(name, profileData) {
    const response = await fetch('/api/profiles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description: profileData.description || 'Imported profile',
            config: profileData.config || profileData
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
    }
}

// Expose profile management functions
window.openProfileManagement = openProfileManagement;
window.activateProfile = activateProfile;
window.confirmActivateProfile = confirmActivateProfile;
window.createProfileFromCurrent = createProfileFromCurrent;
window.duplicateProfile = duplicateProfile;
window.deleteProfile = deleteProfile;
window.exportProfile = exportProfile;
window.exportAllProfiles = exportAllProfiles;
window.handleProfileImport = handleProfileImport;
window.undoLastChange = undoLastChange;

// Backup Management Functions

let currentBackups = [];

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return diffMins + ' min ago';
    if (diffHours < 24) return diffHours + ' hour' + (diffHours > 1 ? 's' : '') + ' ago';
    if (diffDays < 7) return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago';
    return date.toLocaleDateString();
}

async function refreshBackupsList() {
    const container = document.getElementById('backups-list-container');
    if (container) {
        container.innerHTML = '<div class="loading">Loading backups...</div>';
    }
    
    try {
        const response = await fetch('/api/backups');
        const data = await response.json();
        
        currentBackups = data.backups || [];
        renderBackupsList();
    } catch (error) {
        console.error('Failed to load backups:', error);
        if (container) {
            container.innerHTML = '<div class="error-message">Failed to load backups: ' + error.message + '</div>';
        }
    }
}

function renderBackupsList() {
    const container = document.getElementById('backups-list-container');
    if (!container) return;
    
    if (currentBackups.length === 0) {
        container.innerHTML = '<div class="no-results" style="padding: var(--spacing-md); text-align: center; color: var(--color-text-secondary)"><p>No backups yet</p><p style="font-size: 0.9em; margin-top: var(--spacing-sm)">Backups are created automatically when you save changes</p></div>';
        return;
    }
    
    let html = '<div class="backups-list" style="max-height: 300px; overflow-y: auto;">';
    
    currentBackups.forEach((backup, index) => {
        const timestamp = backup.timestamp;
        const size = formatBytes(backup.size);
        const createdAt = formatRelativeTime(backup.createdAt);
        const isFirst = index === 0;
        
        html += '<div class="backup-item" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); border-bottom: 1px solid var(--color-border); ' + (isFirst ? 'background: rgba(255, 215, 0, 0.1);' : '') + '">';
        html += '<div class="backup-info" style="flex: 1;">';
        html += '<div style="font-weight: 500;">' + timestamp + (isFirst ? ' <span style="color: #ffd700; font-size: 0.85em;">(latest)</span>' : '') + '</div>';
        html += '<div style="font-size: 0.85em; color: var(--color-text-secondary); display: flex; gap: var(--spacing-md); margin-top: 2px;">';
        html += '<span>📦 ' + size + '</span>';
        html += '<span>🕐 ' + createdAt + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<div class="backup-actions" style="display: flex; gap: var(--spacing-xs);">';
        html += '<button class="btn btn-secondary" style="font-size: 0.85em; padding: 4px 8px;" onclick="restoreBackup(\'' + timestamp + '\')">Restore</button>';
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<div style="margin-top: var(--spacing-sm); font-size: 0.85em; color: var(--color-text-secondary); text-align: center;">';
    html += 'Total: ' + currentBackups.length + ' backup' + (currentBackups.length > 1 ? 's' : '');
    html += '</div>';
    
    container.innerHTML = html;
}

async function restoreBackup(timestamp) {
    if (!confirm('Are you sure you want to restore backup from "' + timestamp + '"?\n\nThis will overwrite your current configuration. A safety backup will be created first.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/backups/' + encodeURIComponent(timestamp) + '/restore', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadCurrentConfig();
            await loadProfiles();
            updateStatus('Restored backup from ' + timestamp, 'success');
            closeModal();
        } else {
            throw new Error(data.error || 'Failed to restore backup');
        }
    } catch (error) {
        console.error('Failed to restore backup:', error);
        updateStatus('Error restoring backup: ' + error.message, 'error');
    }
}

async function openPurgeBackupsModal() {
    try {
        const response = await fetch('/api/backups/purge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: true, keepNewest: 10, keepDays: 7 })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const toDelete = data.toDelete || [];
        const kept = data.kept || [];

        const totalBytesToFree = toDelete.reduce((sum, backup) => sum + (backup.size || 0), 0);

        let content = '<div class="purge-preview">';
        content += '<h4>🗑️ Purge Old Backups (Preview)</h4>';

        if (toDelete.length === 0) {
            content += '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">';
            content += '<p>No backups to purge</p>';
            content += '<p style="font-size: 0.9em; margin-top: var(--spacing-sm)">Keeping ' + kept.length + ' backup' + (kept.length > 1 ? 's' : '') + ' (newest 10, or within 7 days)</p>';
            content += '</div>';
        } else {
            content += '<div style="margin-bottom: var(--spacing-md);">';
            content += '<p>Would delete <strong>' + toDelete.length + '</strong> backup' + (toDelete.length > 1 ? 's' : '') + ' (<strong>' + formatBytes(totalBytesToFree) + '</strong>)</p>';
            content += '</div>';

            content += '<div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 4px; margin-bottom: var(--spacing-md);">';
            toDelete.forEach(backup => {
                content += '<div style="padding: var(--spacing-sm); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between;">';
                content += '<span>' + backup.timestamp + '</span>';
                content += '<span style="color: var(--color-text-secondary);">' + formatBytes(backup.size) + '</span>';
                content += '</div>';
            });
            content += '</div>';

            content += '<div style="background: rgba(255, 193, 7, 0.1); padding: var(--spacing-md); border-radius: 4px; margin-bottom: var(--spacing-md);">';
            content += '<p style="margin: 0; color: var(--color-warning);"><strong>Keeping ' + kept.length + ' backup' + (kept.length > 1 ? 's' : '') + ':</strong></p>';
            content += '<p style="margin: var(--spacing-xs) 0 0 0; font-size: 0.85em; color: var(--color-text-secondary);">• 10 newest backups<br>• Backups from last 7 days</p>';
            content += '</div>';

            content += '<div style="background: rgba(33, 150, 243, 0.1); padding: var(--spacing-md); border-radius: 4px; margin-bottom: var(--spacing-md); border-left: 3px solid var(--color-info, #2196f3);">';
            content += '<p style="margin: 0; font-size: 0.9em; color: var(--color-text-secondary);">';
            content += '<strong>ℹ️ Soft-Delete:</strong> These backups will be moved to trash and can be recovered from your system\'s trash/recycle bin if needed.';
            content += '</p>';
            content += '</div>';

            content += '<div style="display: flex; gap: var(--spacing-sm); justify-content: center;">';
            content += '<button class="btn btn-primary" style="background-color: var(--color-error);" onclick="confirmPurgeBackups(' + totalBytesToFree + ')">🗑️ Confirm Purge</button>';
            content += '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>';
            content += '</div>';
        }

        content += '</div>';

        showModal('Purge Backups', content);
    } catch (error) {
        console.error('Failed to preview purge:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

async function confirmPurgeBackups(totalBytesToFree) {
    try {
        const response = await fetch('/api/backups/purge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: false, keepNewest: 10, keepDays: 7 })
        });

        const data = await response.json();

        if (data.success) {
            const bytesFreed = totalBytesToFree || data.totalBytesFreed || 0;
            updateStatus('Deleted ' + data.deleted.length + ' backup' + (data.deleted.length > 1 ? 's' : '') + ' (' + formatBytes(bytesFreed) + ' freed)', 'success');
            refreshBackupsList();

            setTimeout(() => {
                openProfileManagement();
            }, 500);
        } else {
            throw new Error(data.error || 'Failed to purge backups');
        }
    } catch (error) {
        console.error('Failed to purge backups:', error);
        updateStatus('Error purging backups: ' + error.message, 'error');
    }
}

// Expose backup management functions
window.refreshBackupsList = refreshBackupsList;
window.restoreBackup = restoreBackup;
window.openPurgeBackupsModal = openPurgeBackupsModal;
window.confirmPurgeBackups = confirmPurgeBackups;

// Agent Documentation Functions

let agentDocs = [];
let newAgentsAvailable = [];

/**
 * Open agent documentation modal
 */
async function openAgentDocumentation() {
    setLoading(true, 'Loading agent documentation...');
    
    try {
        // Check for new agents first
        const discoverResponse = await fetch('/api/agents/discover');
        const discoverData = await discoverResponse.json();
        newAgentsAvailable = discoverData.newAgents || [];
        
        // Load agent docs
        const response = await fetch('/api/agents');
        const data = await response.json();
        
        agentDocs = data.agents || [];
        
        renderAgentList();
    } catch (error) {
        console.error('Failed to load agents:', error);
        showModal('Error', '<p>Failed to load agent documentation: ' + error.message + '</p>');
    } finally {
        setLoading(false);
    }
}

/**
 * Render agent list in modal
 */
function renderAgentList() {
    let content = '<div class="agent-list-view">';
    
    // Show new agents alert if any
    if (newAgentsAvailable.length > 0) {
        content += '<div class="new-agent-alert">';
        content += '<h4>🆕 New Agents Available</h4>';
        content += '<div class="new-agent-list">';
        newAgentsAvailable.forEach(agent => {
            content += '<div class="new-agent-item">';
            content += '<span>' + agent.name;
            if (agent.isProfiled === false) {
                content += ' <span class="badge unprofiled-badge" title="This agent has no local scoring profile. It will use heuristic scoring instead of tailored recommendations.">(unprofiled)</span>';
            }
            content += '</span>';
            content += '<button class="btn btn-primary" onclick="integrateNewAgent(\'' + agent.name + '\')">Add to Profile</button>';
            content += '</div>';
        });
        content += '</div></div>';
    }
    
    // Agent list
    agentDocs.forEach(agent => {
        const costClass = agent.cost.toLowerCase();
        const currentModel = getCurrentModelForAgent(agent.name);
        
        content += '<div class="agent-item" onclick="viewAgentDetail(\'' + agent.name + '\')">';
         content += '<div class="agent-header">';
         content += '<div class="agent-title">';
         content += '<span class="agent-name">' + (agent.displayName || agent.name) + '</span>';
         content += '<span class="agent-cost-badge ' + costClass + '">' + agent.cost + '</span>';
         if (agent.access) {
             content += '<span class="agent-cost-badge" style="margin-left: var(--spacing-xs);">' + agent.access + '</span>';
         }
         content += '</div>';
        if (currentModel) {
            content += '<span class="badge context">' + currentModel.split('/').pop() + '</span>';
        }
        content += '</div>';
        
        content += '<div class="agent-description">' + (agent.summary || agent.description || 'No description available') + '</div>';
        
        content += '<div class="agent-meta">';
        content += '<span>Category: ' + agent.category + '</span>';
        content += '<span>Min Context: ' + formatContext(agent.minContext) + '</span>';
        if (agent.thinking) {
            content += '<span>💭 Thinking</span>';
        }
        content += '</div>';
        
        if (agent.capabilities && agent.capabilities.length > 0) {
            content += '<div class="agent-capabilities">';
            agent.capabilities.forEach(cap => {
                content += '<span class="agent-capability">' + cap + '</span>';
            });
            content += '</div>';
        }
        
        content += '</div>';
    });
    
    content += '</div>';
    
    content += '<div style="margin-top: var(--spacing-lg); padding-top: var(--spacing-lg); border-top: 1px solid var(--color-border); display: flex; justify-content: space-between;">';
    content += '<button class="btn btn-secondary" onclick="refreshAgentDocs()">🔄 Refresh from GitHub</button>';
    content += '<button class="btn btn-secondary" onclick="checkForNewAgents()">🔍 Check for New Agents</button>';
    content += '</div>';
    
    showModal('Agent Documentation', content);
}

/**
 * Format context size for display
 */
function calculateDiff(current, newAssignments) {
    const diff = [];
    const allAgents = new Set([...Object.keys(current), ...Object.keys(newAssignments)]);
    
    allAgents.forEach(agent => {
        const currentAssign = current[agent];
        const newAssign = newAssignments[agent];
        
        const currentModel = currentAssign ? currentAssign.model : null;
        const newModel = newAssign ? newAssign.model : null;
        const currentFallback = currentAssign ? normalizeFallbackModels(currentAssign.fallback_models) : [];
        const newFallback = newAssign ? normalizeFallbackModels(newAssign.fallback_models) : [];
        const fallbackDiff = calculateFallbackDiff(currentFallback, newFallback);
        const modelChanged = currentModel !== newModel;
        
        if (currentModel && newModel && modelChanged) {
            diff.push({ 
                type: 'changed', 
                agent, 
                from: currentModel, 
                to: newModel, 
                fallbackDiff: fallbackDiff.hasChanges ? fallbackDiff : null
            });
        } else if (fallbackDiff.hasChanges && currentModel && newModel && !modelChanged) {
            diff.push({
                type: 'fallback_changed',
                agent,
                model: currentModel,
                fallbackDiff: fallbackDiff
            });
        } else if (!currentModel && newModel) {
            diff.push({ 
                type: 'added', 
                agent, 
                to: newModel, 
                fallbackDiff: fallbackDiff.hasChanges ? fallbackDiff : null
            });
        } else if (currentModel && !newModel) {
            diff.push({ 
                type: 'removed', 
                agent, 
                from: currentModel, 
                fallbackDiff: { oldOrder: currentFallback, reordered: false, added: [], removed: [], hasChanges: false }
            });
        }
    });
    
    return diff;
}

/**
 * Format context size for display
 */
function formatContext(context) {
    if (context >= 1000000) return (context / 1000000).toFixed(1) + 'M';
    if (context >= 1000) return (context / 1000).toFixed(0) + 'K';
    return context.toString();
}

/**
 * View agent detail
 */
async function viewAgentDetail(agentName) {
    try {
        const response = await fetch('/api/agents/' + encodeURIComponent(agentName));
        const data = await response.json();
        const fullAgent = data.agent;
        
        let content = '<div class="agent-detail">';
        
        // Header section
        content += '<div class="agent-section">';
        content += '<h4>🤖 ' + (fullAgent.displayName || fullAgent.name) + '</h4>';
        const summaryText = fullAgent.summary || '';
        const descriptionText = fullAgent.description || '';
        const primaryDescription = summaryText || descriptionText || 'No description available';
        content += '<p>' + primaryDescription + '</p>';
        if (summaryText && descriptionText && summaryText !== descriptionText) {
            content += '<p class="agent-detail-extra">' + descriptionText + '</p>';
        }
        content += '<div class="agent-meta">';
        content += '<span>Category: ' + fullAgent.category + '</span>';
        content += '<span>Cost: ' + fullAgent.cost + '</span>';
        if (fullAgent.access) {
            content += '<span>Access: ' + fullAgent.access + '</span>';
        }
        content += '<span>Min Context: ' + formatContext(fullAgent.minContext) + '</span>';
        if (fullAgent.thinking) {
            content += '<span>💭 Extended Thinking</span>';
        }
        content += '</div>';
        content += '</div>';

        if (fullAgent.usage && fullAgent.usage.length > 0) {
            content += '<div class="agent-section">';
            content += '<h4>Best Utilization</h4>';
            content += '<ul>';
            fullAgent.usage.forEach(item => {
                content += '<li>' + item + '</li>';
            });
            content += '</ul>';
            content += '</div>';
        }

        const roleSection = extractPromptSection(fullAgent.rawPrompt, 'Role');
        if (roleSection) {
            content += '<div class="agent-section">';
            content += '<h4>Role Context</h4>';
            content += '<div class="agent-prompt-preview">' + roleSection.slice(0, 1200) + (roleSection.length > 1200 ? '...' : '') + '</div>';
            content += '</div>';
        }

        const behaviorSection = extractPromptSection(fullAgent.rawPrompt, 'Behavior_Instructions');
        if (behaviorSection) {
            content += '<div class="agent-section">';
            content += '<h4>How It Operates</h4>';
            content += '<div class="agent-prompt-preview">' + behaviorSection.slice(0, 1400) + (behaviorSection.length > 1400 ? '...' : '') + '</div>';
            content += '</div>';
        }

        if (fullAgent.caveats && fullAgent.caveats.length > 0) {
            content += '<div class="agent-section">';
            content += '<h4>Caveats</h4>';
            content += '<ul>';
            fullAgent.caveats.forEach(item => {
                content += '<li>' + item + '</li>';
            });
            content += '</ul>';
            content += '</div>';
        }
        
        // Role section
        if (fullAgent.role && fullAgent.role.identity) {
            content += '<div class="agent-section">';
            content += '<h4>Role & Identity</h4>';
            content += '<p>' + fullAgent.role.identity + '</p>';
            if (fullAgent.role.coreCompetencies && fullAgent.role.coreCompetencies.length > 0) {
                content += '<p style="margin-top: var(--spacing-sm);"><strong>Core Competencies:</strong></p>';
                content += '<ul>';
                fullAgent.role.coreCompetencies.forEach(comp => {
                    content += '<li>' + comp + '</li>';
                });
                content += '</ul>';
            }
            content += '</div>';
        }
        
        // Behaviors
        if (fullAgent.behaviors && fullAgent.behaviors.length > 0) {
            content += '<div class="agent-section">';
            content += '<h4>Key Behaviors</h4>';
            content += '<div class="agent-behaviors">';
            fullAgent.behaviors.slice(0, 5).forEach(behavior => {
                content += '<div class="behavior-item">';
                content += '<div class="behavior-title">' + (behavior.title || behavior.phase || 'Behavior') + '</div>';
                if (behavior.description) {
                    content += '<div class="behavior-desc">' + behavior.description + '</div>';
                }
                content += '</div>';
            });
            content += '</div>';
            content += '</div>';
        }
        
        // Tool access
        if (fullAgent.toolAccess) {
            content += '<div class="agent-section">';
            content += '<h4>Tool Access</h4>';
            content += '<div class="agent-tools">';
            
            if (fullAgent.toolAccess.allowed && fullAgent.toolAccess.allowed.length > 0) {
                content += '<div class="tools-list">';
                content += '<h5>✅ Allowed</h5>';
                fullAgent.toolAccess.allowed.forEach(tool => {
                    content += '<div class="tool-item allowed">' + tool + '</div>';
                });
                content += '</div>';
            }
            
            if (fullAgent.toolAccess.denied && fullAgent.toolAccess.denied.length > 0) {
                content += '<div class="tools-list">';
                content += '<h5>❌ Denied</h5>';
                fullAgent.toolAccess.denied.forEach(tool => {
                    content += '<div class="tool-item denied">' + tool + '</div>';
                });
                content += '</div>';
            }
            
            content += '</div>';
            content += '</div>';
        }
        
        // Configured Fallback Models (user-configured)
        const configuredFallbacks = fullAgent.configuredFallbackModels || [];
        if (configuredFallbacks.length > 0) {
            content += '<div class="agent-section fallback-section configured">';
            content += '<h4>⚙️ Configured Fallback Models</h4>';
            content += '<p class="fallback-description">Your manually configured fallbacks. If the primary model fails, these will be tried in order:</p>';
            content += '<ol class="fallback-list">';
            configuredFallbacks.forEach(model => {
                content += '<li><code>' + escapeHtml(model) + '</code></li>';
            });
            content += '</ol>';
            content += '<button class="btn btn-small btn-secondary" onclick="openFallbackEditor(\'' + agentName + '\')">Edit Fallbacks</button>';
            content += '</div>';
        } else {
            content += '<div class="agent-section fallback-section configured empty">';
            content += '<h4>⚙️ Configured Fallback Models</h4>';
            content += '<p class="fallback-description">No fallback models configured. Add fallbacks to ensure graceful degradation if the primary model is unavailable.</p>';
            content += '<button class="btn btn-small btn-secondary" onclick="openFallbackEditor(\'' + agentName + '\')">Add Fallbacks</button>';
            content += '</div>';
        }

        // Upstream Recommendation Chain (from Oh My OpenCode)
        if (fullAgent.fallbackChain && fullAgent.fallbackChain.length > 0) {
            content += '<div class="agent-section fallback-section upstream">';
            content += '<h4>🔗 Upstream Recommendation Chain</h4>';
            content += '<p class="fallback-description">Recommended by Oh My OpenCode maintainers. These are suggestions, not your active configuration:</p>';
            content += '<ol class="fallback-list">';
            fullAgent.fallbackChain.forEach(model => {
                content += '<li><code>' + escapeHtml(model) + '</code></li>';
            });
            content += '</ol>';
            content += '</div>';
        }
        
        // Recommended model
        if (fullAgent.recommendedModel) {
            content += '<div class="agent-recommended">';
            content += '<h4>⭐ Recommended Model</h4>';
            content += '<div class="recommended-model">';
            content += '<span>' + fullAgent.recommendedModel.name + '</span>';
            content += '<button class="btn btn-primary" onclick="assignModelToAgent(\'' + fullAgent.recommendedModel.id + '\', \'' + agentName + '\'); closeModal();">Use This Model</button>';
            content += '</div>';
            content += '</div>';
        }
        
        // Raw prompt preview
        if (fullAgent.rawPrompt) {
            content += '<div class="agent-section">';
            content += '<h4>System Prompt Preview</h4>';
            content += '<div class="agent-prompt-preview">' + fullAgent.rawPrompt.substring(0, 500) + '...</div>';
            content += '</div>';
        }
        
        content += '<div class="agent-actions">';
        content += '<button class="btn btn-secondary" onclick="renderAgentList()">← Back to List</button>';
        const currentModel = getCurrentModelForAgent(agentName);
        if (currentModel) {
            content += '<button class="btn btn-primary" onclick="viewAlternatives(\'' + agentName + '\')">Change Model</button>';
        }
        content += '</div>';
        
        content += '</div>';
        
        showModal('Agent: ' + (fullAgent.displayName || fullAgent.name), content);
    } catch (error) {
        console.error('Failed to load agent detail:', error);
        updateStatus('Error loading agent details: ' + error.message, 'error');
    }
}

/**
 * Refresh agent docs from GitHub
 */
async function refreshAgentDocs() {
    setLoading(true, 'Refreshing agent documentation from GitHub...');
    
    try {
        const response = await fetch('/api/agents/refresh', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            updateStatus('Updated ' + data.updated.length + ' agents from GitHub', 'success');
            await openAgentDocumentation(); // Reload
        } else {
            throw new Error(data.error || 'Refresh failed');
        }
    } catch (error) {
        console.error('Failed to refresh agents:', error);
        updateStatus('Error refreshing agents: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Check for new agents
 */
async function checkForNewAgents() {
    setLoading(true, 'Checking for new agents...');
    
    try {
        const response = await fetch('/api/agents/discover');
        const data = await response.json();
        
        newAgentsAvailable = data.newAgents || [];
        
        if (newAgentsAvailable.length > 0) {
            updateStatus('Found ' + newAgentsAvailable.length + ' new agent(s)!', 'success');
            renderAgentList(); // Re-render to show new agents
        } else {
            updateStatus('No new agents found', 'info');
        }
    } catch (error) {
        console.error('Failed to check for new agents:', error);
        updateStatus('Error checking for agents: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Integrate new agent into current profile
 */
async function integrateNewAgent(agentName) {
    const agent = newAgentsAvailable.find(a => a.name === agentName);
    if (!agent) return;
    
    try {
        // Get full agent details to find recommended model
        const response = await fetch('/api/agents/' + encodeURIComponent(agentName));
        const data = await response.json();
        const fullAgent = data.agent;
        
        if (fullAgent.recommendedModel) {
            // Add to current config
            if (!state.currentConfig.agents) {
                state.currentConfig.agents = {};
            }
            
            state.currentConfig.agents[agentName] = {
                model: fullAgent.recommendedModel.id
            };
            
            markUnsaved();

            
            // Remove from new agents list
            newAgentsAvailable = newAgentsAvailable.filter(a => a.name !== agentName);
            renderAgentList(); // Re-render
            
            updateStatus('Added ' + agentName + ' with recommended model', 'success');
        } else {
            alert('No recommended model found for ' + agentName);
        }
    } catch (error) {
        console.error('Failed to integrate agent:', error);
        updateStatus('Error integrating agent: ' + error.message, 'error');
    }
}

// Expose agent documentation functions
window.openAgentDocumentation = openAgentDocumentation;
window.viewAgentDetail = viewAgentDetail;
window.refreshAgentDocs = refreshAgentDocs;
window.checkForNewAgents = checkForNewAgents;
window.integrateNewAgent = integrateNewAgent;

// Provider Comparison Function
async function compareProviders(modelId) {
    try {
        const response = await fetch('/api/models/' + encodeURIComponent(modelId) + '/compare');
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        let content = '<div class="provider-comparison">';
        content += '<h3 style="margin-bottom: var(--spacing-md);">Comparing ' + data.modelName + '</h3>';
        content += '<p style="color: var(--color-text-secondary); margin-bottom: var(--spacing-lg);">Available from ' + data.totalVariants + ' providers. Sorted by overall value.</p>';
        
        content += '<div class="comparison-list">';
        data.variants.forEach((variant, index) => {
            const isBest = variant.isBest;
            const costClass = variant.model.costDisplay ? 
                (variant.model.costDisplay.includes('$$$$') ? 'expensive' : 
                 variant.model.costDisplay.includes('$$') ? 'moderate' : 'cheap') : '';
            
            content += '<div class="comparison-item ' + (isBest ? 'best' : '') + '">';
            content += '<div class="comparison-header">';
            content += '<div class="comparison-rank">#' + (index + 1) + '</div>';
            content += '<div class="comparison-provider">';
            content += '<span class="model-provider ' + variant.provider + '">' + variant.provider + '</span>';
            if (isBest) {
                content += '<span style="color: #ffd700; margin-left: var(--spacing-sm);">⭐ Recommended</span>';
            }
            content += '</div>';
            content += '</div>';
            
            content += '<div class="comparison-details">';
            content += '<div class="comparison-stat">';
            content += '<span class="stat-label">Cost:</span>';
            content += '<span class="stat-value ' + costClass + '">' + (variant.model.costDisplay || 'Free') + '</span>';
            content += '</div>';
            content += '<div class="comparison-stat">';
            content += '<span class="stat-label">Context:</span>';
            content += '<span class="stat-value">' + variant.model.contextDisplay + '</span>';
            content += '</div>';
            content += '<div class="comparison-stat">';
            content += '<span class="stat-label">Capabilities:</span>';
            content += '<span class="stat-value">' + variant.model.badges.join(', ') + '</span>';
            content += '</div>';
            content += '</div>';
            
            if (variant.recommendation && !isBest) {
                content += '<div class="comparison-note">' + variant.recommendation + '</div>';
            }
            
            content += '<div class="comparison-actions">';
            content += '<button class="btn btn-primary" onclick="promptAssignToAgent(\'' + variant.model.id + '\')">Use This Provider</button>';
            content += '</div>';
            
            content += '</div>';
        });
        content += '</div>';
        
        content += '</div>';
        
        showModal('Provider Comparison', content);
    } catch (error) {
        console.error('Failed to compare providers:', error);
        updateStatus('Error: ' + error.message, 'error');
    }
}

// Helper to get currently selected agent (for assignment)
function getSelectedAgent() {
    // Try to find an agent that's currently using this model type
    if (state.currentConfig && state.currentConfig.agents) {
        const agents = Object.keys(state.currentConfig.agents);
        return agents.length > 0 ? agents[0] : null;
    }
    return null;
}

// Expose comparison function
window.compareProviders = compareProviders;

// Prompt user to select which agent to assign model to
function promptAssignToAgent(modelId) {
    const model = state.models.find(m => m.id === modelId);
    if (!model) return;
    
    // Get all available agents
    const agents = state.currentConfig && state.currentConfig.agents ? 
        Object.keys(state.currentConfig.agents) : [];
    
    if (agents.length === 0) {
        alert('No agents available to assign this model to.');
        return;
    }
    
    let content = '<div class="assign-prompt">';
    content += '<h3>Assign Model to Agent</h3>';
    content += '<p>Select which agent should use <strong>' + (model.name || modelId) + '</strong>:</p>';
    content += '<div class="agent-selection-list">';
    
    agents.forEach(agent => {
        const currentModel = state.currentConfig.agents[agent].model;
        const currentModelName = currentModel ? currentModel.split('/').pop() : 'none';
        
        content += '<button class="btn btn-secondary agent-select-btn" onclick="assignModelToAgent(\'' + modelId + '\', \'' + agent + '\'); closeModal();">';
        content += '<div class="agent-select-name">' + agent + '</div>';
        content += '<div class="agent-select-current">Currently: ' + currentModelName + '</div>';
        content += '</button>';
    });
    
    content += '</div>';
    content += '<button class="btn btn-text" onclick="closeModal()" style="margin-top: var(--spacing-md)">Cancel</button>';
    content += '</div>';
    
    showModal('Select Agent', content);
}

// Expose new function
window.promptAssignToAgent = promptAssignToAgent;

// Expose agent configuration functions

window.renderAgentConfigView = renderAgentConfigView;
window.changeAgentModel = changeAgentModel;
window.viewAgentDetails = viewAgentDetails;
window.showAgentModelSelector = showAgentModelSelector;
window.importCurrentConfig = importCurrentConfig;
window.openProviderPolicies = openProviderPolicies;
window.saveProviderPolicies = saveProviderPolicies;
window.resetProviderPolicies = resetProviderPolicies;

// ===========================================
// Provider Diagnostics
// ===========================================

let providerDiagnosticsCache = null;

async function loadProviderDiagnostics() {
    try {
        const response = await fetch('/api/providers/diagnostics');
        const data = await response.json();
        if (data.error) {
            console.warn('Provider diagnostics error:', data.error);
            return;
        }
        state.providerDiagnostics = data;
        providerDiagnosticsCache = data;
        updateProviderDiagnosticsBanner();
    } catch (error) {
        console.warn('Failed to load provider diagnostics:', error);
    }
}

function updateProviderDiagnosticsBanner() {
    const banner = document.getElementById('provider-diagnostics-banner');
    if (!banner) return;
    
    const diagnostics = state.providerDiagnostics;
    if (!diagnostics) {
        banner.classList.add('hidden');
        return;
    }
    
    const mismatches = diagnostics.mismatches || {};
    const expectedButMissing = mismatches.expectedButMissing || [];
    
    // Show banner only if there are expected but missing providers
    if (expectedButMissing.length === 0) {
        banner.classList.add('hidden');
        return;
    }
    
    banner.classList.remove('hidden');
    
    const summaryEl = banner.querySelector('.banner-summary');
    if (summaryEl) {
        const providerNames = expectedButMissing.map(function(m) { return m.provider || m; }).join(', ');
        summaryEl.textContent = expectedButMissing.length + ' provider mismatch(es) detected: ' + providerNames;
    }
    
    // Wire the View Details button
    const viewDetailsBtn = banner.querySelector('.view-details-btn');
    if (viewDetailsBtn && !viewDetailsBtn.hasAttribute('data-wired')) {
        viewDetailsBtn.setAttribute('data-wired', 'true');
        viewDetailsBtn.addEventListener('click', showProviderDiagnosticsModal);
    }
}

async function openProviderDiagnostics() {
    setLoading(true, 'Loading provider diagnostics...');
    try {
        let diagnostics = providerDiagnosticsCache;
        
        // Always fetch fresh data when opening modal
        const response = await fetch('/api/providers/diagnostics');
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        diagnostics = data;
        providerDiagnosticsCache = diagnostics;
        
        renderProviderDiagnosticsModal(diagnostics);
    } catch (error) {
        console.error('Failed to load provider diagnostics:', error);
        showModal('Error', '<p>Failed to load provider diagnostics: ' + escapeHtml(error.message) + '</p>');
    } finally {
        setLoading(false);
    }
}

function renderProviderDiagnosticsModal(diagnostics) {
    const sources = diagnostics.sources || {};
    const normalized = diagnostics.normalized || {};
    const mismatches = diagnostics.mismatches || {};
    const cacheStatus = diagnostics.cacheStatus || {};
    const policy = diagnostics.policy || {};
    const hints = diagnostics.hints || [];
    
    let content = '<div class="diagnostics-modal-content">';
    
    // Generated timestamp
    if (diagnostics.generatedAt) {
        content += '<div class="diagnostics-timestamp">Generated: ' + escapeHtml(new Date(diagnostics.generatedAt).toLocaleString()) + '</div>';
    }
    
    // Expected Sources Section
    content += '<div class="diagnostics-section">';
    content += '<h3>Expected Sources</h3>';
    content += '<div class="diagnostics-sources">';
    
    // fromConfig
    const fromConfig = sources.fromConfig || {};
    content += '<div class="diagnostics-source-group">';
    content += '<h4>From Config</h4>';
    if (Object.keys(fromConfig).length === 0) {
        content += '<p class="diagnostics-empty">No providers configured</p>';
    } else {
        content += '<ul class="diagnostics-list">';
        Object.entries(fromConfig).forEach(function(entry) {
            const provider = entry[0];
            const modelCount = entry[1];
            content += '<li><span class="provider-name">' + escapeHtml(provider) + '</span>';
            if (modelCount !== undefined) {
                content += ' <span class="model-count">(' + modelCount + ' models)</span>';
            }
            content += '</li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    
    // fromAssignments
    const fromAssignments = sources.fromAssignments || {};
    content += '<div class="diagnostics-source-group">';
    content += '<h4>From Agent Assignments</h4>';
    if (Object.keys(fromAssignments).length === 0) {
        content += '<p class="diagnostics-empty">No agent assignments</p>';
    } else {
        content += '<ul class="diagnostics-list">';
        Object.entries(fromAssignments).forEach(function(entry) {
            const provider = entry[0];
            const agents = entry[1];
            content += '<li><span class="provider-name">' + escapeHtml(provider) + '</span>';
            if (Array.isArray(agents)) {
                content += ' <span class="agent-count">(' + agents.length + ' agents)</span>';
            }
            content += '</li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    content += '</div>'; // .diagnostics-sources
    content += '</div>'; // .diagnostics-section
    
    // Discovered Providers Section
    content += '<div class="diagnostics-section">';
    content += '<h3>Discovered Providers</h3>';
    const discovered = normalized.discovered || [];
    if (discovered.length === 0) {
        content += '<p class="diagnostics-empty">No providers discovered from CLI</p>';
    } else {
        content += '<ul class="diagnostics-list discovered-list">';
        discovered.forEach(function(provider) {
            content += '<li class="discovered-item"><span class="provider-name">' + escapeHtml(provider) + '</span></li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    
    // Mismatches Section
    const expectedButMissing = mismatches.expectedButMissing || [];
    const discoveredNotExpected = mismatches.discoveredNotExpected || [];
    const aliasNormalizedMatches = mismatches.aliasNormalizedMatches || [];
    
    content += '<div class="diagnostics-section">';
    content += '<h3>Mismatches</h3>';
    
    // Expected but missing
    content += '<div class="mismatch-category">';
    content += '<h4 class="mismatch-title missing">Expected but Missing (' + expectedButMissing.length + ')</h4>';
    if (expectedButMissing.length === 0) {
        content += '<p class="diagnostics-empty">None</p>';
    } else {
        content += '<ul class="diagnostics-list mismatch-list">';
        expectedButMissing.forEach(function(item) {
            content += '<li class="mismatch-item missing"><span class="mismatch-provider">' + escapeHtml(item.provider) + '</span> <span class="mismatch-severity">(' + escapeHtml(item.severity) + ')</span>: ' + escapeHtml(item.message) + '</li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    
    // Discovered but not expected
    content += '<div class="mismatch-category">';
    content += '<h4 class="mismatch-title unexpected">Discovered (Not Expected) (' + discoveredNotExpected.length + ')</h4>';
    if (discoveredNotExpected.length === 0) {
        content += '<p class="diagnostics-empty">None</p>';
    } else {
        content += '<ul class="diagnostics-list mismatch-list">';
        discoveredNotExpected.forEach(function(item) {
            content += '<li class="mismatch-item unexpected"><span class="mismatch-provider">' + escapeHtml(item.provider) + '</span> <span class="mismatch-severity">(' + escapeHtml(item.severity) + ')</span>: ' + escapeHtml(item.message) + '</li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    
    // Alias normalized matches
    content += '<div class="mismatch-category">';
    content += '<h4 class="mismatch-title alias">Alias Normalized (' + aliasNormalizedMatches.length + ')</h4>';
    if (aliasNormalizedMatches.length === 0) {
        content += '<p class="diagnostics-empty">None</p>';
    } else {
        content += '<ul class="diagnostics-list mismatch-list">';
        aliasNormalizedMatches.forEach(function(item) {
            content += '<li class="mismatch-item alias"><span class="mismatch-provider">' + escapeHtml(item.provider) + '</span> <span class="mismatch-severity">(' + escapeHtml(item.severity) + ')</span>: ' + escapeHtml(item.message) + '</li>';
        });
        content += '</ul>';
    }
    content += '</div>';
    content += '</div>'; // .diagnostics-section
    
    // Cache Status Section
    content += '<div class="diagnostics-section">';
    content += '<h3>Cache Status</h3>';
    content += '<div class="cache-status">';
    if (cacheStatus.exists) {
        content += '<div class="cache-exists">✓ Cache exists</div>';
        if (cacheStatus.timestamp) {
            content += '<div class="cache-timestamp">Timestamp: ' + escapeHtml(new Date(cacheStatus.timestamp).toLocaleString()) + '</div>';
        }
        if (cacheStatus.ageMs !== undefined) {
            const ageSeconds = Math.floor(cacheStatus.ageMs / 1000);
            const ageMinutes = Math.floor(ageSeconds / 60);
            const ageHours = Math.floor(ageMinutes / 60);
            let ageStr = '';
            if (ageHours > 0) {
                ageStr = ageHours + 'h ' + (ageMinutes % 60) + 'm ago';
            } else if (ageMinutes > 0) {
                ageStr = ageMinutes + 'm ' + (ageSeconds % 60) + 's ago';
            } else {
                ageStr = ageSeconds + 's ago';
            }
            content += '<div class="cache-age">Age: ' + escapeHtml(ageStr) + '</div>';
        }
    } else {
        content += '<div class="cache-missing">⚠ No cache exists</div>';
    }
    content += '</div>';
    content += '</div>';
    
    // LM Studio Policy Section
    content += '<div class="diagnostics-section">';
    content += '<h3>LM Studio Policy</h3>';
    const lmStudioPolicy = policy.lmStudio || {};
    content += '<div class="diagnostics-policy">';
    if (lmStudioPolicy.customDetection === false) {
        content += '<div class="policy-item">🔒 Custom detection disabled, CLI-driven discovery only</div>';
    } else if (lmStudioPolicy.customDetection === true) {
        content += '<div class="policy-item">🔓 Custom detection enabled</div>';
    } else {
        content += '<div class="policy-item">Default policy (CLI-driven discovery)</div>';
    }
    if (lmStudioPolicy.reason) {
        content += '<div class="policy-reason">Reason: ' + escapeHtml(lmStudioPolicy.reason) + '</div>';
    }
    content += '</div>';
    content += '</div>';
    
    // Remediation Hints Section
    if (hints.length > 0) {
        content += '<div class="diagnostics-section">';
        content += '<h3>Remediation Hints</h3>';
        content += '<ul class="diagnostics-hints">';
        hints.forEach(function(hint) {
            content += '<li class="hint-item">💡 ' + escapeHtml(hint) + '</li>';
        });
        content += '</ul>';
        content += '</div>';
    }
    
    // Actions
    content += '<div class="diagnostics-actions">';
    content += '<button class="btn btn-secondary" onclick="refreshModelsCache()">🔄 Refresh Models Cache</button>';
    content += '<button class="btn btn-text" onclick="closeModal()">Close</button>';
    content += '</div>';
    
    content += '</div>'; // .diagnostics-modal-content
    
    showModal('Provider Diagnostics', content);
}

async function refreshModelsCache() {
    setLoading(true, 'Refreshing models cache...');
    try {
        await loadModels(true);
        updateStatus('Models cache refreshed', 'success');
        // Refresh diagnostics after cache refresh
        await loadProviderDiagnostics();
        // Re-open the modal with fresh data
        if (providerDiagnosticsCache) {
            renderProviderDiagnosticsModal(providerDiagnosticsCache);
        }
    } catch (error) {
        console.error('Failed to refresh models cache:', error);
        updateStatus('Failed to refresh models cache: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

// Simple HTML escape helper
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

 // Alias for showProviderDiagnosticsModal used by banner button
function showProviderDiagnosticsModal() {
    openProviderDiagnostics();
}

;

/**
 * Validate provider/model ID format
 * Matches backend logic in lib/core/fallback-models.js
 * @param {string} str - Value to validate
 * @returns {boolean} - True if valid provider/model format
 */
function isProviderModelId(str) {
    if (typeof str !== 'string') {
        return false;
    }
    
    const trimmed = str.trim();
    if (trimmed.length === 0) {
        return false;
    }
    
    // Must contain exactly one slash as separator
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
        return false;
    }
    
    // Must not have additional slashes
    if (trimmed.indexOf('/', slashIndex + 1) !== -1) {
        return false;
    }
    
    // Provider pattern: alphanumeric, underscore, dot, hyphen
    const provider = trimmed.substring(0, slashIndex);
    const providerPattern = /^[-a-z0-9_.]+$/i;
    if (!providerPattern.test(provider)) {
        return false;
    }
    
    // Model pattern: alphanumeric, underscore, dot, hyphen, colon
    const model = trimmed.substring(slashIndex + 1);
    const modelPattern = /^[-a-z0-9_.:]+$/i;
    if (!modelPattern.test(model)) {
        return false;
    }
    
    return true;
}

/**
 * Open fallback models editor modal for a specific agent
 * @param {string} agentName - Name of the agent to edit fallbacks for
 */
function openFallbackEditor(agentName) {
    const agentConfig = state.currentConfig && state.currentConfig.agents && state.currentConfig.agents[agentName];
    if (!agentConfig) {
        updateStatus('Agent configuration not found', 'error');
        return;
    }
    
    const currentModel = agentConfig.model || 'none';
    const currentFallbacks = normalizeFallbackModels(agentConfig.fallback_models);
    
    // Store state for the editor
    state.fallbackEditorState = {
        agentName: agentName,
        fallbacks: [...currentFallbacks],
        originalFallbacks: [...currentFallbacks]
    };
    
    let content = '<div class="fallback-editor">';
    
    // Header
    content += '<div class="fallback-editor-header">';
    content += '<h3>Edit Fallback Models for ' + escapeHtml(agentName) + '</h3>';
    content += '<p class="fallback-editor-subtitle">Current model: <code>' + escapeHtml(currentModel) + '</code></p>';
    content += '<p class="fallback-editor-hint">If the primary model is unavailable, OmO will try these fallbacks in order:</p>';
    content += '</div>';
    
    // Fallback list
    content += '<div class="fallback-editor-list" id="fallback-list">';
    content += renderFallbackEditorList(currentFallbacks);
    content += '</div>';
    
    // Add new fallback input
    content += '<div class="fallback-editor-add">';
    content += '<input type="text" id="new-fallback-input" class="fallback-input" placeholder="provider/model (e.g., anthropic/claude-3-5-sonnet)" />';
    content += '<button class="btn btn-secondary" onclick="addFallbackEntry()">Add</button>';
    content += '<button class="btn btn-secondary" onclick="showFallbackModelPicker()">Browse Models</button>';
    content += '<div id="fallback-validation-error" class="fallback-validation-error hidden"></div>';
    content += '</div>';
    
    // Actions
    content += '<div class="fallback-editor-actions">';
    content += '<button class="btn btn-primary" onclick="saveFallbackModels()">Save Changes</button>';
    content += '<button class="btn btn-secondary" onclick="cancelFallbackEditor()">Cancel</button>';
    content += '</div>';
    
    content += '</div>';
    
    showModal('Fallback Models Editor', content);
}

 
/**
 * Render the fallback list for the editor
 */
function renderFallbackEditorList(fallbacks) {
    if (!fallbacks || fallbacks.length === 0) {
        return '<div class="fallback-empty">No fallback models configured. Add models above to use as fallbacks.</div>';
    }
    
    let html = '';
    fallbacks.forEach((modelId, index) => {
        html += '<div class="fallback-item" data-index="' + index + '">';
        html += '<div class="fallback-item-info">';
        html += '<span class="fallback-item-id">' + escapeHtml(modelId) + '</span>';
        html += '<span class="fallback-item-priority">Priority ' + (index + 1) + '</span>';
        html += '</div>';
        html += '<div class="fallback-item-controls">';
        // Up button (disabled if first item)
        html += '<button class="btn btn-icon" onclick="moveFallbackEntry(' + index + ', -1)"' + (index === 0 ? 'disabled' : '') + '" title="Move up">↑</button>';
        // Down button (disabled if last item)
        html += '<button class="btn btn-icon" onclick="moveFallbackEntry(' + index + ', 1)"' + (index === fallbacks.length - 1 ? 'disabled' : '') + '" title="Move down">↓</button>';
        // Remove button
        html += '<button class="btn btn-icon btn-danger" onclick="removeFallbackEntry(' + index + ')" title="Remove">✕</button>';
        html += '</div>';
        html += '</div>';
    });
    return html;
}
 
/**
 * Add a new fallback entry from the input
 */
function addFallbackEntry() {
    const input = document.getElementById('new-fallback-input');
    const errorDiv = document.getElementById('fallback-validation-error');
    const value = input.value.trim();
    
    if (!value) {
        errorDiv.textContent = 'Please enter a provider/model ID';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (!isProviderModelId(value)) {
        errorDiv.textContent = 'Invalid format. Use provider/model (e.g., anthropic/claude-3-5-sonnet)';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Check for duplicates
    if (state.fallbackEditorState.fallbacks.includes(value)) {
        errorDiv.textContent = 'This model is already in the fallback list';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Add to list
    state.fallbackEditorState.fallbacks.push(value);
    
    // Clear input and error
    input.value = '';
    errorDiv.classList.add('hidden');
    
    // Re-render list
    document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
}
 
/**
 * Remove a fallback entry
 * @param {number} index - Index of entry to remove
 */
function removeFallbackEntry(index) {
    state.fallbackEditorState.fallbacks.splice(index, 1);
    document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
}
 
/**
 * Move a fallback entry up or down
 * @param {number} index - Current index
 * @param {number} direction - -1 for up, 1 for down
 */
function moveFallbackEntry(index, direction) {
    const fallbacks = state.fallbackEditorState.fallbacks;
    const newIndex = index + direction;
    
    if (newIndex < 0 || newIndex >= fallbacks.length) {
        return; // Can't move outside bounds
    }
    
    // Swap entries
    const temp = fallbacks[index];
    fallbacks[index] = fallbacks[newIndex];
    fallbacks[newIndex] = temp;
    
    // Re-render list
    document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
}
 
/**
 * Save fallback models changes
 */
function saveFallbackModels() {
    if (!state.fallbackEditorState) {
        return;
    }
    
    const agentName = state.fallbackEditorState.agentName;
    const newFallbacks = state.fallbackEditorState.fallbacks;
    const originalFallbacks = state.fallbackEditorState.originalFallbacks;
    
    // Check if there are actual changes
    const hasChanges = JSON.stringify(newFallbacks) !== JSON.stringify(originalFallbacks);
    
    if (!hasChanges) {
        closeModal();
        updateStatus('No changes to save', 'info');
        return;
    }
    
    // Update the agent config
    if (!state.currentConfig.agents[agentName]) {
        state.currentConfig.agents[agentName] = { model: null };
    }
    
    if (newFallbacks.length > 0) {
        state.currentConfig.agents[agentName].fallback_models = newFallbacks;
    } else {
        // Remove empty fallback_models
        delete state.currentConfig.agents[agentName].fallback_models;
    }
    
    // Mark as unsaved
    markUnsaved();
    
    // Re-render agent cards
    renderAgentConfigView();
    
    closeModal();
    updateStatus('Fallback models updated for ' + agentName, 'success');
    
    // Clear editor state
    delete state.fallbackEditorState;
}
 
/**
 * Cancel fallback editor without saving
 */
function cancelFallbackEditor() {
    delete state.fallbackEditorState;
    closeModal();
}
 
/**
 * Show model picker modal for selecting fallback models
 * Reuses existing model selector patterns with duplicate prevention
 */
function showFallbackModelPicker() {
    if (!state.fallbackEditorState) {
        updateStatus('Fallback editor not initialized', 'error');
        return;
    }
    
    const agentName = state.fallbackEditorState.agentName;
    const currentFallbacks = state.fallbackEditorState.fallbacks;
    
    let content = '<div class="model-selector">';
    content += '<div class="model-selector-header">';
    content += '<h3>Select Fallback Model for ' + escapeHtml(agentName) + '</h3>';
    content += '<div class="model-selector-hint">Select a model to add to the fallback list. Duplicates are prevented.</div>';
    if (currentFallbacks.length > 0) {
        content += '<div class="model-selector-current">Current fallbacks: <code>' + currentFallbacks.map(escapeHtml).join('</code>, <code>') + '</code></div>';
    }
    content += '</div>';
    
    content += '<div class="model-selector-controls">';
    content += '<div class="model-selector-search">';
    content += '<input type="text" id="fallback-model-search" placeholder="Search models (name, provider, id)...">';
    content += '</div>';
    
    content += '<div class="model-selector-filters">';
    content += '<select id="fallback-model-provider" class="filter-select"><option value="">All Providers</option>';
    state.providers.forEach(p => {
        content += '<option value="' + p + '">' + (p.charAt(0).toUpperCase() + p.slice(1)) + '</option>';
    });
    content += '</select>';
    
    content += '<select id="fallback-model-context" class="filter-select">';
    content += '<option value="">Any context</option>';
    [64000, 128000, 200000, 500000, 1000000].forEach(v => {
        content += '<option value="' + v + '">' + formatContext(v) + '+</option>';
    });
    content += '</select>';
    content += '</div>';
    
    content += '<div class="model-selector-chips" id="fallback-model-chips">';
    content += '<button class="chip" data-filter="reasoning">🧠 Reasoning</button>';
    content += '<button class="chip" data-filter="image">🖼️ Image</button>';
    content += '<button class="chip" data-filter="pdf">📄 PDF</button>';
    content += '<button class="chip" data-filter="thinking">💭 Thinking</button>';
    content += '<button class="chip" data-filter="fast">⚡ Fast</button>';
    content += '</div>';
    content += '</div>';
    
    content += '<div id="fallback-model-results" class="model-selector-results"></div>';
    content += '</div>';
    
    showModal('Browse Models for Fallback', content);
    
    const pickerState = {
        search: '',
        provider: '',
        minContext: null,
        capabilities: []
    };
    
    function filterModelsForPicker(models) {
        let filtered = models;
        
        if (pickerState.search) {
            const q = pickerState.search.toLowerCase();
            filtered = filtered.filter(m => {
                const name = (m.name || '').toLowerCase();
                const id = (m.id || '').toLowerCase();
                const provider = (m.provider || '').toLowerCase();
                const family = (m.family || '').toLowerCase();
                return name.includes(q) || id.includes(q) || provider.includes(q) || family.includes(q);
            });
        }
        
        if (pickerState.provider) {
            filtered = filtered.filter(m => m.provider === pickerState.provider);
        }
        
        if (pickerState.capabilities.length > 0) {
            filtered = filtered.filter(model => {
                return pickerState.capabilities.every(cap => {
                    switch (cap) {
                        case 'reasoning': return model.capabilities && model.capabilities.reasoning;
                        case 'image': return model.capabilities && model.capabilities.input && model.capabilities.input.image;
                        case 'pdf': return model.capabilities && model.capabilities.input && model.capabilities.input.pdf;
                        case 'thinking': return model.hasThinking;
                        case 'fast': return model.isFast;
                        default: return false;
                    }
                });
            });
        }
        
        if (pickerState.minContext) {
            filtered = filtered.filter(m => (m.context || 0) >= pickerState.minContext);
        }
        
        return filtered;
    }
    
    function renderPickerModelButton(model) {
        const isDuplicate = currentFallbacks.includes(model.id);
        const buttonClass = isDuplicate ? 'model-select-btn disabled' : 'model-select-btn';
        let html = '<button class="btn btn-secondary ' + buttonClass + '"';
        
        if (isDuplicate) {
            html += ' disabled title="Already in fallback list"';
        } else {
            html += ' onclick="selectModelForFallback(\'' + escapeHtml(model.id) + '\')"';
        }
        
        html += '>';
        html += '<div class="model-select-name">' + (model.name || model.id.split('/').pop());
        if (isDuplicate) {
            html += ' <span class="duplicate-badge">✓ Added</span>';
        }
        html += '</div>';
        html += '<div class="model-select-meta">' + model.provider + ' • ' + model.contextDisplay;
        if (model.badges && model.badges.length > 0) {
            html += ' • ' + model.badges.join(', ');
        }
        html += '</div>';
        html += '</button>';
        return html;
    }
    
    function renderPickerResults() {
        const el = document.getElementById('fallback-model-results');
        if (!el) return;
        
        const filtered = filterModelsForPicker(state.models);
        
        let html = '';
        
    if (filtered.length === 0) {
            html = '<div class="no-results"><h3>No models found</h3><p>Try adjusting your search or filters.</p></div>';
        } else {
            const alreadyAdded = filtered.filter(m => currentFallbacks.includes(m.id));
            const available = filtered.filter(m => !currentFallbacks.includes(m.id));
            
            if (alreadyAdded.length > 0) {
                html += '<div class="model-selector-section">';
                html += '<h4>Already in Fallback List (' + alreadyAdded.length + ')</h4>';
                html += '<div class="model-selector-list">';
                alreadyAdded.forEach(m => { html += renderPickerModelButton(m); });
                html += '</div></div>';
            }
            
            if (available.length > 0) {
                html += '<div class="model-selector-section">';
                html += '<h4>Available Models (' + available.length + ')</h4>';
                
                const capped = available.slice(0, 120);
                const groups = {};
                capped.forEach(m => {
                    if (!groups[m.provider]) groups[m.provider] = [];
                    groups[m.provider].push(m);
                });
                
                Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([provider, models]) => {
                    html += '<div class="model-provider-group">';
                    html += '<div class="model-provider-group-title">' + provider + ' <span class="count">(' + models.length + ')</span></div>';
                    html += '<div class="model-selector-list">';
                    models.forEach(m => { html += renderPickerModelButton(m); });
                    html += '</div></div>';
                });
                
                if (available.length > 120) {
                    html += '<div class="model-selector-note">Showing first 120 results. Refine filters to narrow further.</div>';
                }
                html += '</div>';
            }
        }
        
        el.innerHTML = html;
    }
    
    const searchEl = document.getElementById('fallback-model-search');
    const providerEl = document.getElementById('fallback-model-provider');
    const contextEl = document.getElementById('fallback-model-context');
    const chipsEl = document.getElementById('fallback-model-chips');
    
    if (searchEl) {
        searchEl.addEventListener('input', debounce((e) => {
            pickerState.search = e.target.value;
            renderPickerResults();
        }, 120));
        searchEl.focus();
    }
    
    if (providerEl) {
        providerEl.addEventListener('change', (e) => {
            pickerState.provider = e.target.value;
            renderPickerResults();
        });
    }
    
    if (contextEl) {
        contextEl.addEventListener('change', (e) => {
            pickerState.minContext = e.target.value ? parseInt(e.target.value, 10) : null;
            renderPickerResults();
        });
    }
    
    if (chipsEl) {
        chipsEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chip')) return;
            e.target.classList.toggle('active');
            const active = chipsEl.querySelectorAll('.chip.active');
            pickerState.capabilities = Array.from(active).map(ch => ch.dataset.filter);
            renderPickerResults();
        });
    }
    
    renderPickerResults();
}

/**
 * Select a model from the picker and add it to the fallback list
 * @param {string} modelId - Canonical provider/model ID to add
 */
function selectModelForFallback(modelId) {
    if (!state.fallbackEditorState) {
        updateStatus('Fallback editor not initialized', 'error');
        return;
    }
    
    if (!isProviderModelId(modelId)) {
        updateStatus('Invalid model ID format: ' + modelId, 'error');
        return;
    }
    
    if (state.fallbackEditorState.fallbacks.includes(modelId)) {
        updateStatus('Model already in fallback list: ' + modelId, 'info');
        return;
    }
    
    state.fallbackEditorState.fallbacks.push(modelId);
    
    const fallbackListEl = document.getElementById('fallback-list');
    if (fallbackListEl) {
        fallbackListEl.innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
    }
    
    closeModal();
    
    updateStatus('Added ' + modelId + ' to fallback list', 'success');
}

// Expose fallback editor functions to window
window.openFallbackEditor = openFallbackEditor;
window.addFallbackEntry = addFallbackEntry;
window.removeFallbackEntry = removeFallbackEntry;
window.moveFallbackEntry = moveFallbackEntry;
window.saveFallbackModels = saveFallbackModels;
window.cancelFallbackEditor = cancelFallbackEditor;
window.showFallbackModelPicker = showFallbackModelPicker;
window.selectModelForFallback = selectModelForFallback;
