# Update Model Recommendations To Match Oh My OpenCode

## TL;DR

> Align OmO-Agent-Config's agent/model recommendations with upstream Oh My OpenCode's explicit fallback chains (agent + category) and provider priority, while keeping heuristic scoring as a safe fallback for unknown agents.

**Deliverables**:
- Requirement-based recommendations for built-in agents (and optionally categories) matching upstream ordering and provider/model-id transforms
- Updated provider ranking for duplicate model variants (compare view)
- Backward-compatible agent key normalization (support legacy `Sisyphus`-style keys)
- Automated verification (tests-after): a deterministic node test + a Playwright UI assertion + `run-tests.sh` integration

**Estimated Effort**: Medium
**Parallel Execution**: YES (4 waves + final verification)
**Critical Path**: Requirements module -> agent resolution -> API/UI wiring -> tests

---

## Context

### Original Request
Update this app's model recommendation logic to follow Oh My OpenCode guidance:
- `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/guide/agent-model-matching.md`

### Key Upstream Sources ("truth")
- `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`
  - `AGENT_MODEL_REQUIREMENTS`, `CATEGORY_MODEL_REQUIREMENTS`.
  - Ordered `fallbackChain` entries with `{ providers: string[], model: string, variant?: string }`.
  - Gating: `requiresModel`, `requiresAnyModel`, `requiresProvider`.
- Resolution behavior to mirror:
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/fallback-chain-resolution.ts`
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/provider-model-id-transform.ts`
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/configurations.md` (confirms separate `variant` field)

### Current Repo Implementation (what will change)
- Agent recommendations computed here (heuristic scoring): `lib/core/agents.js:385`
- Recommendations exposed by API: `lib/server.js:534` and `lib/server.js:576`
- Recommendations rendered in UI model selector: `lib/web/app.js:648`
- Duplicate provider ranking used in compare route: `lib/core/models.js:330` + `lib/server.js:661`
- Defaults and static agent profiles: `lib/constants.js:39` + `lib/constants.js:153`

### Constraints / Guardrails
- No runtime deps (Node built-ins only)
- MUST NOT auto-change a user's already-assigned agent model(s)
- Keep API responses backward compatible (add fields, don’t remove existing)
- Keep heuristic scoring for unknown agents (don’t assume upstream list covers everything)

---

## Work Objectives

### Core Objective
Make the app's model recommendations deterministic and aligned with upstream Oh My OpenCode fallback chains and provider priority.

### Definition of Done
- Agent recommendation UI shows top recommended models consistent with upstream fallback chains when those models exist in `/api/models`.
- Duplicate-provider compare ranking follows upstream provider priority.
- Existing user configs load even if they use legacy agent key casing.
- `./run-tests.sh all` passes.

---

## Verification Strategy

**Automated tests**: YES (tests-after)
- Add a deterministic node-based test script (no test framework dependency) to validate:
  - requirement parsing + resolution ordering
  - provider/model-id transforms for github-copilot
  - legacy agent key normalization
- Add 1 Playwright assertion in `tests/ui.spec.js` to confirm recommendations render for a known agent.
- Wire the node test into `run-tests.sh`.

**Agent-executed QA** (required for every task):
- API checks via `curl` to `/api/models`, `/api/agents`, `/api/agents/:name`
- UI checks via Playwright
- Evidence output paths under `.sisyphus/evidence/`

---

## Execution Strategy

Wave 1 (Foundations: upstream requirements + normalization helpers)
- T1 Requirements mirror module + resolver helpers
- T2 Provider priority + provider-name normalization helpers
- T3 Agent key normalization + migration helpers
- T4 Variant handling contract (API shape + config write path)

Wave 2 (Core behavior updates, parallel)
- T5 Update agent recommendation engine to use requirements first
- T6 Update duplicate-provider ranking to match upstream priority
- T7 Update defaults + static agent profiles (include missing agents)
- T8 API response compatibility + new fields (if needed)

Wave 3 (UI alignment)
- T9 Agent model selector: render variant + provenance; keep existing behavior
- T10 Optional: categories recommendations surfaced (behind API only) [guarded]

Wave 4 (Verification)
- T11 Node test script + fixtures
- T12 Playwright test assertion + screenshots
- T13 Update `run-tests.sh` to run node tests

Final Verification Wave
- F1-F4 parallel review/QA passes

### Dependency Matrix (abbreviated)

- 1 -> 5, 10, 11
- 2 -> 6
- 3 -> 5, 7, 9, 11
- 4 -> 5, 8, 9, 11
- 5 -> 8, 9, 11
- 6 -> (none)
- 7 -> 11
- 8 -> 9, 12
- 9 -> 12
- 10 -> (none)
- 11, 12 -> 13

### Agent Dispatch Summary

- Wave 1: Tasks 1-4 -> `quick` / `unspecified-low`
- Wave 2: Task 5 -> `unspecified-high`, Tasks 6-8 -> `quick` / `unspecified-low`
- Wave 3: Task 9 -> `visual-engineering` (+ `frontend-ui-ux`), Task 10 -> `unspecified-low`
- Wave 4: Tasks 11-13 -> `quick` (+ `playwright` for 12)

---

## TODOs

- [ ] 1. Create upstream requirements mirror + resolution helpers

  **What to do**:
  - Add a new module to mirror upstream structures:
    - `AGENT_MODEL_REQUIREMENTS` and `CATEGORY_MODEL_REQUIREMENTS` (copy/pin from upstream `dev`).
    - Keep this module dependency-free and easy to diff against upstream changes.
  - Implement resolver helpers (mirroring upstream intent):
    - `transformModelForProvider(provider, model)` (github-copilot transforms at minimum).
    - `resolveModelFromChain(fallbackChain, availability)` returning `{ model: "provider/model", variant? } | null`.
    - `isAnyFallbackEntryAvailable`, `isRequiredModelAvailable`, `isRequiredProviderAvailable`.
  - Add a tolerant model-id matcher so upstream model names resolve against real `opencode models` ids:
    - Handle common punctuation differences (e.g. `claude-opus-4-6` vs `claude-opus-4.6`).
    - Prefer exact match when possible; fallback to normalized comparison.

  **Must NOT do**:
  - Don’t change existing API responses yet.
  - Don’t introduce runtime deps.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: Tasks 5, 10, 11
  - Blocked By: None

  **References**:
  - Upstream truth: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`
  - Upstream resolver: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/fallback-chain-resolution.ts`
  - Upstream provider transform: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/provider-model-id-transform.ts`

  **Acceptance Criteria**:
  - [ ] New module exports both AGENT + CATEGORY requirements + resolver helpers.
  - [ ] Resolver produces a provider-prefixed model id and passes through variant when present.
  - [ ] Resolver can match the same model across providers even when punctuation differs.

  **QA Scenarios**:
  ```
  Scenario: Resolve first available entry
    Tool: Bash
    Steps:
      1. Run a node snippet that imports the resolver and passes a small fallbackChain with 2 providers.
      2. Provide availability that enables only the 2nd provider.
      3. Assert returned model uses the 2nd provider.
    Evidence: .sisyphus/evidence/task-1-resolve-first.txt

  Scenario: GitHub Copilot transform applies
    Tool: Bash
    Steps:
      1. Call transform for provider github-copilot with "claude-opus-4-6".
      2. Assert returned string equals "claude-opus-4.6".
    Evidence: .sisyphus/evidence/task-1-copilot-transform.txt

  Scenario: Punctuation-tolerant model match
    Tool: Bash
    Steps:
      1. Provide availability containing a model id like "anthropic/claude-opus-4.6".
      2. Resolve entry requesting "claude-opus-4-6".
      3. Assert it matches.
    Evidence: .sisyphus/evidence/task-1-punctuation-match.txt
  ```

- [ ] 2. Implement provider priority + provider-name normalization for this app

  **What to do**:
  - Update provider ranking logic so the app's duplicate-model compare matches upstream priority:
    - Native providers (anthropic/openai/google) first, then kimi-for-coding, then github-copilot, then venice, then opencode, then zai-coding-plan.
  - Add a provider normalization helper to map CLI provider ids to upstream names if needed.
    - Default strategy: treat provider available if any model exists with that provider string.

  **Must NOT do**:
  - Don’t break existing `/api/models/:id/compare` shape.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: Task 6
  - Blocked By: None

  **References**:
  - Upstream provider priority: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/guide/agent-model-matching.md`
  - Current compare path: `lib/server.js:661`
  - Current ranking logic: `lib/core/models.js:330`

  **Acceptance Criteria**:
  - [ ] `rankProvider()` yields lower scores for native providers than opencode for identical model cost/context.
  - [ ] `GET /api/models/:modelId/compare` still returns `variants[]` and `bestProvider`.

  **QA Scenarios**:
  ```
  Scenario: Compare route still works
    Tool: Bash
    Preconditions: Server running
    Steps:
      1. curl http://localhost:3456/api/models and pick a modelId returned.
      2. curl http://localhost:3456/api/models/<modelId>/compare
      3. Assert JSON has keys variants,totalVariants,bestProvider.
    Evidence: .sisyphus/evidence/task-2-compare-shape.json
  ```

- [ ] 3. Add agent key normalization + safe migration behavior

  **What to do**:
  - Implement a normalization layer so agent keys are handled case-insensitively:
    - Treat lowercase as canonical (`sisyphus`, `prometheus`, etc.).
    - Support legacy keys in existing configs (e.g. `Sisyphus`).
  - Ensure UI reads and writes canonical keys without dropping legacy entries unexpectedly:
    - On save, write canonical key; optionally remove legacy alias only if the canonical exists.

  **Must NOT do**:
  - Don’t silently override a user's assigned model during normalization.

  **Recommended Agent Profile**:
  - Category: `unspecified-low`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: Tasks 5, 7, 9, 11
  - Blocked By: None

  **References**:
  - Defaults and validation entry points: `lib/constants.js:39`, `lib/validation.js:1`
  - Agent API merges profiles + docs: `lib/server.js:534`

  **Acceptance Criteria**:
  - [ ] A config containing only `agents.Sisyphus.model` is treated as configuring `sisyphus` in the UI.
  - [ ] Saving preserves the selected model and does not revert it.

  **QA Scenarios**:
  ```
  Scenario: Legacy key is honored
    Tool: Bash
    Steps:
      1. Create a temporary config object in a node snippet with agents: { Sisyphus: { model: "x" } }.
      2. Run normalization helper.
      3. Assert canonical key exists and model value preserved.
    Evidence: .sisyphus/evidence/task-3-legacy-key.txt
  ```

- [ ] 4. Decide and implement variant propagation contract (recommendations + config write)

  **What to do**:
  - Extend internal recommendation objects to optionally include `variant` and `provenance` (e.g., `"fallback-chain"` vs `"heuristic"`).
  - Ensure `assignModelToAgent()` path can store `{ model, variant }` when variant is present.
  - Ensure API continues to support old clients by keeping existing fields.

  **Defaults Applied**:
  - Variant is informational AND persisted when a user selects a recommended model with a variant.
  - If a model has no variant, no variant field is written.

  **Recommended Agent Profile**:
  - Category: `unspecified-low`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: Tasks 5, 8, 9, 11
  - Blocked By: None

  **References**:
  - Upstream config supports `variant`: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/configurations.md`
  - Current UI write path: `lib/web/app.js:994`
  - Config save endpoint: `lib/server.js:500`

  **Acceptance Criteria**:
  - [ ] Recommended model entry may include `variant` without breaking existing UI rendering.
  - [ ] When choosing a recommended model with `variant`, the saved config includes `agents.<name>.variant`.

  **QA Scenarios**:
  ```
  Scenario: Variant persists on save
    Tool: Playwright
    Steps:
      1. Open Agents view.
      2. Open Change Model for a known agent with a recommended model that has variant.
      3. Click that recommended entry.
      4. Click Save in UI.
      5. Verify /api/config shows variant under that agent.
    Evidence: .sisyphus/evidence/task-4-variant-save.png
  ```

- [ ] 5. Update agent recommendation engine to use upstream requirements first

  **What to do**:
  - In `lib/core/agents.js`, replace/augment `getRecommendedModel(s)` for known agents with:
    - If agent is in `AGENT_MODEL_REQUIREMENTS`, resolve from fallback chain based on actual availability.
    - If gating fails (`requiresProvider`/`requiresModel`/`requiresAnyModel`), return null + attach warning metadata.
    - Else, fall back to existing heuristic scoring for unknown agents.
  - Availability default: derive provider/model availability from `GET /api/models` results (no need to parse provider auth config).

  **Must NOT do**:
  - Don’t remove heuristic scoring.
  - Don’t change assigned user config models.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)
  - Blocks: Tasks 8, 9, 11
  - Blocked By: Tasks 1, 3, 4

  **References**:
  - Current recommendation code: `lib/core/agents.js:385`
  - Agent docs enrichment point: `lib/core/agents.js:599`
  - API consumption: `lib/server.js:534`
  - Upstream requirements: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`

  **Acceptance Criteria**:
  - [ ] For a known agent (e.g. `sisyphus`), `recommendedModels` is ordered by upstream fallback chain (filtered to available).
  - [ ] For an unknown agent, `recommendedModels` continues to come from heuristic scoring.

  **QA Scenarios**:
  ```
  Scenario: Known agent uses fallback chain
    Tool: Bash
    Steps:
      1. curl http://localhost:3456/api/agents/sisyphus
      2. Assert recommendedModels[0].id matches the first available entry in the upstream chain.
    Evidence: .sisyphus/evidence/task-5-sisyphus-recs.json

  Scenario: Unknown agent uses heuristic
    Tool: Bash
    Steps:
      1. Pick an agent name not in AGENT_MODEL_REQUIREMENTS but returned by /api/agents.
      2. Assert recommendedModels entries include score numbers derived from heuristics (non-chain provenance).
    Evidence: .sisyphus/evidence/task-5-unknown-agent.json
  ```

- [ ] 6. Update duplicate-provider ranking to match upstream provider priority

  **What to do**:
  - Update `lib/core/models.js:rankProvider()` provider tiers to match upstream order.
  - Keep cost/context adjustments but ensure provider tier dominates.
  - Ensure `lib/server.js:661` compare route recommendations remain correct.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)
  - Blocks: Task 12 (UI compare correctness if tested)
  - Blocked By: Task 2

  **References**:
  - Current tiers: `lib/core/models.js:335`
  - Upstream provider priority: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/guide/agent-model-matching.md`

  **Acceptance Criteria**:
  - [ ] Native providers score better than opencode for same model.
  - [ ] Compare route still labels one variant as `isBest`.

  **QA Scenarios**:
  ```
  Scenario: Best provider is native when duplicates exist
    Tool: Bash
    Steps:
      1. Use /api/models to find a model with duplicates (hasDuplicates true).
      2. Call /api/models/<id>/compare.
      3. Assert bestProvider is one of anthropic/openai/google if present among variants.
    Evidence: .sisyphus/evidence/task-6-best-provider.json
  ```

- [ ] 7. Update DEFAULTS + AGENT_PROFILES to match upstream agent roster and naming

  **What to do**:
  - Align `lib/constants.js:DEFAULTS` and `lib/constants.js:AGENT_PROFILES` to upstream agent list:
    - Add missing: `hephaestus` (GPT-native, requires gpt-5.3-codex).
    - Normalize names to canonical lowercase keys (keep legacy alias mapping per Task 3).
  - Ensure `lib/validation.js` continues to correctly detect missing/extra agents.

  **Must NOT do**:
  - Don’t remove existing defaults for keys that users rely on; migrate via alias mapping.

  **Recommended Agent Profile**:
  - Category: `unspecified-low`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)
  - Blocks: Task 11 (tests need stable agent list)
  - Blocked By: Task 3

  **References**:
  - Defaults: `lib/constants.js:39`
  - Profiles: `lib/constants.js:153`
  - Validation: `lib/validation.js:1`
  - Upstream agent list: `https://api.github.com/repos/code-yeongyu/oh-my-opencode/contents/src/agents?ref=dev`

  **Acceptance Criteria**:
  - [ ] DEFAULTS includes `agents.hephaestus` (or handles it via migration).
  - [ ] AGENT_PROFILES contains entries for all built-in agents used by the UI.

  **QA Scenarios**:
  ```
  Scenario: Validation sees new required agents
    Tool: Bash
    Steps:
      1. Run node snippet importing validateConfig and DEFAULTS.
      2. Validate an empty config and assert missingAgents includes hephaestus.
    Evidence: .sisyphus/evidence/task-7-validation.txt
  ```

- [ ] 8. API compatibility pass: expose requirement-based details without breaking clients

  **What to do**:
  - In `lib/server.js`, keep existing fields (`recommendedModel`, `recommendedModels`) but optionally add:
    - `recommendedModels[].variant` (optional)
    - `recommendedModels[].provenance` (e.g. `fallback-chain` vs `heuristic`)
    - `recommendationWarnings[]` for gating failures
  - Ensure `/api/agents` and `/api/agents/:name` behave consistently.

  **Recommended Agent Profile**:
  - Category: `unspecified-low`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)
  - Blocks: Tasks 9, 12
  - Blocked By: Task 5

  **References**:
  - Agents routes: `lib/server.js:534`, `lib/server.js:576`

  **Acceptance Criteria**:
  - [ ] Old UI still renders recommendedModels when new fields exist.
  - [ ] `/api/agents/:name` returns 404 only when agent truly missing.

  **QA Scenarios**:
  ```
  Scenario: /api/agents response remains stable
    Tool: Bash
    Steps:
      1. curl http://localhost:3456/api/agents
      2. Assert each agent object still includes name, recommendedModels.
    Evidence: .sisyphus/evidence/task-8-agents-shape.json
  ```

- [ ] 9. UI: update agent model selector to surface variant + provenance (non-blocking)

  **What to do**:
  - In `lib/web/app.js:648`, update the recommended section rendering to include:
    - `variant` (if present)
    - provenance badge (optional)
  - Ensure selecting a recommended model with variant writes both model + variant in config.

  **Must NOT do**:
  - Don’t change the core filtering UX or add frontend deps.

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 3)
  - Blocks: Task 12
  - Blocked By: Task 8

  **References**:
  - Selector render path: `lib/web/app.js:782`
  - Config write path: `lib/web/app.js:994`

  **Acceptance Criteria**:
  - [ ] Recommended models show score and variant when present.
  - [ ] Clicking recommended model updates config with variant (when provided).

  **QA Scenarios**:
  ```
  Scenario: Recommended section displays variant
    Tool: Playwright
    Steps:
      1. Open Change Model for a known agent.
      2. Assert the "Recommended" section contains text "variant" or a badge if variant exists.
      3. Screenshot the modal.
    Evidence: .sisyphus/evidence/task-9-selector-variant.png
  ```

- [ ] 10. Optional (guarded): add category recommendation API endpoint (no UI)

  **What to do**:
  - Add a new API endpoint to expose category model recommendations using upstream `CATEGORY_MODEL_REQUIREMENTS`.
  - Ensure this endpoint is additive and does not change existing UI.

  **Guardrail**:
  - Only implement if the repo already stores/edits `config.categories` in config; otherwise skip.

  **Recommended Agent Profile**:
  - Category: `unspecified-low`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 3)
  - Blocks: None
  - Blocked By: Task 1

  **References**:
  - Upstream category requirements: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`
  - Config shape: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/configurations.md`

  **Acceptance Criteria**:
  - [ ] New endpoint returns resolved model + variant for each category.
  - [ ] Existing endpoints unaffected.

  **QA Scenarios**:
  ```
  Scenario: Category endpoint returns JSON
    Tool: Bash
    Steps:
      1. curl new endpoint.
      2. Assert it returns categories array/object and does not 500.
    Evidence: .sisyphus/evidence/task-10-categories.json
  ```

- [ ] 11. Tests-after: add deterministic node test for requirements + normalization

  **What to do**:
  - Add a node test script (plain `node`, no framework) that:
    - Loads a fixed set of mock models (fixtures) with providers and ids.
    - Runs requirement-based resolver and asserts ordering + transforms.
    - Asserts legacy agent key normalization behavior.
  - Keep fixtures small and deterministic.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 4)
  - Blocks: Task 13
  - Blocked By: Tasks 1, 3, 4, 5, 7

  **References**:
  - Existing test runner: `run-tests.sh:1`
  - Agent scoring: `lib/core/agents.js:385`

  **Acceptance Criteria**:
  - [ ] `node <test-script>` exits 0 and prints PASS summary.
  - [ ] Covers github-copilot transform and at least 2 agents (sisyphus, hephaestus).
  - [ ] Includes at least 1 case for punctuation-tolerant model id matching.

  **QA Scenarios**:
  ```
  Scenario: Run node tests
    Tool: Bash
    Steps:
      1. node <test-script>
      2. Assert exit code 0 and output contains "PASS".
    Evidence: .sisyphus/evidence/task-11-node-tests.txt
  ```

- [ ] 12. Tests-after: extend Playwright UI test to assert recommendations render

  **What to do**:
  - Update `tests/ui.spec.js`:
    - Open Change Model modal for a specific agent.
    - Assert a Recommended section exists and contains at least 1 item.
    - Capture screenshot.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: `playwright`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 4)
  - Blocks: Task 13
  - Blocked By: Task 9 (or Task 8 if UI unchanged)

  **References**:
  - Existing tests: `tests/ui.spec.js:69`
  - UI selector modal: `lib/web/app.js:648`

  **Acceptance Criteria**:
  - [ ] Playwright test passes locally.
  - [ ] Screenshot produced in `test-results/`.

  **QA Scenarios**:
  ```
  Scenario: Playwright recommendation assertion
    Tool: Bash
    Steps:
      1. ./run-tests.sh ui
      2. Assert Playwright exits 0.
    Evidence: .sisyphus/evidence/task-12-playwright.txt
  ```

- [ ] 13. Update run-tests.sh to run the new node checks

  **What to do**:
  - Add a step in `run-tests.sh` to execute the node test script in `api` and `all` modes.
  - Ensure failures produce a clear non-zero exit.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none

  **Parallelization**:
  - Can Run In Parallel: NO (Wave 4 integration)
  - Blocked By: Tasks 11, 12

  **References**:
  - `run-tests.sh:29`

  **Acceptance Criteria**:
  - [ ] `./run-tests.sh api` runs node checks.
  - [ ] `./run-tests.sh all` runs node checks before UI tests.

  **QA Scenarios**:
  ```
  Scenario: Full suite
    Tool: Bash
    Steps:
      1. ./run-tests.sh all
      2. Assert exit code 0.
    Evidence: .sisyphus/evidence/task-13-run-tests-all.txt
  ```

---

## Final Verification Wave

- [ ] F1. Plan compliance audit (oracle)

  **What to do**:
  - Verify each task's acceptance criteria is satisfied in the implemented code.
  - Confirm recommendations follow upstream fallback ordering when models exist.
  - Confirm legacy agent key configs still load and save safely.

  **QA Scenarios**:
  ```
  Scenario: API invariants
    Tool: Bash
    Steps:
      1. curl /api/models, /api/agents, /api/agents/sisyphus
      2. Assert responses are 200 and JSON shapes include required keys.
    Evidence: .sisyphus/evidence/final-f1-api-invariants.json
  ```

- [ ] F2. Code quality review (unspecified-high)

  **What to do**:
  - Run `node -c` style sanity (where applicable), and ensure no new runtime deps were added.
  - Scan for risky patterns: silent catches, brittle regex parsing, hardcoded model ids without fallback.

  **QA Scenarios**:
  ```
  Scenario: Dependency-free check
    Tool: Bash
    Steps:
      1. Verify no new runtime deps were introduced (no new requires to non-builtins).
    Evidence: .sisyphus/evidence/final-f2-deps.txt
  ```

- [ ] F3. Full QA run (unspecified-high + playwright)

  **What to do**:
  - Run `./run-tests.sh all`.
  - Manually follow the plan's key UI scenarios: open agent selector, see recommendations, assign model, save, verify config.

  **QA Scenarios**:
  ```
  Scenario: End-to-end
    Tool: Bash
    Steps:
      1. ./run-tests.sh all
      2. Assert exit code 0.
    Evidence: .sisyphus/evidence/final-f3-run-tests-all.txt
  ```

- [ ] F4. Scope fidelity check (deep)

  **What to do**:
  - Ensure work did not expand into unrelated UI changes or new config features beyond recommendations.
  - Ensure Task 10 remains optional/guarded and skipped if categories are not supported.

  **QA Scenarios**:
  ```
  Scenario: No scope creep
    Tool: Bash
    Steps:
      1. Review changed files list and confirm all are in plan references.
    Evidence: .sisyphus/evidence/final-f4-scope.txt
  ```

---

## Commit Strategy

- 1-3 atomic commits recommended:
  - `feat(recommendations): align with omo fallback chains`
  - `test(recommendations): add deterministic checks + ui assertion`

---

## Success Criteria

- Recommendations follow upstream fallback ordering when models exist.
- Provider ranking reflects upstream provider priority.
- Legacy agent key casing is handled without breaking configs.
- `./run-tests.sh all` passes.
