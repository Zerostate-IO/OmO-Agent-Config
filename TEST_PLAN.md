# OmO Agent Config - Test Plan

## Test Strategy

**Goal**: Ensure all features work before declaring them complete
**Approach**: 
1. Manual API testing (quick validation)
2. Automated Playwright UI testing (comprehensive)
3. Test only what we change (incremental testing)

## Test Checklist

### Phase 1: API Tests (Backend)
- [ ] GET /api/config - Returns current configuration
- [ ] GET /api/agents - Returns agent documentation
- [ ] GET /api/profiles - Returns all profiles
- [ ] POST /api/profiles/switch - Switch active profile
- [ ] POST /api/profiles - Create new profile
- [ ] DELETE /api/profiles/:name - Delete profile
- [ ] POST /api/profiles/import-active - Import current config
- [ ] POST /api/config - Save configuration

### Phase 2: UI Tests (Frontend)

#### View Switching
- [ ] Agents view loads by default
- [ ] Models view accessible via button
- [ ] Toggle between views works

#### Agents View
- [ ] Shows all configured agents
- [ ] Shows current model for each agent
- [ ] Shows agent requirements (context, capabilities)
- [ ] "Change Model" button opens model selector
- [ ] "View Details" button shows agent documentation
- [ ] Model selector groups by family
- [ ] Can assign new model to agent

#### Models View
- [ ] Shows all available models
- [ ] Search filters work
- [ ] Provider filter works
- [ ] Sort options work (smart, cost, context)
- [ ] Duplicate models show "X providers" badge
- [ ] Best provider highlighted with gold border
- [ ] Compare button works for duplicates
- [ ] Assign button works
- [ ] Alternatives button works for assigned models

#### Profile Management
- [ ] List all profiles
- [ ] Show active profile
- [ ] Activate profile works
- [ ] Create from current works
- [ ] Import active config works
- [ ] Duplicate profile works
- [ ] Delete profile works
- [ ] Export profile works
- [ ] Import from file works

#### Configuration Changes
- [ ] Can change agent models
- [ ] Changes marked as unsaved
- [ ] Save button enables
- [ ] Save works
- [ ] Undo works

### Phase 3: Integration Tests
- [ ] End-to-end: Change model → Save → Verify in config file
- [ ] Profile switch → Verify active config updated
- [ ] New profile → Verify file created

## Test Files

- `run-tests.sh` - API smoke checks (curl + python) and Playwright runner
- `tests/ui.spec.js` - Playwright UI smoke test

## Running Tests

```bash
# API smoke
./run-tests.sh api

# UI smoke (requires dev deps)
npm install
./run-tests.sh ui

# All
./run-tests.sh all
```

## Test Data

- Use existing profiles in ~/.config/opencode/configs/
- Use actual opencode models list
- Mock GitHub API responses for agent docs

## When to Test

**ALWAYS test after**:
1. Adding new API endpoints
2. Modifying UI components
3. Changing data flow
4. Before committing changes

**Test what you changed, not everything**
