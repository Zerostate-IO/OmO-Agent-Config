# OmO-Agent-Config: Hardening + Refactor + Feature Expansion Plan

## TL;DR
> Fix 4 correctness/safety regressions first (installer completeness, wildcard CORS, model-shape mismatch in scoring, brittle test runner), then consolidate duplicated model/provider logic, then add a small, explicitly-scoped set of quality-of-life features.

**Deliverables**:
- Hardened install + local server safety defaults
- Correct recommendations under both known-agent (fallback chain) and heuristic scoring paths
- More robust `run-tests.sh` + standardized `package.json` test script
- Reduced duplication across model/provider modules (clear source-of-truth)
- Optional feature wave with tightly-scoped, explicitly-approved items

**Effort**: Medium
**Parallel execution**: YES (3 waves + final verification wave)
**Test strategy**: Tests-after (plus mandatory agent-executed QA scenarios)

---

## Context

### Original request
"Full analysis of the repo and suggest enhancements/cleanup/fixes as a plan, prioritized as: 1) patch hardening, 2) maintainability refactor, 3) feature expansion. Always consult OmO and OpenCode behavior/docs."

### Constraints / guardrails
- Runtime deps: Node built-ins only (no new production npm deps).
- Must NOT auto-change user's existing agent-model assignments.
- API responses remain backward compatible.
- Avoid UI redesign; limit to bugfixes/clarity improvements.

### Grounded issues found (must address early)
- `install.sh` omits `lib/core/model-requirements.js` but runtime requires it (installed CLI crashes).
- `lib/server.js` returns wildcard CORS (`Access-Control-Allow-Origin: *`) for mutative endpoints.
- `lib/core/agents.js` heuristic scorer expects formatted model fields but `lib/server.js` passes raw models.
- `run-tests.sh` assumes fixed port 3456 and requires python3 for JSON parsing.

---

## Work objectives

### Must have
- Installed tool never crashes due to missing installed lib files.
- Local server does not advertise permissive CORS by default.
- Recommendations remain correct and stable; heuristic scoring uses a consistent model contract.
- Test runner works even when server binds a non-default port; no python dependency required.

### Must NOT have
- No automatic rewriting of user assignments (only UI-driven saves).
- No breaking API response schema changes.
- No new production dependencies.

---

## Verification strategy (mandatory)

### Automated tests
- Tests-after: add/adjust targeted tests once each fix is implemented.
- Existing patterns:
  - Logic/unit: `tests/requirements-test.js` (node `assert`)
  - UI/e2e: `tests/ui.spec.js` (Playwright)
  - Orchestration: `run-tests.sh`

### QA policy
Every TODO includes 2 agent-executed QA scenarios (happy path + failure/edge).
Evidence saved under `.sisyphus/evidence/`.

---

## Execution strategy

### Parallel waves (high level)

Wave 1 (Patch hardening; can mostly run in parallel): Tasks 1-7

Wave 2 (Maintainability refactor; depends on Wave 1 correctness fixes): Tasks 8-15

Wave 3 (Feature expansion; explicitly-scoped, low-risk): Tasks 16-20

Final verification wave (parallel review): F1-F4

---

## TODOs

- [x] 1. Fix installer to include full runtime `lib/` tree

  **What to do**:
  - Update `install.sh` to stop copying a fragile allowlist of individual files and instead copy the entire `lib/` directory tree into `~/.config/opencode/lib/`.
  - Ensure `lib/core/model-requirements.js` is present post-install.
  - Add an install-time smoke check that verifies required entrypoints exist (no execution, just file existence).

  **Must NOT do**:
  - Do not introduce any new runtime deps or change install destinations.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: Task 7 (post-install verification), supports all subsequent tasks
  - Blocked by: None

  **References**:
  - `install.sh` - current explicit-copy block omits `lib/core/model-requirements.js`.
  - `lib/core/agents.js` - requires `./model-requirements` at runtime.

  **Acceptance criteria**:
  - [ ] After `./install.sh`, `~/.config/opencode/lib/core/model-requirements.js` exists.
  - [ ] After `./install.sh`, `~/.config/opencode/lib/server.js` exists.

  **QA scenarios**:
  ```
  Scenario: Fresh install includes required files
    Tool: Bash
    Steps:
      1. Run: ./install.sh
      2. Run: test -f ~/.config/opencode/lib/core/model-requirements.js
      3. Run: test -f ~/.config/opencode/lib/core/agents.js
    Expected Result: all tests exit 0
    Evidence: .sisyphus/evidence/task-1-install-file-presence.txt

  Scenario: Regression guard - missing file causes failure (pre-fix only)
    Tool: Bash
    Preconditions: On a branch without Task 1 applied
    Steps:
      1. Run: ./install.sh
      2. Run: test -f ~/.config/opencode/lib/core/model-requirements.js
    Expected Result: test fails (non-zero) on old versions; passes after fix
    Evidence: .sisyphus/evidence/task-1-install-regression.txt
  ```

- [x] 2. Remove wildcard CORS; add safe default headers for local SPA

  **What to do**:
  - In `lib/server.js`, remove `Access-Control-Allow-Origin: *` from API responses, static file responses, and OPTIONS handler.
  - Default to same-origin; optionally allow a strict allowlist for `http://localhost:<port>` and `http://127.0.0.1:<port>` if needed for dev tooling.
  - Add baseline security headers for both JSON + static responses:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - Minimal CSP compatible with current inline assets (document exact policy chosen).

  **Must NOT do**:
  - Do not block legitimate same-origin use of the SPA.
  - Do not introduce a breaking change to response bodies.

  **Recommended agent profile**:
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: none
  - Blocked by: None

  **References**:
  - `lib/server.js` - header set points: `sendJSON`, `serveStaticFile`, OPTIONS preflight.

  **Acceptance criteria**:
  - [ ] API responses no longer include `Access-Control-Allow-Origin: *`.
  - [ ] OPTIONS handler no longer returns wildcard CORS.
  - [ ] SPA still loads and can fetch `/api/config` from same origin.

  **QA scenarios**:
  ```
  Scenario: Same-origin SPA still functions
    Tool: Bash
    Steps:
      1. Start server via CLI (as usual)
      2. curl -s -D - http://localhost:<port>/api/config | grep -i "access-control-allow-origin"
      3. curl -s http://localhost:<port>/api/config > /dev/null
    Expected Result: no wildcard CORS header; request succeeds (200)
    Evidence: .sisyphus/evidence/task-2-same-origin-headers.txt

  Scenario: Cross-origin attempt does not get permissive CORS
    Tool: Bash
    Steps:
      1. curl -s -D - -H "Origin: https://evil.example" http://localhost:<port>/api/config | grep -i "access-control-allow-origin"
    Expected Result: header absent OR restricted to local allowlist
    Evidence: .sisyphus/evidence/task-2-no-wildcard-cors.txt
  ```

- [x] 3. Normalize model objects for scoring (fix raw vs formatted mismatch)

  **What to do**:
  - Ensure the heuristic scoring path always receives model objects with the fields it expects (`context`, `hasThinking`, `costDisplay`, `provider`).
  - Preferred: format models in `lib/server.js` before passing to agent doc / recommendation helpers.
  - Add defensive fallback reads in `lib/core/agents.js:scoreModelsForAgent` so it can tolerate raw objects (`limit.context`, etc.).
  - Add a regression test in `tests/requirements-test.js` that exercises scoring with raw-shaped models and asserts stable recommendations ordering.

  **Must NOT do**:
  - Do not change the public response format of `/api/models` (UI may rely on existing shape).

  **Recommended agent profile**:
  - Category: `deep`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: Task 10 (refactor scoring consolidation)
  - Blocked by: None

  **References**:
  - `lib/core/models.js` - raw vs `formatModel()` output shape.
  - `lib/core/agents.js:scoreModelsForAgent` - currently expects formatted fields.
  - `lib/server.js` - `/api/agents` and `/api/agents/:name` pass models into agent docs.
  - `tests/requirements-test.js` - existing pattern for deterministic assertions.

  **Acceptance criteria**:
  - [ ] Heuristic scoring does not read `undefined` for context/thinking/cost fields.
  - [ ] `node tests/requirements-test.js` passes with new regression coverage.

  **QA scenarios**:
  ```
  Scenario: /api/agents returns recommendations with consistent fields
    Tool: Bash
    Steps:
      1. Start server
      2. curl -s http://localhost:<port>/api/agents | node -e "const d=JSON.parse(require('fs').readFileSync(0)); const m=d[0]?.recommendedModels?.[0]; console.log(JSON.stringify({context:m?.context, hasThinking:m?.hasThinking, costDisplay:m?.costDisplay, provider:m?.provider}));"
    Expected Result: printed JSON has non-null/expected types for fields used by scoring
    Evidence: .sisyphus/evidence/task-3-agents-model-shape.txt

  Scenario: Scoring tolerates raw model objects
    Tool: Bash
    Steps:
      1. node tests/requirements-test.js
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-3-requirements-test.txt
  ```

- [x] 4. Harden `run-tests.sh`: dynamic port detection, no python dependency, reliable cleanup

  **What to do**:
  - Make the script discover the actual server port (parse server stdout log or add an env var override).
  - Replace python JSON parsing with `node -e` one-liners.
  - Replace fixed `sleep` with readiness polling against `/api/config`.
  - Add `trap` cleanup so the background server is always terminated.

  **Must NOT do**:
  - Do not add new system dependencies; rely on bash + node + curl.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: Task 7, Task 18
  - Blocked by: None

  **References**:
  - `run-tests.sh` - fixed port 3456 and python3 usage.
  - `lib/server.js` - port probing logic.
  - `bin/opencode-agent-config` - logs the bound URL.

  **Acceptance criteria**:
  - [ ] `./run-tests.sh api` passes when port 3456 is already in use.
  - [ ] `./run-tests.sh api` does not require python3.

  **QA scenarios**:
  ```
  Scenario: API tests pass with non-default port
    Tool: Bash
    Steps:
      1. Bind port 3456 (e.g., start a dummy server)
      2. Run: ./run-tests.sh api
    Expected Result: PASS; script discovers alternate port
    Evidence: .sisyphus/evidence/task-4-run-tests-dynamic-port.txt

  Scenario: Cleanup trap stops background server
    Tool: Bash
    Steps:
      1. Run: ./run-tests.sh api (force a failure mid-way)
      2. Check: no lingering node process for the server
    Expected Result: server is terminated on exit
    Evidence: .sisyphus/evidence/task-4-trap-cleanup.txt
  ```

- [x] 5. Fix CLI help text drift for active config path

  **What to do**:
  - Update CLI help/usage strings to reference `~/.config/opencode/oh-my-opencode.jsonc` (not `.json`).

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: none
  - Blocked by: None

  **References**:
  - `bin/opencode-agent-config` - help text.
  - `lib/constants.js` - actual path constants.

  **Acceptance criteria**:
  - [ ] `opencode-agent-config --help` shows `.jsonc`.

  **QA scenarios**:
  ```
  Scenario: Help output references correct file
    Tool: Bash
    Steps:
      1. node bin/opencode-agent-config --help | grep -n "oh-my-opencode.jsonc"
    Expected Result: grep finds a match
    Evidence: .sisyphus/evidence/task-5-help-jsonc.txt

  Scenario: No stale .json reference remains
    Tool: Bash
    Steps:
      1. node bin/opencode-agent-config --help | grep -n "oh-my-opencode.json" && exit 1 || true
    Expected Result: no match
    Evidence: .sisyphus/evidence/task-5-help-no-json.txt
  ```

- [x] 6. Add API-level guardrails against non-local access (optional, minimal)

  **What to do**:
  - Implement a lightweight request validation in `lib/server.js` that rejects requests with non-local `Host` (or non-local `Origin` if present).
  - Default behavior should still allow `localhost` and `127.0.0.1`.

  **Must NOT do**:
  - Do not block same-machine access by default.
  - Do not add auth/login.

  **Recommended agent profile**:
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 1)
  - Blocks: none
  - Blocked by: Task 2 (header policy should be decided first)

  **References**:
  - `lib/server.js:handleRequest` - request routing entry.

  **Acceptance criteria**:
  - [ ] Requests with `Host` outside `{localhost,127.0.0.1}` are rejected (configurable escape hatch OK).

  **QA scenarios**:
  ```
  Scenario: Local access still works
    Tool: Bash
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}\n" http://localhost:<port>/api/config
    Expected Result: 200
    Evidence: .sisyphus/evidence/task-6-local-works.txt

  Scenario: Non-local Host is rejected
    Tool: Bash
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}\n" -H "Host: example.com" http://localhost:<port>/api/config
    Expected Result: 4xx
    Evidence: .sisyphus/evidence/task-6-nonlocal-rejected.txt
  ```

- [x] 7. Add post-install smoke verification path to `run-tests.sh`

  **What to do**:
  - Add a new `./run-tests.sh install` mode (or extend `all`) that validates the installed layout by:
    - running the installed binary with a `--version`/`--help` check
    - verifying required installed files exist
  - Keep it non-destructive and local.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: NO (depends on Tasks 1 and 4)
  - Blocked by: Task 1, Task 4

  **References**:
  - `run-tests.sh` - add mode.
  - `install.sh` - target paths.
  - `bin/opencode-agent-config` - expected behavior.

  **Acceptance criteria**:
  - [ ] `./run-tests.sh install` passes after `./install.sh`.

  **QA scenarios**:
  ```
  Scenario: Installed binary responds
    Tool: Bash
    Steps:
      1. ./install.sh
      2. ~/.config/opencode/bin/opencode-agent-config --help > /dev/null
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-7-installed-help.txt

  Scenario: Installed lib is complete
    Tool: Bash
    Steps:
      1. test -f ~/.config/opencode/lib/core/model-requirements.js
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-7-installed-lib-complete.txt
  ```

- [x] 8. Consolidate provider alias normalization into one shared utility

  **What to do**:
  - Identify all provider alias maps/normalizers across:
    - `lib/core/models.js`
    - `lib/core/agents.js`
    - `lib/core/model-requirements.js`
  - Create a single canonical normalization function (location should avoid circular deps; prefer `lib/constants.js` or `lib/core/models.js`).
  - Replace call sites to use the canonical helper.
  - Add/extend `tests/requirements-test.js` to assert key aliases remain stable.

  **Must NOT do**:
  - Do not change existing public model IDs returned by `/api/models`.

  **Recommended agent profile**:
  - Category: `deep`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 3 (model contract normalization first)
  - Blocks: Task 10, Task 11

  **References**:
  - `lib/core/models.js` - existing provider extraction/normalization.
  - `lib/core/agents.js` - recommendation matching by provider.
  - `lib/core/model-requirements.js` - upstream fallback chain provider tokens.
  - `tests/requirements-test.js` - alias regression tests.

  **Acceptance criteria**:
  - [ ] Exactly one canonical provider normalization map/function exists.
  - [ ] Unit tests cover at least: `google`<->`gemini`, `anthropic`<->`claude` (plus any repo-specific aliases).

  **QA scenarios**:
  ```
  Scenario: Alias regression tests pass
    Tool: Bash
    Steps:
      1. node tests/requirements-test.js
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-8-alias-tests.txt

  Scenario: No duplicate alias maps remain
    Tool: Bash
    Steps:
      1. Search codebase for duplicated alias tables (pattern match)
    Expected Result: only canonical location remains
    Evidence: .sisyphus/evidence/task-8-no-dup-alias.txt
  ```

- [x] 9. Remove duplicated model parsing implementation (`lib/model-loader.js` vs `lib/core/models.js`)

  **What to do**:
  - Choose `lib/core/models.js` as the single source of truth for parsing `opencode models --verbose`.
  - Update any remaining imports/usages of `lib/model-loader.js` to use `lib/core/models.js` instead.
  - If `lib/model-loader.js` becomes unused, remove it and update any docs.
  - Add a regression check in tests that parsing succeeds for representative CLI output fixtures (if fixtures exist) or via an integration test in `run-tests.sh`.

  **Must NOT do**:
  - Do not change the parsing semantics unless needed for correctness/hardening.

  **Recommended agent profile**:
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 3
  - Blocks: Task 12

  **References**:
  - `lib/core/models.js:parseModels` - brace-count parser.
  - `lib/model-loader.js` - duplicate parser.

  **Acceptance criteria**:
  - [ ] Only one `parseModels` implementation remains.
  - [ ] `./run-tests.sh api` passes.

  **QA scenarios**:
  ```
  Scenario: API smoke still loads models
    Tool: Bash
    Steps:
      1. ./run-tests.sh api
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-9-api-smoke.txt

  Scenario: Duplicate parser removed
    Tool: Bash
    Steps:
      1. Verify lib/model-loader.js removed or no longer defines parseModels
    Expected Result: duplication eliminated
    Evidence: .sisyphus/evidence/task-9-dup-parser-removed.txt
  ```

- [x] 10. Centralize recommendation scoring flow to reduce divergence

  **What to do**:
  - In `lib/core/agents.js`, ensure known-agent deterministic recommendations (fallback chain) and unknown-agent heuristic recommendations share a common ranking base.
  - Reduce duplicated logic between chain resolution and heuristic selection (prefer calling shared helpers).
  - Add regression assertions in `tests/requirements-test.js` for at least 2 representative agents (one known, one unknown).

  **Must NOT do**:
  - Do not change the fallback-chain semantics from upstream OmO docs.

  **Recommended agent profile**:
  - Category: `deep`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 3, Task 8

  **References**:
  - `lib/core/agents.js:getRecommendedModels` - both recommendation branches.
  - `lib/core/model-requirements.js` - chain resolution helpers.
  - Upstream OmO: `docs/guide/agent-model-matching.md` + `src/cli/fallback-chain-resolution.ts`.

  **Acceptance criteria**:
  - [ ] `node tests/requirements-test.js` includes and passes new regression cases.
  - [ ] No behavior change for known-agent fallback recommendations (unless a bug is fixed; document it).

  **QA scenarios**:
  ```
  Scenario: Known agent recommendation stable
    Tool: Bash
    Steps:
      1. node tests/requirements-test.js
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-10-known-agent-stable.txt

  Scenario: Unknown agent scoring uses normalized model contract
    Tool: Bash
    Steps:
      1. Start server
      2. curl -s http://localhost:<port>/api/agents | node -e "const d=JSON.parse(require('fs').readFileSync(0)); const u=d.find(x=>x.isUnknownAgent); console.log(!!u);"
    Expected Result: unknown agent(s) still get recommended models without errors
    Evidence: .sisyphus/evidence/task-10-unknown-agent-ok.txt
  ```

- [x] 11. Decide fate of `lib/core/model-requirements.js` (keep vs merge) and document source-of-truth

  **What to do**:
  - Evaluate whether `lib/core/model-requirements.js` should remain as a separate module or be merged into `lib/core/agents.js`.
  - Regardless, document the internal "source of truth" boundaries:
    - model parsing/formatting in `lib/core/models.js`
    - agent fallback chains + matching in `lib/core/model-requirements.js` (or `agents.js`)
  - Add a short developer note in a markdown doc (keep it minimal) that explains these boundaries.

  **Recommended agent profile**:
  - Category: `writing`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 10

  **References**:
  - `lib/core/model-requirements.js`
  - `lib/core/agents.js`
  - `docs/` (existing usage/troubleshooting docs)

  **Acceptance criteria**:
  - [ ] A clear internal boundary is documented in one markdown location.
  - [ ] No circular dependency introduced.

  **QA scenarios**:
  ```
  Scenario: Node tests still pass after module boundary change
    Tool: Bash
    Steps:
      1. node tests/requirements-test.js
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-11-tests-pass.txt

  Scenario: Server boots and agents endpoint works
    Tool: Bash
    Steps:
      1. ./run-tests.sh api
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-11-api-pass.txt
  ```

- [x] 12. Harden model parsing against upstream CLI output drift

  **What to do**:
  - Add defensive parsing: clearer error messages, bounds checks, and fallback behavior when parsing fails.
  - Consider caching last-known-good models and returning them when parse fails.
  - Add a regression test that simulates a partial/invalid CLI output and asserts graceful handling.

  **Must NOT do**:
  - Do not silently accept malformed data without warnings.

  **Recommended agent profile**:
  - Category: `ultrabrain`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 9

  **References**:
  - `lib/core/models.js:parseModels`
  - OpenCode CLI docs for `opencode models --verbose` behavior.

  **Acceptance criteria**:
  - [ ] Parse failures return a controlled error or last-known-good data with warnings.
  - [ ] New test covers invalid/partial parse path.

  **QA scenarios**:
  ```
  Scenario: Invalid CLI output handled gracefully
    Tool: Bash
    Steps:
      1. Run unit test covering invalid parse input
    Expected Result: PASS; no crash
    Evidence: .sisyphus/evidence/task-12-invalid-parse.txt

  Scenario: Normal model load unaffected
    Tool: Bash
    Steps:
      1. ./run-tests.sh api
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-12-normal-api-pass.txt
  ```

- [x] 13. Standardize `package.json` scripts to run the real suite

  **What to do**:
  - Update `package.json` so `npm test` (or `pnpm test`) runs `./run-tests.sh all`.
  - Keep dev deps unchanged.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 4

  **References**:
  - `package.json`
  - `run-tests.sh`

  **Acceptance criteria**:
  - [ ] `npm test` triggers the same checks as `./run-tests.sh all`.

  **QA scenarios**:
  ```
  Scenario: npm test runs full suite
    Tool: Bash
    Steps:
      1. npm test
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-13-npm-test.txt

  Scenario: No new prod dependencies
    Tool: Bash
    Steps:
      1. Inspect package.json deps vs devDeps
    Expected Result: runtime deps unchanged
    Evidence: .sisyphus/evidence/task-13-no-prod-deps.txt
  ```

- [x] 14. Add a lightweight concurrency guard for mutative profile/config endpoints

  **What to do**:
  - Add a simple in-process mutex/queue around mutative handlers (`/api/config`, profile switch/import/delete) to prevent concurrent writes from corrupting files.
  - Add a regression test or QA scenario that sends two rapid mutations and asserts the config remains valid JSONC.

  **Must NOT do**:
  - Do not add persistence layers or external locking.

  **Recommended agent profile**:
  - Category: `deep`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Task 2 (security posture first)

  **References**:
  - `lib/server.js` - mutative routes.
  - `lib/constants.js` - file locations.

  **Acceptance criteria**:
  - [ ] Two rapid POST saves do not corrupt files.

  **QA scenarios**:
  ```
  Scenario: Concurrent saves remain valid
    Tool: Bash
    Steps:
      1. Send two POST /api/config requests in background
      2. Fetch /api/config and validate it parses
    Expected Result: config still readable; server returns 200
    Evidence: .sisyphus/evidence/task-14-concurrency.txt

  Scenario: Delete + switch race handled
    Tool: Bash
    Steps:
      1. Trigger delete and switch quickly
    Expected Result: controlled error + no corruption
    Evidence: .sisyphus/evidence/task-14-delete-switch-race.txt
  ```

- [x] 15. Update docs for security posture + test running

  **What to do**:
  - Update existing docs to note:
    - server is intended for localhost use
    - CORS policy defaults
    - how to run tests (`./run-tests.sh all`, `npm test`)

  **Recommended agent profile**:
  - Category: `writing`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 2)
  - Blocked by: Tasks 2, 4, 13

  **References**:
  - `docs/USAGE.md`
  - `docs/TROUBLESHOOTING.md`
  - `run-tests.sh`

  **Acceptance criteria**:
  - [ ] Docs accurately reflect final behavior and commands.

  **QA scenarios**:
  ```
  Scenario: Docs commands succeed
    Tool: Bash
    Steps:
      1. Run the exact test command shown in docs
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-15-docs-verified.txt

  Scenario: Security note present
    Tool: Bash
    Steps:
      1. grep for "localhost" and "CORS" notes in docs
    Expected Result: present
    Evidence: .sisyphus/evidence/task-15-docs-security.txt
  ```

- [ ] 16. [DECISION NEEDED] Define the feature-expansion shortlist (pick 2-4)

  **What to do**:
  - Choose which items from Tasks 17-20 are IN scope for this cycle.
  - Default recommendation (if no decision): implement Tasks 17 and 18 only.

  **Recommended agent profile**:
  - Category: `writing`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: NO (blocks Wave 3)
  - Blocked by: Tasks 1-15 complete

  **Acceptance criteria**:
  - [ ] Wave 3 scope is explicitly declared in plan (selected tasks marked IN; others marked OUT).

  **QA scenarios**:
  ```
  Scenario: Feature scope is explicit
    Tool: Bash
    Steps:
      1. Confirm plan marks Wave 3 tasks as IN/OUT
    Expected Result: scope is unambiguous
    Evidence: .sisyphus/evidence/task-16-scope-declared.txt

  Scenario: No unplanned feature changes
    Tool: Bash
    Steps:
      1. Review git diff for non-selected feature tasks
    Expected Result: no changes outside selected list
    Evidence: .sisyphus/evidence/task-16-no-scope-creep.txt
  ```

- [ ] 17. Add optional explicit port override for server + test runner

  **What to do**:
  - Add a documented env var (e.g., `OMO_PORT`) to force server bind port.
  - Update `run-tests.sh` to honor the same var (if set) instead of log parsing.

  **Must NOT do**:
  - Do not remove existing port probing behavior by default.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 3)
  - Blocked by: Task 4

  **References**:
  - `lib/server.js` - port selection.
  - `run-tests.sh` - base URL/port logic.

  **Acceptance criteria**:
  - [ ] `OMO_PORT=4567 opencode-agent-config` binds to 4567.
  - [ ] `OMO_PORT=4567 ./run-tests.sh api` targets 4567.

  **QA scenarios**:
  ```
  Scenario: Port override works
    Tool: Bash
    Steps:
      1. OMO_PORT=4567 ./run-tests.sh api
    Expected Result: PASS and uses 4567
    Evidence: .sisyphus/evidence/task-17-port-override.txt

  Scenario: Default probing still works
    Tool: Bash
    Steps:
      1. ./run-tests.sh api
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-17-default-probe.txt
  ```

- [ ] 18. Add upstream drift detection for fallback chains (OmO guide vs TS source)

  **What to do**:
  - Add a non-runtime (dev/test) script that compares pinned upstream OmO fallback definitions against the local mirrored requirements.
  - Goal is to detect when OmO changes provider/model lists so this tool can be updated intentionally.
  - Record a pinned commit SHA or tag in a markdown file to make drift reviews explicit.

  **Must NOT do**:
  - Do not add network calls to runtime server paths.

  **Recommended agent profile**:
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 3)
  - Blocked by: Task 10/11 (source-of-truth boundaries)

  **References**:
  - Upstream OmO: `docs/guide/agent-model-matching.md`
  - Upstream OmO: `src/shared/model-requirements.ts`
  - Local mirror: `lib/core/model-requirements.js` (or merged location)

  **Acceptance criteria**:
  - [ ] Running drift script exits non-zero when upstream mismatch is detected.
  - [ ] Drift script is invoked by `./run-tests.sh all` or `npm test` (dev-only).

  **QA scenarios**:
  ```
  Scenario: Drift script runs in dev mode
    Tool: Bash
    Steps:
      1. Run the drift check script
    Expected Result: exit 0 in normal state
    Evidence: .sisyphus/evidence/task-18-drift-check.txt

  Scenario: Simulated drift detected
    Tool: Bash
    Steps:
      1. Temporarily change local mirror in a test fixture
      2. Run drift check
    Expected Result: exit non-zero with clear message
    Evidence: .sisyphus/evidence/task-18-drift-detected.txt
  ```

- [ ] 19. Optional: Add minimal GitHub Actions CI for `./run-tests.sh all`

  **What to do**:
  - Add `.github/workflows/test.yml` to run `./run-tests.sh all` on PRs.
  - Ensure it installs Playwright browsers as needed.

  **Must NOT do**:
  - Do not require secrets.
  - Keep runtime deps unchanged.

  **Recommended agent profile**:
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**:
  - Can run in parallel: YES (Wave 3)
  - Blocked by: Task 4, Task 13

  **Acceptance criteria**:
  - [ ] Workflow runs on PR and passes.

  **QA scenarios**:
  ```
  Scenario: CI workflow validates suite
    Tool: Bash
    Steps:
      1. Use act (optional) or push to PR branch
    Expected Result: checks green
    Evidence: .sisyphus/evidence/task-19-ci-pass.txt

  Scenario: No secrets required
    Tool: Bash
    Steps:
      1. Inspect workflow for secrets usage
    Expected Result: none
    Evidence: .sisyphus/evidence/task-19-no-secrets.txt
  ```

- [ ] 20. Optional: UI quality-of-life polish (non-redesign)

  **What to do**:
  - Small UX tweaks only (e.g., clearer warnings when recommendations are heuristic vs chain-based; make variant/provenance tooltips consistent).
  - No layout overhaul.

  **Recommended agent profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**:
  - Can run in parallel: YES (Wave 3)
  - Blocked by: Task 10

  **References**:
  - `lib/web/app.js`
  - `lib/web/styles.css`

  **Acceptance criteria**:
  - [ ] Playwright test updated/extended to cover new UI behavior.

  **QA scenarios**:
  ```
  Scenario: Warning/provenance shown correctly
    Tool: Playwright
    Steps:
      1. Load agents view
      2. Open an agent detail modal
      3. Assert badge/tooltips show expected text
    Expected Result: selectors match, assertions pass
    Evidence: .sisyphus/evidence/task-20-ui-qol.png

  Scenario: No UI regressions
    Tool: Bash
    Steps:
      1. ./run-tests.sh ui
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-20-ui-tests.txt
  ```

---

## Final verification wave

- [ ] F1. Plan compliance audit (oracle)

  **What to do**:
  - Verify each Must-have is implemented.
  - Confirm Must-NOT rules: no auto-changing assignments, no API breaks, no new runtime deps.

  **QA scenarios**:
  ```
  Scenario: Audit deliverables vs plan
    Tool: Bash + manual file inspection
    Steps:
      1. Run ./run-tests.sh all
      2. Inspect headers on representative API responses
    Expected Result: PASS and compliant
    Evidence: .sisyphus/evidence/final-f1-audit.txt
  ```

- [ ] F2. Code quality review (unspecified-high)
  - Run lints/type checks if present; otherwise ensure no obvious code smell regressions.
  - Ensure no duplicate logic reintroduced.

- [ ] F3. Real QA run-through (unspecified-high)
  - Execute QA scenarios for Tasks 1-20; store evidence under `.sisyphus/evidence/final-qa/`.

- [ ] F4. Scope fidelity check (deep)
  - Confirm Wave 3 only implemented selected features (Task 16 decision).

---

## Commit strategy
- Prefer small, atomic commits per task or per tightly-related task pair.
- No `--amend`; never force push.

## Success criteria
- `./install.sh` produces a working installed CLI.
- `./run-tests.sh all` passes on a machine where port 3456 is already in use.
- `/api/agents` recommendation payloads contain consistent fields used by scoring.
- No wildcard CORS on mutative endpoints.
