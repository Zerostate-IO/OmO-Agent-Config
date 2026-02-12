# OmO Agent Config v2.0 - Design Summary

**Status**: Design Complete  
**Date**: 2025-02-11  
**Next Step**: Implementation Phase 1

---

## What We've Designed

### 1. Complete Architecture Overhaul
- **From**: CLI-first with TUI menus
- **To**: Web-first with local HTTP server
- **CLI reduced to**: Quick profile switching only

### 2. Five Core UI Screens (Stitch Mockups Generated)

All mockups are in Stitch project: `OmO Agent Config - Web UI Design` (ID: 5643911846610960569)

#### Screen 1: Model Browser Dashboard
- **File**: `21bfba798d4148b3a991efefa573e6b8`
- **View**: [Screenshot](https://lh3.googleusercontent.com/aida/AOfcidVdjEY8cI7fK-EesYpYtmAqE8Yu5CHQh05LEtPwT6OozybfdlvBK5Ha8Sqty_Zg6Un1zoh7JwHU6_zPVHvseYr9KjxnptDpXQNqrC6XCZdh0hdWTZ1AKZH8RMdcqv-PxQv7KehfFCW8hB0BFCbQdAd88DyyvFveTBsZ9YCA1Ndo7qVN59g_nRhdV4jIjzMh8-o8O_43kj3A0tvQ9LpU5FzNluJxlADp7Q6XvYtq2uU5lRZTVG8QpDii9TA)
- **Purpose**: Browse all 200+ models with real-time filtering
- **Features**:
  - Search by name/provider
  - Filter by capabilities (Reasoning, Multimodal, etc.)
  - Context size filtering
  - Visual model cards with assignments

#### Screen 2: Agent Configuration Modal
- **File**: `d749ccb85ce545ab9689c793706f2080`
- **View**: [Screenshot](https://lh3.googleusercontent.com/aida/AOfcidWn-5ieg2zd6yEVxlRzKO2bJ4JChagc4dcbSNwxWhG7XlrlLtmyo6C2L69F5xEWohd7nZYLLW2a9wLuLbBIasumFgqfTsclWAldux1MriP1-dFywLEm0jERYygoWbDZsoOI36v59jBoD9iXzU0uFBEagHGAiLt6wxCGNZyyQg-jgy5zMVNtuHsGlvMOScc8_C5zIY21furMU7lYZ1Uaq6_HRs1RLTssmR6CsGlzLUapDbYfyus-AEfoOxQ)
- **Purpose**: Switch models for a specific agent
- **Features**:
  - Current model display
  - Alternative models ranked by capability match
  - Cost savings indicators
  - One-click switch

#### Screen 3: Profile Management Panel
- **File**: `a5252493a001424cadf4cd74b7ca0698`
- **View**: [Screenshot](https://lh3.googleusercontent.com/aida/AOfcidU4NSpzp7xV2lUmbD4FpGFEQqjTMZw4gryrv6bL-b-iCp0OtdzLE7YMN-6inNfPzqP8VQ5n7fbI0CFxpLtzdHjgCvlrHKnGoJzrYqX4IYowAPq8Y9wMbQHPKLLpZdO1pIQRdXh0EBYnU0j8i2RppDQZPtkzxuK0CacowMhfcPg2bmxZcTFubDH6K0JNPPIR80SwAoUaaxeBaecDdMF5OOt3-89G-sglSIPcwKR-Utvw8u023kYMOKetulE)
- **Purpose**: Switch between saved configuration profiles
- **Features**:
  - Active profile highlight
  - One-click activation
  - Duplicate/delete profiles
  - Import/export
  - Recent activity with undo

#### Screen 4: Emergency Quick-Swap Dashboard
- **File**: `f41357459aa54bfdb0e7e3f54623d047`
- **View**: [Screenshot](https://lh3.googleusercontent.com/aida/AOfcidUiFBbBbEdDbs2f1zRaF7N2eEq1hztF_7GUTtCEjvxKaDXuJgcGYlbpbCSYw0fusPBclu7ldseKM4_024J-rd8N7ilK-Q60nAbY5Fk8N9kSGMCC7K28eAU0vvep_ISFEdJpXXYokF5t_EaHfxlJOZ1CcG4qzGaVCdGG5z-DEAOA2RvWYBIKz8OvmFz5m1EW7miYJymzOfIFuxhuV2W_AK0_Kf-lBfmSKSdUuk-hdH1W6tRGroFimfr74w)
- **Purpose**: Emergency workflow when API credits exhausted
- **Features**:
  - Detects affected agents
  - One-click fix options
  - Capability match scores
  - Cost savings preview
  - Batch fix strategies

#### Screen 5: Agent Documentation Modal
- **File**: `297533244f954bab8a2fee64f50c9fe5`
- **View**: [Screenshot](https://lh3.googleusercontent.com/aida/AOfcidWLjDX75SN6sYpXujZB06fPp9zBn-s77UXYCxEVtKoBYUkM_ZJIUW_ajJSb_mxOncAF_QYUGEyhdUTTy0XpWSeApvUcZHcw8LGQIUakHNgO0G3geWp-sRuvie-4vd1BqhF6S6kx-mutAYAD1vEpniAVDg0TcEoVL_fdS-jaOn67GErEEIiLIlYwv4GRIBa8iad__iymBKaa2emMBIus8Ic2c9MORrRyrI36h66C7NM8AupNJxnM-VDmrpE)
- **Purpose**: Full agent documentation from GitHub
- **Features**:
  - What agent does
  - When to use it
  - Key behaviors
  - Model requirements
  - Tool access restrictions
  - System prompt viewer

---

## Key Technical Decisions

### Zero Dependencies Maintained
- HTTP server: Node.js built-in `http` module
- Frontend: Vanilla JavaScript + CSS
- No npm packages, no build step
- Static files served from `lib/web/`

### Data Flow
```
GitHub (source of truth)
    ↓
Fetch agent docs, models, schema
    ↓
Parse and cache locally (~/.config/opencode/cache/)
    ↓
Serve via HTTP API (localhost:3456)
    ↓
Display in browser UI
    ↓
User makes changes
    ↓
    Save to oh-my-opencode.jsonc (with backup)
```

### CLI Simplified
```bash
# Launch web UI (default)
opencode-agent-config

# Quick switch to profile
opencode-agent-config work-credits
# Output: ✓ Switched to 'work-credits' (Sisyphus: claude-opus-4.5 → claude-sonnet-4.5)

# List profiles
opencode-agent-config --list
```

---

## New Agent Discovery

The tool will automatically handle **future agents** from Oh My Opencode:

1. **Detection**: Check GitHub repo for new `.ts` files in `src/agents/`
2. **Parsing**: Dynamically parse agent code without hardcoded knowledge
3. **Profile Inference**: Determine capabilities from code analysis
4. **Integration**: One-click add with recommended models
5. **Caching**: Store parsed agent data locally

### Discovery Sources
- GitHub directory listing API
- AGENTS.md markdown table
- Individual agent TypeScript files
- Directory-based agents (atlas/, prometheus/, etc.)

---

## Implementation Roadmap

### Phase 1: Foundation (2-3 days)
- [ ] Create `lib/server.js` with HTTP server
- [ ] Set up `lib/web/` directory structure
- [ ] Implement model fetching from `opencode models --verbose`
- [ ] Basic HTML/CSS/JS frontend shell
- [ ] Simplified CLI launcher

### Phase 2: Model Browser (3-4 days)
- [ ] Model grid component
- [ ] Real-time search and filtering
- [ ] Capability badges
- [ ] "View Alternatives" flow
- [ ] Model scoring algorithm

### Phase 3: Profile Management (2-3 days)
- [ ] Profile CRUD operations
- [ ] Profile switcher UI
- [ ] Import/export functionality
- [ ] Unsaved changes indicator
- [ ] Backup creation on save

### Phase 4: Agent Documentation (2-3 days)
- [ ] GitHub fetching for agent docs
- [ ] Parse TypeScript agent files
- [ ] Extract metadata, prompts, behaviors
- [ ] Agent documentation modal
- [ ] System prompt viewer

### Phase 5: Emergency Mode (2 days)
- [ ] Error detection (credit exhaustion)
- [ ] Emergency dashboard UI
- [ ] One-click fix options
- [ ] Cost-saving recommendations
- [ ] Preview changes before applying

### Phase 6: Upstream Sync (2 days)
- [ ] New agent discovery from GitHub
- [ ] Schema version checking
- [ ] Notification system for updates
- [ ] One-click agent integration
- [ ] Profile migration tools

### Phase 7: Polish (2 days)
- [ ] Error handling
- [ ] Loading states
- [ ] Keyboard shortcuts
- [ ] Port conflict resolution
- [ ] Browser auto-open

**Total Estimated Time**: 15-18 days (part-time work)

---

## API Endpoints Defined

### Models
- `GET /api/models` - List all models with caching
- `GET /api/models?search=X&provider=Y` - Filtered list
- `POST /api/models/refresh` - Force re-fetch from OpenCode

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/:name` - Full agent documentation
- `GET /api/agents/:name/alternatives` - Get model alternatives
- `POST /api/agents/:name/model` - Assign new model

### Profiles
- `GET /api/profiles` - List all profiles
- `POST /api/profiles/switch` - Switch active profile
- `POST /api/profiles` - Create new profile
- `POST /api/profiles/:name/duplicate` - Duplicate profile
- `GET /api/profiles/:name/export` - Export as JSON

### Backups
- `GET /api/backups` - List backups
- `POST /api/backups` - Create manual backup
- `POST /api/backups/:timestamp/restore` - Restore from backup

### Upstream
- `GET /api/upstream/status` - Check for updates
- `POST /api/upstream/sync` - Sync with GitHub
- `GET /api/agents/discover` - Find new agents

### Emergency
- `GET /api/emergency/status` - Check for errors
- `POST /api/emergency/fix` - Apply emergency fix

---

## Files to Create/Modify

### New Files
```
lib/
├── server.js              # HTTP server + API routes
├── core/
│   ├── models.js          # Model fetching, caching, scoring
│   ├── profiles.js        # Profile CRUD (from config-manager)
│   ├── upstream.js        # GitHub sync (enhanced)
│   ├── backup.js          # Backup/restore logic
│   └── agents.js          # Agent doc fetching & parsing
└── web/
    ├── index.html         # Main app shell
    ├── app.js            # Frontend logic
    ├── styles.css        # Stylesheet
    └── components/
        ├── ModelGrid.js
        ├── AgentModal.js
        ├── ProfilePanel.js
        └── FilterBar.js
```

### Modified Files
```
bin/opencode-agent-config    # Simplified launcher
lib/constants.js             # Add new constants
install.sh                   # Copy web/ directory
```

### Files to Remove
```
lib/ui/menus.js             # Replaced by web UI
lib/ui/prompts.js           # Replaced by web UI
lib/ui/config-menus.js      # Replaced by web UI
```

---

## Success Metrics

- [ ] Web UI loads in <2 seconds
- [ ] Model search filters in <100ms (200+ models)
- [ ] Profile switch completes in <500ms
- [ ] Emergency fix applies in 2 clicks
- [ ] New agent discovered and integrated in <30 seconds
- [ ] CLI profile switch: `opencode-agent-config <profile>` works
- [ ] Zero npm dependencies maintained

---

## Design Documentation

Full specification: [`docs/DESIGN-v2.md`](./DESIGN-v2.md)

**Sections**:
1. Executive Summary
2. UI Screens Reference (with Stitch links)
3. Architecture Overview
4. CLI Behavior
5. Web UI Screens (detailed)
6. Agent Documentation System
7. **New Agent Discovery System** (comprehensive)
8. API Specification
9. Frontend Architecture
10. Implementation Phases
11. Technical Considerations
12. Appendix A: Current vs New Comparison
13. Appendix B: File Migration

---

## Next Actions

1. **Start Phase 1**: Create server foundation
   - Begin with `lib/server.js`
   - Test model fetching endpoint
   - Verify browser opens correctly

2. **Review Design**: Read full spec at `docs/DESIGN-v2.md`
   - Confirm API contracts
   - Verify UI mockups meet requirements
   - Adjust phases if needed

3. **Set Up Development**:
   - Create branch for v2.0 work
   - Set up test environment
   - Prepare backup of current working version

Ready to start implementation?
