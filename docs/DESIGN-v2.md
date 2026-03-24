# OmO Agent Config v2.0 - Design Specification

**Status**: Draft  
**Date**: 2025-02-11  
**Project**: Web-first overhaul of OmO Agent Config tool

---

## Executive Summary

This document specifies the complete redesign of the OmO Agent Config tool, transitioning from a CLI-first to a **web-first architecture**. The goal is to create a fast, visual tool for managing Oh My Opencode agent configurations with real-time model browsing, intelligent filtering, and one-click profile switching.

### Key Principles

1. **Web UI is primary** - Full configuration happens in the browser
2. **CLI is reduced** - Quick profile switching only: `opencode-agent-config <profile-name>`
3. **Always up-to-date** - Fetch agent docs and model list from GitHub/OpenCode automatically
4. **Emergency-ready** - One-click model swaps when API credits run out
5. **Zero npm dependencies** - Use only Node.js built-in modules

---

## UI Screens Reference

Generated with Stitch MCP:

1. **Model Browser** - Main catalog view with filters and search
   - File: `21bfba798d4148b3a991efefa573e6b8`
   - [View Screenshot](https://lh3.googleusercontent.com/aida/AOfcidVdjEY8cI7fK-EesYpYtmAqE8Yu5CHQh05LEtPwT6OozybfdlvBK5Ha8Sqty_Zg6Un1zoh7JwHU6_zPVHvseYr9KjxnptDpXQNqrC6XCZdh0hdWTZ1AKZH8RMdcqv-PxQv7KehfFCW8hB0BFCbQdAd88DyyvFveTBsZ9YCA1Ndo7qVN59g_nRhdV4jIjzMh8-o8O_43kj3A0tvQ9LpU5FzNluJxlADp7Q6XvYtq2uU5lRZTVG8QpDii9TA)

2. **Agent Configuration Modal** - Switch models for a specific agent
   - File: `d749ccb85ce545ab9689c793706f2080`
   - [View Screenshot](https://lh3.googleusercontent.com/aida/AOfcidWn-5ieg2zd6yEVxlRzKO2bJ4JChagc4dcbSNwxWhG7XlrlLtmyo6C2L69F5xEWohd7nZYLLW2a9wLuLbBIasumFgqfTsclWAldux1MriP1-dFywLEm0jERYygoWbDZsoOI36v59jBoD9iXzU0uFBEagHGAiLt6wxCGNZyyQg-jgy5zMVNtuHsGlvMOScc8_C5zIY21furMU7lYZ1Uaq6_HRs1RLTssmR6CsGlzLUapDbYfyus-AEfoOxQ)

3. **Profile Management Panel** - Switch between saved configurations
   - File: `a5252493a001424cadf4cd74b7ca0698`
   - [View Screenshot](https://lh3.googleusercontent.com/aida/AOfcidU4NSpzp7xV2lUmbD4FpGFEQqjTMZw4gryrv6bL-b-iCp0OtdzLE7YMN-6inNfPzqP8VQ5n7fbI0CFxpLtzdHjgCvlrHKnGoJzrYqX4IYowAPq8Y9wMbQHPKLLpZdO1pIQRdXh0EBYnU0j8i2RppDQZPtkzxuK0CacowMhfcPg2bmxZcTFubDH6K0JNPPIR80SwAoUaaxeBaecDdMF5OOt3-89G-sglSIPcwKR-Utvw8u023kYMOKetulE)

4. **Emergency Quick-Swap Dashboard** - Credit exhaustion workflow
   - File: `f41357459aa54bfdb0e7e3f54623d047`
   - [View Screenshot](https://lh3.googleusercontent.com/aida/AOfcidUiFBbBbEdDbs2f1zRaF7N2eEq1hztF_7GUTtCEjvxKaDXuJgcGYlbpbCSYw0fusPBclu7ldseKM4_024J-rd8N7ilK-Q60nAbY5Fk8N9kSGMCC7K28eAU0vvep_ISFEdJpXXYokF5t_EaHfxlJOZ1CcG4qzGaVCdGG5z-DEAOA2RvWYBIKz8OvmFz5m1EW7miYJymzOfIFuxhuV2W_AK0_Kf-lBfmSKSdUuk-hdH1W6tRGroFimfr74w)

---

## Architecture Overview

### New Directory Structure

```
OmO-Agent-Config/
├── bin/
│   └── opencode-agent-config          # Simplified CLI launcher
├── lib/
│   ├── server.js                       # HTTP server + API routes
│   ├── core/                           # Refactored business logic
│   │   ├── models.js                   # Model fetching, caching, scoring
│   │   ├── profiles.js               # Profile CRUD operations
│   │   ├── upstream.js                 # GitHub sync (enhanced)
│   │   ├── backup.js                   # Backup/restore logic
│   │   └── agents.js                   # Agent doc fetching & parsing
│   ├── web/                            # Static web assets
│   │   ├── index.html                  # Main app shell
│   │   ├── app.js                      # Frontend application logic
│   │   ├── styles.css                  # Stylesheet
│   │   └── components/                 # Optional: component modules
│   └── constants.js                    # Trimmed configuration
├── install.sh                          # Installation script
└── docs/
    └── DESIGN.md                       # This document
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-------------|
| **Backend** | Node.js `http` module | Zero dependencies, built-in |
| **Frontend** | Vanilla JS + CSS | No build step needed, fast loading |
| **Data Storage** | JSON files | Simple, human-readable, git-friendly |
| **External APIs** | GitHub Raw + OpenCode CLI | Authoritative source of truth |

---

## CLI Behavior (Reduced Scope)

### Commands

```bash
# Launch web UI (default)
opencode-agent-config

# Quick switch to profile
opencode-agent-config work-credits
# Output: ✓ Switched to 'work-credits' (Sisyphus: claude-opus-4.5 → claude-sonnet-4.5)

# List available profiles
opencode-agent-config --list

# Show help
opencode-agent-config --help
```

### Implementation

```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');
const { startServer, openBrowser } = require('../lib/server');

const args = process.argv.slice(2);

if (args.length === 0) {
  // Launch web UI
  const port = startServer();
  openBrowser(`http://localhost:${port}`);
} else if (args[0] === '--list' || args[0] === '-l') {
  // List profiles (TUI mode)
  listProfiles();
} else if (!args[0].startsWith('-')) {
  // Switch to named profile
  switchProfile(args[0]);
} else {
  console.log('Usage: opencode-agent-config [profile-name|--list]');
}
```

---

## Web UI Screens

### 1. Model Browser (Primary View)

**Purpose**: Browse, filter, and search the complete model catalog.

**Layout**:
```
┌───────────────────────────────────────────────────────────────┐
│  OmO Agent Config    [work-credits ▼]          [Save Changes] │
├───────────────────────────────────────────────────────────────┤
│  🔍 Search models...      [All Providers ▼] [Reasoning] [128K+]│
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Anthropic   │ │ OpenAI      │ │ Google      │           │
  │  │ opus-4.5    │ │ gpt-5.4     │ │ gemini-3    │           │
│  │ 200K R T $$$│ │ 200K R $$   │ │ 1048K R I P│           │
│  │ Used by: S  │ │ Used by: O,M│ │ Used by: L  │           │
│  │ [Alternatives]│ [Alternatives]│ [Alternatives]│         │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  ... (scrollable grid)                                        │
└───────────────────────────────────────────────────────────────┘
```

**Interactions**:
- Click model card → Open Agent Assignment modal
- Type in search → Filter models in real-time
- Toggle filters → Combine multiple criteria (AND logic)
- Click "Alternatives" → See similar models for that agent

**API Endpoints**:
- `GET /api/models` - Fetch all models from `opencode models --verbose`
- `GET /api/models?search=opus&provider=anthropic&capability=reasoning`

---

### 2. Agent Configuration Modal

**Purpose**: Change the model assigned to a specific agent.

**Layout**:
```
┌─────────────────────────────────────────┐
│  Sisyphus                    [X]        │
│  Primary Orchestrator                   │
│                                         │
│  CURRENT MODEL                          │
│  ┌─────────────────────────────────┐   │
│  │ claude-opus-4.5-thinking        │   │
│  │ Anthropic • 200K • R • T • $$$  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ALTERNATIVES (95% capability match)     │
│  ┌────────────┐ ┌────────────┐ ┌──────┐│
  │  │ sonnet-4.5 │ │ gpt-5.4    │ │ gem ││
│  │ 128K • R   │ │ 200K • R •T│ │1048K││
│  │ $$ • 65%   │ │ $$$ • same │ │ $   ││
│  │ [Switch]   │ │ [Switch]   │ │[Sw]││
│  └────────────┘ └────────────┘ └──────┘│
│                                         │
│         [Cancel]    [Confirm Switch]    │
└─────────────────────────────────────────┘
```

**Scoring Display**:
- Show capability match percentage
- Highlight cost savings
- Indicate capability trade-offs

**API Endpoints**:
- `GET /api/agents/:agent/alternatives?currentModel=X` - Get ranked alternatives
- `POST /api/agents/:agent/model` - Assign new model

---

### 3. Profile Management Panel

**Purpose**: Switch, create, duplicate, and manage configuration profiles.

**Layout**:
```
┌─────────────────────────────────────────┐
│  Configuration Profiles                 │
├─────────────────────────────────────────┤
│  ● work-credits        ACTIVE           │
│    6 agents • Modified 2 hours ago      │
│    oracle:gpt-4o, Sisyphus:claude-opus   │
│                                         │
│  ○ omo-default                          │
│    6 agents • Default OmO setup         │
│    [Activate] [Duplicate] [Delete]      │
│                                         │
│  ○ home-expensive                       │
│    6 agents • High quality setup        │
│    [Activate] [Duplicate] [Delete]      │
│                                         │
├─────────────────────────────────────────┤
│  [+ Create New from Current]            │
│  [Import Profile] [Export Current]      │
├─────────────────────────────────────────┤
│  Recent: Changed Sisyphus 5 min ago     │
│  [Undo Last Change]                     │
└─────────────────────────────────────────┘
```

**Interactions**:
- Click profile → Show details, Activate button becomes primary
- Activate → Switch to that profile (with confirmation if unsaved changes)
- Duplicate → Create copy with "[name]-copy" suffix
- Export → Download JSON file
- Import → Upload JSON file, validate, add to list

**API Endpoints**:
- `GET /api/profiles` - List all profiles
- `POST /api/profiles/switch` - Switch active profile
- `POST /api/profiles` - Create new profile
- `POST /api/profiles/:name/duplicate` - Duplicate profile
- `GET /api/profiles/:name/export` - Export profile as JSON

---

### 4. Emergency Quick-Swap Dashboard

**Purpose**: When API credits run out, quickly find alternatives.

**Auto-Detection**:
- Monitor for `ProviderModelNotFoundError` or credit errors
- Show banner: "⚠️ Claude API credits exhausted"

**Layout**:
```
┌─────────────────────────────────────────┐
│  ⚠️ API Credits Exhausted (Anthropic)   │
├─────────────────────────────────────────┤
│  Current Profile: work-credits          │
│                                         │
│  AFFECTED AGENTS                        │
│  ┌─────────────────────────────────┐   │
│  │ Sisyphus                        │   │
│  │ claude-opus-4.5-thinking        │   │
│  │ ❌ API Error: credits exhausted │   │
│  └─────────────────────────────────┘   │
│                                         │
│  QUICK FIX OPTIONS                      │
│  ┌─────────────────────────────────┐   │
│  │ ⭐ Switch Sisyphus to Sonnet 4.5 │   │
│  │    95% match • Saves 65% cost    │   │
│  │    [Apply This Fix]              │   │
│  ├─────────────────────────────────┤   │
│  │ Switch ALL Claude models to GPT  │   │
│  │    Affects 3 agents • Same cost  │   │
│  │    [Apply This Fix]              │   │
│  ├─────────────────────────────────┤   │
│  │ ⚠️ Use Cheapest Alternatives     │   │
│  │    May lose thinking capability  │   │
│  │    [Apply This Fix]              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Preview Changes] [Save & Exit]       │
└─────────────────────────────────────────┘
```

**API Endpoints**:
- `GET /api/emergency/affected` - Get agents with errors
- `POST /api/emergency/fix` - Apply emergency fix
  - Body: `{ strategy: 'single' | 'all' | 'cheap', agent?: string, targetModel?: string }`

---

## Agent Documentation System

### Data Sources

We fetch agent information from multiple GitHub sources:

1. **AGENTS.md** - Overview table with models, fallbacks, costs
   - URL: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/src/agents/AGENTS.md`
   
2. **Individual agent files** - Full system prompts and behavior
   - URL pattern: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/src/agents/{agent-name}.ts`
   - Examples: `sisyphus.ts`, `oracle.ts`, `librarian.ts`

3. **Agent directories** - Complex agents with variants
   - `atlas/` - Contains `default.ts`, `gpt.ts`, `utils.ts`
   - `prometheus/` - Contains prompts, templates, interview mode
   - `sisyphus-junior/` - Contains agent variants

### Parsing Strategy

```javascript
// lib/core/agents.js

async function fetchAgentDocumentation(agentName) {
  // 1. Fetch the main agent TypeScript file
  const agentUrl = `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/src/agents/${agentName}.ts`;
  const agentCode = await fetchText(agentUrl);
  
  // 2. Extract metadata from PROMPT_METADATA export
  const metadataMatch = agentCode.match(/${agentName.toUpperCase()}_PROMPT_METADATA:\s*AgentPromptMetadata\s*=\s*({[\s\S]*?})/);
  const metadata = metadataMatch ? parseMetadata(metadataMatch[1]) : null;
  
  // 3. Extract description from create function
  const descriptionMatch = agentCode.match(/description:\s*"([^"]+)"/);
  const description = descriptionMatch ? descriptionMatch[1] : '';
  
  // 4. Extract key behaviors from prompt sections
  const roleMatch = agentCode.match(/<Role>([\s\S]*?)<\/Role>/);
  const behaviorMatch = agentCode.match(/<Behavior_Instructions>([\s\S]*?)<\/Behavior_Instructions>/);
  
  // 5. Check for directory-based variants
  const hasDirectory = await checkDirectoryExists(`src/agents/${agentName}/`);
  const variants = hasDirectory ? await fetchAgentVariants(agentName) : [];
  
  return {
    name: agentName,
    metadata,
    description,
    role: parseRoleSection(roleMatch?.[1]),
    behaviors: parseBehaviorSection(behaviorMatch?.[1]),
    variants,
    rawPrompt: extractFullPrompt(agentCode),
    lastFetched: new Date().toISOString()
  };
}
```

### Parsed Data Structure

```javascript
{
  "sisyphus": {
    "name": "Sisyphus",
    "title": "Primary Orchestrator",
    "metadata": {
      "category": "utility",
      "cost": "EXPENSIVE",
      "promptAlias": "Sisyphus",
      "triggers": []
    },
    "description": "Powerful AI orchestrator. Plans obsessively with todos, assesses search complexity before exploration, delegates strategically...",
    "role": {
      "identity": "SF Bay Area engineer. Work, delegate, verify, ship. No AI slop.",
      "coreCompetencies": [
        "Parsing implicit requirements",
        "Adapting to codebase maturity",
        "Delegating specialized work",
        "Parallel execution"
      ]
    },
    "keyBehaviors": [
      {
        "title": "Intent Gate (Phase 0)",
        "description": "Classify every request before acting"
      },
      {
        "title": "Task Management (CRITICAL)",
        "description": "Create tasks BEFORE starting non-trivial work"
      },
      {
        "title": "Delegation Pattern",
        "description": "NEVER work alone when specialists available"
      }
    ],
    "modelRequirements": {
      "recommended": "claude-opus-4-5",
      "minimumContext": 128000,
      "capabilities": ["reasoning", "thinking"],
      "fallbackChain": ["kimi-k2.5", "glm-4.7", "gpt-5.3-codex"]
    },
    "toolAccess": {
      "allowed": ["task", "explore", "librarian", "read", "oracle"],
      "denied": ["write", "edit", "execute"],
      "notes": "Delegates implementation to specialized agents"
    },
    "variants": [
      {
        "name": "default",
        "for": "Claude models",
        "features": ["thinking: 32k budget tokens"]
      },
      {
        "name": "gpt",
        "for": "GPT models",
        "features": ["reasoningEffort: medium"]
      }
    ],
    "whenToUse": [
      "Multi-step complex tasks requiring coordination",
      "Codebase-wide refactoring",
      "Architecture decisions needing multiple specialists"
    ],
    "antiPatterns": [
      "Trusting agent self-reports without verification",
      "Using high temperature (>0.3)",
      "Sequential calls when parallel possible"
    ],
    "rawPrompt": "<Role>\nYou are Sisyphus...",
    "lastFetched": "2025-02-11T19:45:00Z"
  }
}
```

### UI Integration

**Agent Documentation Card**:

```
┌─────────────────────────────────────────┐
│  Sisyphus                    [Model ▼]  │
│  Primary Orchestrator                   │
│  💰 EXPENSIVE  📦 utility               │
├─────────────────────────────────────────┤
│  [Overview] [System Prompt] [Tools]     │
│                                         │
│  WHAT SISYPHUS DOES                     │
│  Plans obsessively with todos, assesses │
│  search complexity, delegates via       │
│  category+skills combinations.        │
│                                         │
│  WHEN TO USE                            │
│  • Multi-step complex tasks            │
│  • Codebase-wide refactoring           │
│  • Architecture decisions              │
│                                         │
│  KEY BEHAVIORS                          │
│  ✅ Creates detailed todo lists         │
│  ✅ Delegates to specialized agents     │
│  ✅ Uses explore for internal code      │
│  ✅ Uses librarian for external docs    │
│  ✅ Never works alone (if possible)     │
│                                         │
│  MODEL REQUIREMENTS                     │
│  Minimum: 128K context                  │
│  Preferred: Reasoning + Thinking         │
│  Fallback: kimi-k2.5 → glm-4.7 → gpt   │
│                                         │
│  [View Alternatives] [Assign Model]     │
└─────────────────────────────────────────┘
```

---

## New Agent Discovery System

The tool must handle **agents that don't exist yet** — when Oh My Opencode adds new agents, we discover and integrate them automatically.

### Discovery Sources

**1. GitHub Repository Structure**
- Fetch directory listing: `https://api.github.com/repos/code-yeongyu/oh-my-openagent/contents/src/agents`
- Identify new `.ts` files and directories not in local cache
- Example response shows files like `hephaestus.ts`, `atlas/` (directory)

**2. AGENTS.md Table**
- Parse the markdown table showing all agents
- Extract: Agent Name, Recommended Model, Fallback Chain, Cost Tier
- Detect new rows not in local database

**3. Schema Definition**
- Fetch `oh-my-opencode.schema.json` from latest release
- Extract `BuiltinAgentNameSchema` enum values
- Compare with locally known agents

### Dynamic Agent Parsing

When a new agent is detected, we parse it **without hardcoded knowledge**:

```javascript
// lib/core/agent-discovery.js

async function discoverNewAgents() {
  const knownAgents = loadKnownAgents(); // From cache
  const upstreamAgents = await fetchUpstreamAgentList();
  
  const newAgents = upstreamAgents.filter(agent => 
    !knownAgents.some(known => known.name === agent.name)
  );
  
  for (const agent of newAgents) {
    console.log(`🆕 New agent detected: ${agent.name}`);
    
    // Fetch and parse the agent file
    const agentData = await fetchAndParseAgent(agent.name);
    
    // Infer profile from the code
    const inferredProfile = inferAgentProfile(agentData);
    
    // Store in cache
    await saveAgentToCache(agent.name, {
      ...agentData,
      inferredProfile,
      discoveredAt: new Date().toISOString()
    });
  }
  
  return newAgents;
}

async function fetchAndParseAgent(agentName) {
  // Try single file first
const fileUrl = `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/src/agents/${agentName}.ts`;
const dirUrl = `https://api.github.com/repos/code-yeongyu/oh-my-openagent/contents/src/agents/${agentName}`;
  
  let agentCode;
  let isDirectory = false;
  let directoryContents = [];
  
  try {
    agentCode = await fetchText(fileUrl);
  } catch (e) {
    // Try directory
    try {
      directoryContents = await fetchJson(dirUrl);
      isDirectory = true;
      // Fetch main agent.ts or default.ts from directory
      const mainFile = directoryContents.find(f => 
        f.name === 'agent.ts' || f.name === 'default.ts' || f.name === 'index.ts'
      );
      if (mainFile) {
        agentCode = await fetchText(mainFile.download_url);
      }
    } catch (dirError) {
      throw new Error(`Agent ${agentName} not found as file or directory`);
    }
  }
  
  return {
    name: agentName,
    code: agentCode,
    isDirectory,
    directoryContents,
    ...parseAgentCode(agentName, agentCode)
  };
}

function parseAgentCode(agentName, code) {
  const result = {
    metadata: {},
    description: '',
    role: {},
    behaviors: [],
    modelRequirements: {},
    toolAccess: { allowed: [], denied: [] },
    variants: [],
    rawPrompt: ''
  };
  
  // Extract PROMPT_METADATA
  const metadataRegex = new RegExp(
    `${agentName.toUpperCase().replace(/-/g, '_')}_PROMPT_METADATA\\s*:\\s*AgentPromptMetadata\s*=\s*({[\\s\\S]*?})(?:;|$)`,
    'i'
  );
  const metadataMatch = code.match(metadataRegex);
  if (metadataMatch) {
    result.metadata = parseMetadataObject(metadataMatch[1]);
  }
  
  // Extract description from create function
  const descMatch = code.match(/description:\s*"([^"]+)"/);
  if (descMatch) {
    result.description = descMatch[1];
  }
  
  // Extract role section
  const roleMatch = code.match(/<Role>([\s\S]*?)<\/Role>/);
  if (roleMatch) {
    result.role = parseRoleSection(roleMatch[1]);
  }
  
  // Extract behavior instructions
  const behaviorMatch = code.match(/<Behavior_Instructions>([\s\S]*?)<\/Behavior_Instructions>/);
  if (behaviorMatch) {
    result.behaviors = parseBehaviorSection(behaviorMatch[1]);
  }
  
  // Extract constraints (tool access)
  const constraintsMatch = code.match(/<Constraints>([\s\S]*?)<\/Constraints>/);
  if (constraintsMatch) {
    result.toolAccess = parseToolConstraints(constraintsMatch[1]);
  }
  
  // Extract full prompt (for display)
  const promptMatch = code.match(/return\s+`([\s\S]*?)`;?\s*}$/);
  if (promptMatch) {
    result.rawPrompt = promptMatch[1];
  }
  
  return result;
}

function inferAgentProfile(agentData) {
  // Infer capabilities from the agent code
  const profile = {
    name: agentData.name,
    description: agentData.description || `${agentData.name} agent`,
    preferred: [],
    minContext: 128000,
    inferred: true
  };
  
  // Infer from metadata cost
  if (agentData.metadata?.cost === 'EXPENSIVE') {
    profile.preferred.push('reasoning');
    profile.preferred.push('large_context');
    profile.minContext = 200000;
  } else if (agentData.metadata?.cost === 'CHEAP') {
    profile.preferred.push('fast');
  }
  
  // Infer from category
  if (agentData.metadata?.category === 'multimodal') {
    profile.preferred.push('multimodal');
    profile.preferred.push('image_input');
  }
  
  // Infer from role content
  const roleText = JSON.stringify(agentData.role).toLowerCase();
  if (roleText.includes('thinking') || roleText.includes('reasoning')) {
    if (!profile.preferred.includes('reasoning')) {
      profile.preferred.push('reasoning');
    }
  }
  
  // Infer from tool access
  if (agentData.toolAccess?.denied?.includes('write')) {
    // Read-only agent likely needs large context for analysis
    if (!profile.preferred.includes('large_context')) {
      profile.preferred.push('large_context');
    }
  }
  
  return profile;
}

function parseMetadataObject(code) {
  // Simple object parser for TypeScript metadata
  // category: "utility", cost: "EXPENSIVE" → { category: "utility", cost: "EXPENSIVE" }
  const metadata = {};
  const pairs = code.match(/(\w+):\s*"([^"]+)"/g);
  if (pairs) {
    pairs.forEach(pair => {
      const [key, value] = pair.split(':').map(s => s.trim().replace(/"/g, ''));
      metadata[key] = value;
    });
  }
  return metadata;
}
```

### New Agent Integration Flow

When a new agent is detected:

```javascript
// UI flow for new agent
async function handleNewAgent(agentName) {
  // 1. Show notification
  showToast(`🆕 New agent available: ${agentName}`, 'info', { 
    action: 'Review',
    onAction: () => openNewAgentModal(agentName)
  });
  
  // 2. User reviews the agent
  const agentData = await fetchAgentDocumentation(agentName);
  
  // 3. Show inferred profile with edit option
  const inferredProfile = agentData.inferredProfile;
  
  // 4. User can:
  //    - Accept inferred profile
  //    - Edit profile (change min context, capabilities)
  //    - Skip this agent
  //    - Add to current profile with recommended model
  
  // 5. If added, create backup first
  await createBackup();
  
  // 6. Add to current configuration
  const recommendedModel = findRecommendedModel(agentData);
  await addAgentToCurrentProfile(agentName, recommendedModel);
  
  // 7. Mark as integrated
  markAgentAsIntegrated(agentName);
}
```

### Directory-Based Agent Handling

Some agents (like `atlas/`, `prometheus/`, `sisyphus-junior/`) are directories:

```javascript
async function parseDirectoryAgent(agentName, directoryContents) {
  const variants = [];
  
  // Look for variant files
  for (const file of directoryContents) {
    if (file.name.endsWith('.ts')) {
      const code = await fetchText(file.download_url);
      
      // Detect variant type from filename
      let variantType = 'default';
      if (file.name.includes('gpt')) variantType = 'gpt';
      if (file.name.includes('claude')) variantType = 'claude';
      
      variants.push({
        type: variantType,
        filename: file.name,
        code,
        ...parseAgentCode(agentName, code)
      });
    }
  }
  
  // Find main agent.ts or use default.ts
  const mainVariant = variants.find(v => 
    v.filename === 'agent.ts' || v.filename === 'default.ts'
  ) || variants[0];
  
  return {
    name: agentName,
    isDirectory: true,
    variants,
    mainVariant,
    // Use main variant for primary data
    ...mainVariant
  };
}
```

### New Agent UI

**Notification Banner**:
```
┌─────────────────────────────────────────┐
│  🆕 New Agent Available                 │
│  'hephaestus' - Autonomous Deep Worker  │
│  [Review Agent] [Add to Profile] [Dismiss]│
└─────────────────────────────────────────┘
```

**New Agent Review Modal**:
```
┌─────────────────────────────────────────┐
│  hephaestus                  [X]        │
│  Autonomous Deep Worker                 │
│  💰 EXPENSIVE (inferred)                │
├─────────────────────────────────────────┤
│                                         │
│  AUTO-DETECTED PROFILE                  │
│  This agent appears to need:            │
│  • Reasoning capability                 │
│  • Large context (200K+)                │
│  • Extended thinking                    │
│                                         │
│  [Edit Requirements]                    │
│                                         │
│  RECOMMENDED MODELS                     │
│  Based on agent characteristics:        │
│                                         │
│  1. gpt-5.3-codex (OmO default)       │
│     128K • R • $$                       │
│     [Use This]                          │
│                                         │
│  2. claude-opus-4.5                     │
│     200K • R • T • $$$                  │
│     [Use This]                          │
│                                         │
│  3. Choose manually...                  │
│                                         │
├─────────────────────────────────────────┤
│  [Cancel]      [Add to Profile]         │
└─────────────────────────────────────────┘
```

### Caching Strategy

```javascript
// lib/core/agent-cache.js

const AGENT_CACHE_DIR = path.join(CACHE_DIR, 'agents');

async function saveAgentToCache(agentName, data) {
  const cachePath = path.join(AGENT_CACHE_DIR, `${agentName}.json`);
  await fs.mkdir(AGENT_CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
}

async function loadAgentFromCache(agentName) {
  const cachePath = path.join(AGENT_CACHE_DIR, `${agentName}.json`);
  try {
    const data = await fs.readFile(cachePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

async function getAllCachedAgents() {
  try {
    const files = await fs.readdir(AGENT_CACHE_DIR);
    const agents = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const agentName = file.replace('.json', '');
      const data = await loadAgentFromCache(agentName);
      if (data) agents.push(data);
    }
    return agents;
  } catch (e) {
    return [];
  }
}

async function refreshAgentCache() {
  // Fetch all agents from GitHub
  const upstreamAgents = await fetchUpstreamAgentList();
  const currentAgents = await getAllCachedAgents();
  
  // Update existing agents
  for (const agentName of upstreamAgents) {
    const cached = await loadAgentFromCache(agentName);
    
    // Check if we need to refresh (older than 24 hours)
    if (!cached || shouldRefresh(cached.lastFetched)) {
      console.log(`Refreshing agent: ${agentName}`);
      const freshData = await fetchAndParseAgent(agentName);
      await saveAgentToCache(agentName, freshData);
    }
  }
  
  // Detect new agents
  const newAgents = upstreamAgents.filter(name => 
    !currentAgents.some(a => a.name === name)
  );
  
  return newAgents;
}
```

### API Endpoints for Agent Discovery

```javascript
// GET /api/agents/discover
{
  "newAgents": [
    {
      "name": "hephaestus",
      "detectedAt": "2025-02-11T20:00:00Z",
      "source": "github",
      "inferredProfile": {
        "preferred": ["reasoning", "large_context"],
        "minContext": 200000
      },
      "recommendedModels": [
        { "modelId": "openai/gpt-5.3-codex", "score": 95 },
        { "modelId": "anthropic/claude-opus-4-5", "score": 90 }
      ]
    }
  ],
  "totalAgents": 11,
  "cachedAgents": 9
}

// POST /api/agents/:name/integrate
{
  "modelId": "openai/gpt-5.3-codex",
  "acceptInferredProfile": true
}

// Response
{
  "success": true,
  "agent": "hephaestus",
  "model": "openai/gpt-5.3-codex",
  "profile": {
    "preferred": ["reasoning", "large_context"],
    "minContext": 200000
  },
  "backupCreated": "2025-02-11-200530",
  "addedToCurrentProfile": true
}

// GET /api/agents/:name/refresh
// Force re-fetch from GitHub
{
  "success": true,
  "agent": "sisyphus",
  "lastFetched": "2025-02-11T20:05:00Z",
  "changesDetected": false
}
```

---

## Handling Agent Updates

When an existing agent's code changes:

```javascript
async function detectAgentChanges() {
  const agents = await getAllCachedAgents();
  const changes = [];
  
  for (const agent of agents) {
    // Fetch fresh code
    const fresh = await fetchAgentCode(agent.name);
    const freshHash = hashCode(fresh);
    const cachedHash = agent.codeHash;
    
    if (freshHash !== cachedHash) {
      console.log(`Agent ${agent.name} has changed`);
      
      // Parse fresh data
      const freshData = parseAgentCode(agent.name, fresh);
      
      // Check for significant changes
      const significantChanges = [];
      if (freshData.metadata?.cost !== agent.metadata?.cost) {
        significantChanges.push(`Cost: ${agent.metadata?.cost} → ${freshData.metadata?.cost}`);
      }
      if (freshData.description !== agent.description) {
        significantChanges.push('Description changed');
      }
      
      changes.push({
        agent: agent.name,
        significantChanges,
        shouldRefresh: significantChanges.length > 0
      });
      
      // Update cache
      await saveAgentToCache(agent.name, {
        ...freshData,
        codeHash: freshHash,
        lastFetched: new Date().toISOString()
      });
    }
  }
  
  return changes;
}
```

---

## API Specification

### Base URL

```
http://localhost:3456/api
```

Port selection:
1. Try 3456
2. If taken, try 3457, 3458...
3. Print actual URL on startup

### Endpoints

#### Models

**GET /models**
```javascript
// Response
{
  "models": [
    {
      "id": "anthropic/claude-opus-4-5",
      "name": "Claude Opus 4.5",
      "providerID": "anthropic",
      "provider": "Anthropic",
      "limit": { "context": 200000 },
      "capabilities": {
        "reasoning": true,
        "input": { "image": false, "pdf": false },
        "interleaved": { "field": "thinking" }
      },
      "cost": { "input": 15, "output": 75 }
    }
  ],
  "providers": ["anthropic", "openai", "google", "opencode"],
  "total": 243,
  "cached": true,
  "fetchedAt": "2025-02-11T19:30:00Z"
}
```

**GET /models?search=opus&provider=anthropic&capability=reasoning&minContext=128000**

Query params:
- `search` - Text search in name/id
- `provider` - Filter by provider ID
- `capability` - Filter by capability (reasoning, image, pdf, thinking)
- `minContext` - Minimum context window size
- `maxCost` - Maximum cost tier (cheap, moderate, expensive)

**POST /models/refresh**
```javascript
// Force re-fetch from opencode CLI
// Response: Same as GET /models with cached: false
```

#### Agents

**GET /agents**
```javascript
// Response
{
  "agents": [
    {
      "name": "sisyphus",
      "title": "Primary Orchestrator",
      "currentModel": "anthropic/claude-opus-4-5",
      "modelName": "Claude Opus 4.5",
      "metadata": { "cost": "EXPENSIVE", "category": "utility" },
      "hasDocumentation": true
    }
  ],
  "total": 9
}
```

**GET /agents/:name**
```javascript
// Full agent documentation (parsed from GitHub)
{
  "name": "sisyphus",
  "title": "Primary Orchestrator",
  "metadata": { ... },
  "description": "...",
  "role": { ... },
  "keyBehaviors": [...],
  "modelRequirements": { ... },
  "toolAccess": { ... },
  "whenToUse": [...],
  "antiPatterns": [...],
  "rawPrompt": "...",
  "variants": [...],
  "lastFetched": "2025-02-11T19:45:00Z"
}
```

**GET /agents/:name/alternatives?currentModel=X&strategy=capability**

Query params:
- `currentModel` - Current model ID (required)
- `strategy` - Scoring strategy: `capability` (default), `cost`, `balanced`

```javascript
// Response
{
  "currentModel": "anthropic/claude-opus-4-5",
  "alternatives": [
    {
      "model": { ... },
      "score": 95,
      "capabilityMatch": 95,  // Percentage
      "costDelta": -65,        // Percentage savings
      "reasons": [
        "Maintains reasoning capability",
        "Maintains thinking capability",
        "128K context (was 200K)",
        "65% cost reduction"
      ],
      "tradeoffs": ["Smaller context window"]
    }
  ]
}
```

**POST /agents/:name/model**
```javascript
// Request
{
  "modelId": "anthropic/claude-sonnet-4-5"
}

// Response
{
  "success": true,
  "agent": "sisyphus",
  "previousModel": "anthropic/claude-opus-4-5",
  "newModel": "anthropic/claude-sonnet-4-5",
  "backupCreated": "2025-02-11-194502",
  "unsavedChanges": true
}
```

#### Profiles

**GET /profiles**
```javascript
{
  "profiles": [
    {
      "name": "work-credits",
      "description": "Work setup with cheaper models",
      "isActive": true,
      "agentCount": 9,
      "modifiedAt": "2025-02-11T18:30:00Z",
      "agents": {
        "sisyphus": "anthropic/claude-sonnet-4-5",
        "oracle": "openai/gpt-5.4"
        // ...
      }
    }
  ],
  "activeProfile": "work-credits"
}
```

**POST /profiles/switch**
```javascript
// Request
{
  "name": "home-expensive"
}

// Response
{
  "success": true,
  "previousProfile": "work-credits",
  "newProfile": "home-expensive",
  "changes": [
    { "agent": "sisyphus", "from": "claude-sonnet", "to": "claude-opus" }
  ],
  "backupCreated": "2025-02-11-194530"
}
```

**POST /profiles**
```javascript
// Create new profile from current config
// Request
{
  "name": "experiment-2025-02",
  "description": "Testing Gemini models",
  "fromCurrent": true  // or provide full config
}

// Response
{
  "success": true,
  "profile": {
    "name": "experiment-2025-02",
    "description": "Testing Gemini models",
    "createdAt": "2025-02-11T19:50:00Z"
  }
}
```

**POST /profiles/:name/duplicate**
```javascript
// Response
{
  "success": true,
  "newProfile": "work-credits-copy",
  "sourceProfile": "work-credits"
}
```

**DELETE /profiles/:name**

**GET /profiles/:name/export**
```javascript
// Returns raw JSON file for download
```

**POST /profiles/import**
```javascript
// Multipart form upload
// Response
{
  "success": true,
  "profile": {
    "name": "imported-config",
    "importedAt": "2025-02-11T19:55:00Z"
  }
}
```

#### Backups

**GET /backups**
```javascript
{
  "backups": [
    {
      "timestamp": "2025-02-11-194502",
      "profile": "work-credits",
      "size": 2847,
      "createdAt": "2025-02-11T19:45:02Z",
      "path": "~/.config/opencode/backups/oh-my-opencode-2025-02-11-194502.json"
    }
  ],
  "total": 42
}
```

**POST /backups**
```javascript
// Create manual backup
{
  "success": true,
  "backup": {
    "timestamp": "2025-02-11-200000",
    "path": "..."
  }
}
```

**POST /backups/:timestamp/restore**
```javascript
{
  "success": true,
  "restoredProfile": "work-credits",
  "fromBackup": "2025-02-11-194502",
  "currentBackedUp": true  // Current state backed up before restore
}
```

#### Upstream Sync

**GET /upstream/status**
```javascript
{
  "lastCheck": "2025-02-11T19:00:00Z",
  "schemaVersion": "v3.2.1",
  "newAgentsAvailable": true,
  "newAgents": ["hephaestus"],
  "missingInProfile": ["hephaestus"],
  "agentsDocumentation": {
    "lastFetched": "2025-02-11T19:00:00Z",
    "totalAgents": 11,
    "cachedAgents": 9
  }
}
```

**POST /upstream/sync**
```javascript
// Request options
{
  "fetchAgents": true,        // Re-fetch agent docs from GitHub
  "addMissingAgents": true,   // Add missing agents to current profile
  "useRecommendedModels": true // Use OmO recommended models for new agents
}

// Response
{
  "success": true,
  "actions": [
    {
      "type": "agent_added",
      "agent": "hephaestus",
      "model": "openai/gpt-5.3-codex",
      "recommendedBy": "upstream"
    }
  ],
  "backupCreated": "2025-02-11-200105"
}
```

#### Emergency

**GET /emergency/status**
```javascript
{
  "hasErrors": true,
  "errors": [
    {
      "agent": "sisyphus",
      "model": "anthropic/claude-opus-4-5",
      "error": "ProviderModelNotFoundError",
      "message": "API credits exhausted",
      "detectedAt": "2025-02-11T19:40:00Z"
    }
  ],
  "affectedProviders": ["anthropic"]
}
```

**POST /emergency/fix**
```javascript
// Request
{
  "strategy": "single",  // or "all", "cheap"
  "agent": "sisyphus",   // required for "single"
  "targetModel": "anthropic/claude-sonnet-4-5"  // optional
}

// Response
{
  "success": true,
  "fixes": [
    {
      "agent": "sisyphus",
      "from": "anthropic/claude-opus-4-5",
      "to": "anthropic/claude-sonnet-4-5",
      "capabilityMatch": 95,
      "costSavings": 65
    }
  ],
  "backupCreated": "2025-02-11-200200",
  "unsavedChanges": true
}
```

---

## Frontend Architecture

### File: `lib/web/app.js`

```javascript
// State Management (simple, no frameworks)
const state = {
  models: [],
  agents: [],
  profiles: [],
  currentProfile: null,
  filters: {
    search: '',
    providers: [],
    capabilities: [],
    minContext: 0
  },
  unsavedChanges: false,
  isLoading: false
};

// API Client
const api = {
  async getModels(filters = {}) { ... },
  async getAgents() { ... },
  async getAgentAlternatives(agent, currentModel) { ... },
  async setAgentModel(agent, modelId) { ... },
  async getProfiles() { ... },
  async switchProfile(name) { ... },
  async createProfile(name, description) { ... }
};

// UI Components (functions returning HTML strings)
const components = {
  ModelCard(model, isAssigned) { ... },
  AgentModal(agent, alternatives) { ... },
  ProfilePanel(profiles, current) { ... },
  FilterBar(filters) { ... },
  EmergencyBanner(errors) { ... }
};

// Event Handlers
document.addEventListener('DOMContentLoaded', () => {
  init();
  loadModels();
  loadAgents();
  checkEmergencyStatus();
});

function init() { ... }
function loadModels() { ... }
function loadAgents() { ... }
function checkEmergencyStatus() { ... }
```

### Key Features

**Real-time Search**:
```javascript
function handleSearchInput(value) {
  state.filters.search = value;
  const filtered = filterModels(state.models, state.filters);
  renderModelGrid(filtered);
}

function filterModels(models, filters) {
  return models.filter(model => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const match = model.name.toLowerCase().includes(searchLower) ||
                   model.id.toLowerCase().includes(searchLower) ||
                   model.provider.toLowerCase().includes(searchLower);
      if (!match) return false;
    }
    
    if (filters.providers.length && !filters.providers.includes(model.providerID)) {
      return false;
    }
    
    if (filters.capabilities.length) {
      const hasAll = filters.capabilities.every(cap => 
        model.capabilities[cap] || 
        (cap === 'thinking' && model.capabilities.interleaved)
      );
      if (!hasAll) return false;
    }
    
    if (filters.minContext && model.limit.context < filters.minContext) {
      return false;
    }
    
    return true;
  });
}
```

**Model Scoring for Alternatives**:
```javascript
function scoreAlternative(model, currentModel, agentProfile) {
  let score = 0;
  const reasons = [];
  const tradeoffs = [];
  
  // Capability matching
  const currentCaps = getCapabilities(currentModel);
  const newCaps = getCapabilities(model);
  
  for (const [cap, weight] of Object.entries(agentProfile.requiredCapabilities)) {
    if (newCaps[cap] && currentCaps[cap]) {
      score += weight;
    } else if (!newCaps[cap] && currentCaps[cap]) {
      score -= weight * 2;
      tradeoffs.push(`Loses ${cap}`);
    }
  }
  
  // Context window comparison
  const contextRatio = model.limit.context / currentModel.limit.context;
  if (contextRatio >= 1) {
    score += 10;
    reasons.push(`Same or larger context (${model.limit.context}K)`);
  } else if (contextRatio >= 0.5) {
    score += 5;
    tradeoffs.push(`Smaller context (${model.limit.context}K vs ${currentModel.limit.context}K)`);
  } else {
    score -= 10;
    tradeoffs.push(`Significantly smaller context`);
  }
  
  // Cost consideration
  const costSavings = calculateCostSavings(currentModel, model);
  if (costSavings > 50) {
    score += 5;
    reasons.push(`${costSavings}% cost savings`);
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    tradeoffs,
    capabilityMatch: calculateCapabilityMatch(currentCaps, newCaps)
  };
}
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)

**Goals**:
- HTTP server with static file serving
- API routes structure
- Model fetching from OpenCode
- Basic HTML/CSS/JS frontend

**Deliverables**:
- `lib/server.js` - Working HTTP server
- `lib/core/models.js` - Model fetching with caching
- `lib/web/index.html` - Basic app shell
- `lib/web/app.js` - API client and state management
- `bin/opencode-agent-config` - Server launcher

**Test**:
```bash
opencode-agent-config
# Should open browser to localhost:3456
# Should show loading state
# Should display model list
```

### Phase 2: Model Browser (Days 3-4)

**Goals**:
- Model grid with real filtering
- Search and filter UI
- Model cards with assignments
- "View Alternatives" flow

**Deliverables**:
- Model grid component
- Filter bar (providers, capabilities, context)
- Real-time search
- Agent assignment modal
- Model scoring algorithm

**Test**:
- Type "opus" in search → only Opus models show
- Check "Reasoning" filter → only reasoning models
- Click "View Alternatives" on Sisyphus → see ranked alternatives
- Select alternative → model assigned (unsaved state)

### Phase 3: Profile Management (Days 5-6)

**Goals**:
- Profile CRUD operations
- Profile switcher UI
- Import/export functionality
- "Save Changes" workflow

**Deliverables**:
- Profile list component
- Create/duplicate/delete profile
- Export as JSON
- Import from JSON
- Save/unsaved changes indicator

**Test**:
- Create "test-profile" from current
- Switch to "omo-default" → confirm changes lost
- Export profile → valid JSON
- Import exported profile → appears in list

### Phase 4: Agent Documentation (Days 7-8)

**Goals**:
- Fetch agent docs from GitHub
- Parse system prompts and metadata
- Agent documentation UI
- "When to use" guidance

**Deliverables**:
- `lib/core/agents.js` - GitHub fetching and parsing
- Agent documentation modal
- "What this agent does" section
- Model requirements display
- Fallback chains

**Test**:
- Click on "Sisyphus" agent → show documentation
- Should show: role, behaviors, requirements
- Should parse PROMPT_METADATA correctly
- Should show variants (GPT vs Claude prompts)

### Phase 5: Emergency Mode (Days 9-10)

**Goals**:
- Detect credit exhaustion errors
- Emergency dashboard UI
- One-click fixes
- Cost-saving recommendations

**Deliverables**:
- Error detection (parse opencode error output)
- Emergency banner component
- Quick fix options
- Batch fix strategies
- Preview changes before applying

**Test**:
- Simulate API error → emergency banner shows
- Click "Switch to Sonnet" → preview shows
- Confirm → model switched, backup created

### Phase 6: Upstream Sync (Days 11-12)

**Goals**:
- Check Oh My Opencode GitHub for new agents
- Detect missing agents in profile
- One-click add with recommended models

**Deliverables**:
- GitHub API integration for releases
- Agent availability checker
- "New agents available" notification
- Add missing agent flow

**Test**:
- Fetch upstream schema → compare with local
- If new agent "hephaestus" exists upstream but not local → notify
- Click "Add Agent" → added with recommended model

### Phase 7: Polish & CLI (Days 13-14)

**Goals**:
- Reduce CLI to profile switcher
- Error handling
- Loading states
- Keyboard shortcuts

**Deliverables**:
- Simplified CLI: `opencode-agent-config [profile]`
- Error boundaries in UI
- Loading skeletons
- Keyboard navigation (Ctrl+K search, etc.)

**Test**:
```bash
opencode-agent-config work-credits
# Should instantly switch profile and exit
```

---

## Technical Considerations

### Caching Strategy

```javascript
// lib/core/cache.js
const CACHE_TTL = {
  models: 5 * 60 * 1000,        // 5 minutes
  agents: 60 * 60 * 1000,       // 1 hour
  upstream: 24 * 60 * 60 * 1000 // 24 hours
};

function shouldRefresh(cacheKey, ttl) {
  const cached = loadCache(cacheKey);
  if (!cached) return true;
  return Date.now() - cached.timestamp > ttl;
}
```

### Error Handling

```javascript
// API wrapper with error handling
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(error.message, error.code);
    }
    
    return await response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    
    // Network or parsing error
    showToast('Failed to connect to server. Is it running?', 'error');
    throw err;
  }
}
```

### Security (Local Only)

Since this is a local-only tool:
- No authentication needed
- Bind to localhost only: `server.listen(port, '127.0.0.1')`
- No CORS restrictions (local files)
- File system access limited to `~/.config/opencode/`

### Backup Strategy

Every destructive operation creates a backup:
```javascript
async function saveConfiguration(config) {
  // 1. Create backup
  const backup = await createBackup();
  
  // 2. Write new config
  await writeConfig(config);
  
  // 3. Return backup info
  return { backup, success: true };
}
```

---

## Open Questions

1. **Port selection**: Auto-increment on conflict, or config file?
2. **Browser opening**: Use `open`/`xdg-open` command, or print URL?
3. **Offline mode**: Cache last-known models for offline use?
4. **Model validation**: Should we validate model IDs against schema?
5. **Git sync**: Should profiles be git-tracked in `.opencode/profiles/`?

---

## Success Metrics

- [ ] Web UI loads in <2 seconds
- [ ] Model search filters in <100ms
- [ ] Profile switch completes in <500ms
- [ ] Emergency fix applies in 2 clicks
- [ ] Agent docs fetch successfully from GitHub
- [ ] CLI profile switch works: `opencode-agent-config <profile>`

---

## Appendix A: Current vs New Comparison

| Feature | Current CLI | New Web UI |
|---------|-------------|------------|
| Browse models | Numbered list | Visual grid with filters |
| Search | Type to filter | Real-time search + filters |
| Change model | 5+ keystrokes | 2 clicks |
| See agent info | `?` then scroll | Click card, read docs |
| Switch profile | `M` → navigate → select | Click profile, click activate |
| Emergency swap | Manual edit JSON | One-click alternatives |
| New agent alert | Text on startup | Visual notification |
| Backup | Automatic, hidden | Visible, one-click restore |

---

## Appendix B: File Migration

**Files to keep (refactored)**:
- `lib/constants.js` → Trimmed, add new constants
- `lib/core/models.js` ← `lib/model-loader.js`
- `lib/core/profiles.js` ← `lib/config-manager.js`
- `lib/core/upstream.js` ← Enhanced `lib/upstream.js`

**Files to create**:
- `lib/server.js` - New
- `lib/core/backup.js` - New (extract from config-manager)
- `lib/core/agents.js` - New
- `lib/web/*` - New

**Files to remove**:
- `lib/ui/menus.js` - Replaced by web UI
- `lib/ui/prompts.js` - Replaced by web UI
- `lib/ui/config-menus.js` - Replaced by web UI

**Files to update**:
- `bin/opencode-agent-config` - Simplified launcher
- `install.sh` - Copy new web/ directory
- `README.md` - Document new workflow

---

*Document Version: 1.0*  
*Last Updated: 2025-02-11*  
*Author: Sisyphus*
