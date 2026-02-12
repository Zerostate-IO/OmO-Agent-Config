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
    agentDocs: [],
    agentDocsByName: {},
    filters: {
        search: '',
        providers: [],
        capabilities: [],
        minContext: null,
        sortBy: 'smart',
        sortOrder: 'asc'
    },
    isLoading: false,
    unsavedChanges: false
};

// DOM Elements
const elements = {
    modelsGrid: document.getElementById('models-grid'),
    agentsGrid: document.getElementById('agents-grid'),
    searchInput: document.getElementById('search-input'),
    providerFilter: document.getElementById('provider-filter'),
    contextFilter: document.getElementById('context-filter'),
    sortBy: document.getElementById('sort-by'),
    clearFiltersBtn: document.getElementById('clear-filters'),
    filterChips: document.getElementById('filter-chips'),
    refreshBtn: document.getElementById('refresh-btn'),
    saveBtn: document.getElementById('save-btn'),
    undoBtn: document.getElementById('undo-btn'),
    viewModelsBtn: document.getElementById('view-models-btn'),
    viewAgentsBtn: document.getElementById('view-agents-btn'),
    profileSelect: document.getElementById('profile-select'),
    statusBar: document.getElementById('status-bar'),
    modelsCount: document.getElementById('models-count'),
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
    elements.searchInput.addEventListener('input', debounce((e) => {
        state.filters.search = e.target.value;
        filterAndRenderModels();
    }, 150));

    elements.providerFilter.addEventListener('change', (e) => {
        state.filters.providers = e.target.value ? [e.target.value] : [];
        filterAndRenderModels();
    });

    elements.contextFilter.addEventListener('change', (e) => {
        state.filters.minContext = e.target.value ? parseInt(e.target.value) : null;
        filterAndRenderModels();
    });

    elements.sortBy.addEventListener('change', (e) => {
        state.filters.sortBy = e.target.value;
        filterAndRenderModels();
    });

    elements.clearFiltersBtn.addEventListener('click', clearAllFilters);

    elements.filterChips.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip')) {
            e.target.classList.toggle('active');
            updateActiveFilters();
            filterAndRenderModels();
        }
    });

    elements.refreshBtn.addEventListener('click', () => loadModels(true));
    elements.saveBtn.addEventListener('click', saveConfiguration);
    elements.undoBtn.addEventListener('click', undoLastChange);
    elements.profileSelect.addEventListener('change', switchProfile);
    
    const manageProfilesBtn = document.getElementById('manage-profiles-btn');
    if (manageProfilesBtn) {
        manageProfilesBtn.addEventListener('click', openProfileManagement);
    }
    
    // View switching
    if (elements.viewModelsBtn) {
        elements.viewModelsBtn.addEventListener('click', () => switchView('models'));
    }
    if (elements.viewAgentsBtn) {
        elements.viewAgentsBtn.addEventListener('click', () => switchView('agents'));
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
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
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

function clearAllFilters() {
    const currentSort = state.filters.sortBy;
    state.filters = {
        search: '',
        providers: [],
        capabilities: [],
        minContext: null,
        sortBy: currentSort,
        sortOrder: 'asc'
    };
    
    elements.searchInput.value = '';
    elements.providerFilter.value = '';
    elements.contextFilter.value = '';
    
    filterAndRenderModels();
}

function switchView(view) {
    if (view === 'models') {
        elements.modelsGrid.classList.remove('hidden');
        elements.agentsGrid.classList.add('hidden');
        elements.viewModelsBtn.classList.add('active');
        elements.viewAgentsBtn.classList.remove('active');
        document.querySelector('.filters-section').style.display = 'block';
        filterAndRenderModels();
    } else if (view === 'agents') {
        elements.modelsGrid.classList.add('hidden');
        elements.agentsGrid.classList.remove('hidden');
        elements.viewModelsBtn.classList.remove('active');
        elements.viewAgentsBtn.classList.add('active');
        document.querySelector('.filters-section').style.display = 'none';
        renderAgentConfigView();
    }
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
        const params = [];
        
        if (forceRefresh) params.push('refresh=true');
        if (state.filters.sortBy) params.push('sortBy=' + encodeURIComponent(state.filters.sortBy));
        if (state.filters.sortOrder) params.push('sortOrder=' + encodeURIComponent(state.filters.sortOrder));
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        state.models = data.models || [];
        state.providers = data.providers || [];
        state.hasDuplicates = data.hasDuplicates || false;
        state.duplicateCount = data.duplicateCount || 0;
        
        populateProviderFilter();
        
        let statusMsg = 'Loaded ' + data.total + ' models' + (data.cached ? ' (from cache)' : '');
        if (data.hasDuplicates) {
            statusMsg += ' • ' + data.duplicateCount + ' models available from multiple providers';
        }
        updateStatus(statusMsg);
        elements.lastUpdated.textContent = 'Updated: ' + new Date(data.fetchedAt).toLocaleTimeString();
        
        filterAndRenderModels();
    } catch (error) {
        console.error('Failed to load models:', error);
        updateStatus('Error: ' + error.message, 'error');
        elements.modelsGrid.innerHTML = '<div class="error-message"><h3>Failed to load models</h3><p>' + error.message + '</p><button class="btn btn-primary" onclick="loadModels(true)">Try Again</button></div>';
    }
}

function populateProviderFilter() {
    const currentValue = elements.providerFilter.value;
    elements.providerFilter.innerHTML = '<option value="">All Providers</option>';
    
    state.providers.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider;
        option.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
        elements.providerFilter.appendChild(option);
    });
    
    elements.providerFilter.value = currentValue;
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
        filterAndRenderModels();
    } catch (error) {
        console.error('Failed to load config:', error);
        state.currentConfig = { agents: {} };
    }
}

function updateActiveFilters() {
    const activeChips = elements.filterChips.querySelectorAll('.chip.active');
    state.filters.capabilities = Array.from(activeChips).map(chip => chip.dataset.filter);
}

function filterAndRenderModels() {
    const filters = state.filters;
    let filtered = state.models;
    
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(model => {
            const nameMatch = model.name && model.name.toLowerCase().includes(searchLower);
            const idMatch = model.id && model.id.toLowerCase().includes(searchLower);
            const providerMatch = model.provider && model.provider.toLowerCase().includes(searchLower);
            return nameMatch || idMatch || providerMatch;
        });
    }
    
    if (filters.providers && filters.providers.length > 0) {
        filtered = filtered.filter(model => filters.providers.includes(model.provider));
    }
    
    if (filters.capabilities && filters.capabilities.length > 0) {
        filtered = filtered.filter(model => {
            return filters.capabilities.every(cap => {
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
    
    if (filters.minContext) {
        filtered = filtered.filter(model => (model.context || 0) >= filters.minContext);
    }
    
    renderModels(filtered);
    elements.modelsCount.textContent = filtered.length + ' of ' + state.models.length + ' models';
}

function renderModels(models) {
    if (models.length === 0) {
        elements.modelsGrid.innerHTML = '<div class="no-results"><div class="no-results-icon">🔍</div><h3>No models found</h3><p>Try adjusting your filters or search terms</p><button class="btn btn-secondary" onclick="clearAllFilters()">Clear Filters</button></div>';
        return;
    }
    
    elements.modelsGrid.innerHTML = models.map(model => {
        const agents = getAgentsUsingModel(model.id);
        const isAssigned = agents.length > 0;
        const isDuplicate = model.isDuplicate;
        const isBestProvider = model.isBestProvider;
        const duplicateCount = model.duplicateCount || 0;
        
        let html = '<div class="model-card ' + (isAssigned ? 'assigned' : '') + (isBestProvider ? ' best-provider' : '') + '" data-model-id="' + model.id + '">';
        html += '<div class="model-header">';
        html += '<span class="model-provider ' + model.provider.toLowerCase() + '">' + model.provider + '</span>';
        
        // Add best value badge for best provider
        if (isBestProvider && duplicateCount > 1) {
            html += '<span class="badge" style="background-color: #ffd700; color: #1a1a2e; font-weight: bold;">⭐ Best Value</span>';
        }
        
        html += renderCostBadge(model);
        html += '</div>';
        html += '<div class="model-name" title="' + model.id + '">' + model.name + '</div>';
        html += '<div class="model-badges">';
        html += '<span class="badge context">' + model.contextDisplay + '</span>';
        model.badges.forEach(b => {
            html += '<span class="badge">' + b + '</span>';
        });
        
        // Show duplicate count badge
        if (isDuplicate && duplicateCount > 1) {
            html += '<span class="badge" style="background-color: var(--color-secondary); color: white;" title="Available from ' + duplicateCount + ' providers">🔀 ' + duplicateCount + ' providers</span>';
        }
        
        html += '</div>';
        
        if (isAssigned) {
            html += '<div class="model-assigned">🤖 ' + agents.join(', ') + '</div>';
        }
        
        html += '<div class="model-actions">';
        html += '<button class="btn btn-secondary" onclick="viewModelDetails(\'' + model.id + '\')">Details</button>';
        
        // Show compare button for duplicates
        if (isDuplicate && duplicateCount > 1) {
            html += '<button class="btn btn-primary" onclick="compareProviders(\'' + model.id + '\')">Compare</button>';
        } else if (isAssigned) {
            html += '<button class="btn btn-primary" onclick="viewAlternatives(\'' + agents[0] + '\')">Alternatives</button>';
        } else {
            html += '<button class="btn btn-primary" onclick="assignModel(\'' + model.id + '\')">Assign</button>';
        }
        
        html += '</div>';
        html += '</div>';
        
        return html;
    }).join('');
}

function renderCostBadge(model) {
    if (!model.costDisplay) return '';
    const costClass = model.costDisplay.indexOf('$$$$') !== -1 ? 'expensive' : 
                     model.costDisplay.indexOf('$$') !== -1 ? 'moderate' : 'cheap';
    return '<span class="badge cost-' + costClass + '">' + model.costDisplay + '</span>';
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
            
            // Try to find the model with flexible matching
            let currentModel = null;
            if (currentModelId) {
                // First try exact match
                currentModel = state.models.find(m => m.id === currentModelId || m.modelID === currentModelId);
                
                // If not found, try matching by model ID suffix
                if (!currentModel) {
                    const modelIdSuffix = currentModelId.split('/').pop().toLowerCase();
                    // First try exact match on ID suffix
                    currentModel = state.models.find(m => {
                        const mIdSuffix = m.id.split('/').pop().toLowerCase();
                        return mIdSuffix === modelIdSuffix;
                    });
                    // If still not found, try contains match but prefer longer matches
                    if (!currentModel) {
                        let bestMatch = null;
                        let bestMatchLength = 0;
                        state.models.forEach(m => {
                            const mIdSuffix = m.id.split('/').pop().toLowerCase();
                            if (mIdSuffix.includes(modelIdSuffix) || modelIdSuffix.includes(mIdSuffix)) {
                                // Prefer longer/more specific matches
                                if (mIdSuffix.length > bestMatchLength) {
                                    bestMatch = m;
                                    bestMatchLength = mIdSuffix.length;
                                }
                            }
                        });
                        currentModel = bestMatch;
                    }
                }
            }
            
            const agentInfo = state.agentDocsByName[agentName];
            
            let html = '<div class="agent-config-card">';
            
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
            html += '</div>';
            
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

    function renderModelButton(model, extraMeta) {
        const isCurrent = model.id === currentModelId || model.modelID === currentModelId;
        const usedBy = getAgentsUsingModel(model.id);
        let html = '<button class="btn btn-secondary model-select-btn ' + (isCurrent ? 'current' : '') + '" onclick="assignModelToAgent(\'' + model.id + '\', \'' + agentName + '\'); closeModal();">';
        html += '<div class="model-select-name">' + (model.name || model.id.split('/').pop()) + '</div>';
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
                html += renderModelButton(r.model, 'score ' + r.info.score);
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

function assignModelToAgent(modelId, agentName) {
    if (!state.currentConfig.agents) state.currentConfig.agents = {};
    if (!state.currentConfig.agents[agentName]) state.currentConfig.agents[agentName] = {};
    
    const oldModelId = state.currentConfig.agents[agentName].model;
    state.currentConfig.agents[agentName].model = modelId;
    
    const model = state.models.find(m => m.id === modelId);
    const oldModel = oldModelId ? state.models.find(m => m.id === oldModelId) : null;
    
    recordChange(
        'model_change',
        agentName + ' model changed' + (oldModel ? ' from ' + oldModel.name : '') + ' to ' + (model ? model.name : modelId),
        () => {
            state.currentConfig.agents[agentName].model = oldModelId;
        }
    );
    
    markUnsaved();
    closeModal();
    filterAndRenderModels();
    
    updateStatus(agentName + ' changed to ' + (model ? model.name : modelId), 'success');
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
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.currentConfig)
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.unsavedChanges = false;
            elements.saveBtn.disabled = true;
            updateStatus('Configuration saved successfully', 'success');
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
    state.unsavedChanges = true;
    elements.saveBtn.disabled = false;
}

document.addEventListener('DOMContentLoaded', init);

window.viewModelDetails = viewModelDetails;
window.viewAlternatives = viewAlternatives;
window.assignModelToAgent = assignModelToAgent;
window.assignModel = assignModel;
window.clearAllFilters = clearAllFilters;
window.loadModels = loadModels;

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
function undoLastChange() {
    if (changeHistory.length === 0) return;
    
    const lastChange = changeHistory.shift();
    state.currentConfig = lastChange.configSnapshot;
    
    filterAndRenderModels();
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
    
    // Setup import drop zone
    setTimeout(() => {
        setupImportDropZone();
    }, 0);
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
        summary[agent] = config.model || 'none';
    });
    return summary;
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
                summary[agent] = config.model || 'none';
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
 * Calculate diff between two assignment sets
 */
function calculateDiff(current, newAssignments) {
    const diff = [];
    const allAgents = new Set([...Object.keys(current), ...Object.keys(newAssignments)]);
    
    allAgents.forEach(agent => {
        const currentModel = current[agent];
        const newModel = newAssignments[agent];
        
        if (currentModel && newModel && currentModel !== newModel) {
            diff.push({ type: 'changed', agent, from: currentModel, to: newModel });
        } else if (!currentModel && newModel) {
            diff.push({ type: 'added', agent, to: newModel });
        } else if (currentModel && !newModel) {
            diff.push({ type: 'removed', agent, from: currentModel });
        }
    });
    
    return diff;
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
            content += '<span>' + agent.name + '</span>';
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
 * Get current model assigned to agent
 */
function getCurrentModelForAgent(agentName) {
    if (!state.currentConfig || !state.currentConfig.agents) return null;
    return state.currentConfig.agents[agentName]?.model || null;
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
        content += '<p>' + (fullAgent.summary || fullAgent.description || 'No description available') + '</p>';
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
            content += '<h4>Usage</h4>';
            content += '<ul>';
            fullAgent.usage.forEach(item => {
                content += '<li>' + item + '</li>';
            });
            content += '</ul>';
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
        
        // Fallback chain
        if (fullAgent.fallbackChain && fullAgent.fallbackChain.length > 0) {
            content += '<div class="agent-section">';
            content += '<h4>Fallback Chain</h4>';
            content += '<p>If the primary model is unavailable, this agent will try:</p>';
            content += '<ol>';
            fullAgent.fallbackChain.forEach(model => {
                content += '<li>' + model + '</li>';
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
            filterAndRenderModels();
            
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
window.switchView = switchView;
window.renderAgentConfigView = renderAgentConfigView;
window.changeAgentModel = changeAgentModel;
window.viewAgentDetails = viewAgentDetails;
window.showAgentModelSelector = showAgentModelSelector;
window.importCurrentConfig = importCurrentConfig;
