# Architecture: Core Module Boundaries

> Document version: 1.0  
> Last updated: 2026-02-20

This document defines the internal boundaries between core modules in `lib/core/`. These boundaries exist to prevent circular dependencies and maintain clear separation of concerns.

---

## Module Overview

| Module | Responsibility | Source of Truth |
|--------|----------------|-----------------|
| `models.js` | Model discovery, parsing, formatting | OpenCode CLI (`opencode models --verbose`) |
| `model-requirements.js` | Upstream fallback chain definitions + resolution logic | Oh My Opencode upstream agent requirements |
| `agents.js` | Agent metadata, recommendation orchestration | GitHub agent docs + local heuristics |

---

## Dependency Graph

```
models.js
    ^
    |
constants.js <--+--> model-requirements.js <-- agents.js
```

**Key constraint:** `models.js` and `agents.js` never import from each other directly. They communicate through shared data structures (model objects) passed at runtime.

---

## Source-of-Truth Boundaries

### 1. Model Parsing/Formatting: `lib/core/models.js`

**What it owns:**
- Executing `opencode models --verbose`
- Parsing CLI output (brace-count JSON parser)
- Caching model catalog (`~/.config/opencode/cache/models-cache.json`)
- Provider ranking (`rankProvider()`)
- Model formatting for display (`formatModel()`)
- Model filtering and sorting

**What it does NOT own:**
- Agent-specific model requirements
- Fallback chain resolution
- Recommendation logic

**Exports for other modules:**
```javascript
{
  getModels,        // Fetch or cached models
  filterModels,     // Search/filter utilities
  formatModel,      // Display formatting
  rankProvider,     // Provider preference scoring
  // ... utilities
}
```

---

### 2. Fallback Chain Definitions + Resolution: `lib/core/model-requirements.js`

**What it owns:**
- `AGENT_MODEL_REQUIREMENTS` - Static mapping of agent -> fallback chains
- `CATEGORY_MODEL_REQUIREMENTS` - Category-based fallback chains
- Provider-specific model ID transforms (e.g., GitHub Copilot naming)
- Model ID normalization (punctuation-tolerant matching)
- Fallback chain resolution logic (`resolveModelFromChain()`)
- Gating condition checks (`isAnyFallbackEntryAvailable()`, etc.)

**What it does NOT own:**
- Agent metadata fetching (that's `agents.js`)
- Model discovery (that's `models.js`)
- Final recommendation scoring

**Why it stays separate:**
1. **Upstream parity** - The fallback chain definitions mirror Oh My Opencode's internal model requirements. Keeping them in a dedicated file makes it easy to sync with upstream changes.
2. **No circular deps** - `agents.js` imports from `model-requirements.js`, but `models.js` does not. This prevents circular imports.
3. **Pure functions** - The resolution logic is stateless and easily testable.

**Exports for other modules:**
```javascript
{
  AGENT_MODEL_REQUIREMENTS,      // Static agent requirements
  CATEGORY_MODEL_REQUIREMENTS,   // Static category requirements
  resolveModelFromChain,         // Resolve model from fallback chain
  isAnyFallbackEntryAvailable,   // Check if any entry is available
  isRequiredModelAvailable,      // Check required model availability
  isRequiredProviderAvailable,   // Check required provider availability
  normalizeModelId,              // Model ID normalization
  modelIdMatches                 // Fuzzy model matching
}
```

---

### 3. Agent Metadata + Recommendation Orchestration: `lib/core/agents.js`

**What it owns:**
- Fetching agent docs from GitHub (`code-yeongyu/oh-my-opencode`)
- Parsing agent TypeScript files for metadata
- Caching agent metadata (`~/.config/opencode/cache/agents/`)
- Building availability maps from available models
- Recommendation orchestration (fallback chain first, heuristic fallback)
- Gating condition evaluation

**What it does NOT own:**
- Model discovery (delegates to `models.js` via passed data)
- Fallback chain definitions (imports from `model-requirements.js`)
- Model ID normalization (imports from `model-requirements.js`)

**How it composes the other modules:**

```javascript
// agents.js imports
const { 
  AGENT_MODEL_REQUIREMENTS, 
  resolveModelFromChain,
  // ... from model-requirements.js
} = require('./model-requirements');

// Runtime composition
function getRecommendedModels(metadata, availableModels, limit) {
  // 1. Check if agent has upstream requirements
  const requirements = AGENT_MODEL_REQUIREMENTS[agentKey];
  
  // 2. Build availability map from models (passed in, not fetched)
  const availability = buildAvailabilityMap(availableModels);
  
  // 3. Use model-requirements.js for resolution
  const resolved = resolveModelFromChain(requirements.fallbackChain, availability);
  
  // 4. Fall back to heuristic scoring if needed
  // ...
}
```

**Exports:**
```javascript
{
  getAllAgentDocumentation,   // Fetch all agent docs
  getAgentDocumentation,      // Fetch single agent
  getRecommendedModels,       // Get model recommendations for agent
  refreshAgentCache,          // Refresh agent cache from GitHub
  // ... utilities
}
```

---

## Data Flow: Getting Recommendations

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Web UI/API    │────▶│   agents.js      │────▶│  model-requirements │
│  (server.js)    │     │                  │     │     .js             │
└─────────────────┘     │ 1. Get available │     │                     │
                        │    models from   │     │ 3. Resolve fallback │
                        │    models.js     │     │    chain entries    │
                        │                  │     │                     │
                        │ 2. Build avail   │────▶│ 4. Return resolved  │
                        │    map           │     │    model            │
                        │                  │◄────│                     │
                        │ 5. Return recs   │     └─────────────────────┘
                        │    to caller     │
                        └──────────────────┘
```

**Important:** `agents.js` receives `availableModels` as a parameter. It never calls `models.js` functions directly. This inversion of control prevents circular dependencies.

---

## Developer Guidelines

### When to modify each module:

| Change Type | Target Module |
|-------------|---------------|
| Add new agent fallback chain | `model-requirements.js` |
| Update provider ranking | `models.js` |
| Fix model ID matching | `model-requirements.js` |
| Add agent metadata parsing | `agents.js` |
| Change recommendation scoring | `agents.js` |
| Update model display format | `models.js` |

### Adding a new agent:

1. Add fallback chain to `AGENT_MODEL_REQUIREMENTS` in `model-requirements.js`
2. Add any category requirements to `CATEGORY_MODEL_REQUIREMENTS` if applicable
3. The agent will be discovered automatically via GitHub fetch in `agents.js`

### Never do this:

- **Don't** have `models.js` import from `agents.js` - pass data instead
- **Don't** have `model-requirements.js` import from `agents.js` - it should be a leaf module
- **Don't** duplicate fallback chain logic in `agents.js` - use the shared helpers from `model-requirements.js`

---

## Circular Dependency Prevention

The current structure prevents these problematic cycles:

```
# BAD (would create cycle):
models.js ──▶ agents.js ──▶ models.js

# GOOD (current structure):
models.js ──▶ shared data ◀── agents.js ◀── model-requirements.js
```

If you find yourself wanting to import `agents.js` from `models.js` or vice versa, **stop** and reconsider:
- Can you pass the needed data as a parameter?
- Can you move shared types to `constants.js`?
- Can you create a new pure function in `model-requirements.js`?

---

## Related Documentation

- `lib/core/AGENTS.md` - Detailed agent module documentation
- `lib/AGENTS.md` - lib/ directory overview
- `docs/AGENTS.md` - User-facing agent documentation
