# Upstream Sync Operator Workflow

This document describes how to synchronize OmO Agent Config with the upstream Oh My Opencode repository. Keeping your local model requirements in sync ensures your agent configurations work correctly with the latest upstream changes.

## Overview

**What is upstream sync?**

Upstream sync is the process of comparing your local `lib/core/model-requirements.js` against the upstream Oh My Opencode source (`code-yeongyu/oh-my-opencode` on the `dev` branch). This detects:

- **New agents** added to upstream that you don't have locally
- **Removed agents** that no longer exist upstream
- **Changed fallback chains** or gating requirements for existing agents
- **New/changed categories** with updated model requirements

**Why it matters:**

Oh My Opencode evolves rapidly. New agents are added, model recommendations change, and fallback chains are updated. Running drift checks ensures your local configuration stays compatible and takes advantage of improvements.

---

## Drift Check Commands

The `drift-check.js` script compares local model requirements against upstream.

### Basic Check (Human-Readable)

```bash
node scripts/drift-check.js
```

**Expected output when no drift:**
```
🔍 OmO Upstream Drift Check
   Local: /path/to/lib/core/model-requirements.js
   Upstream: https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts
   Mode: check (read-only)

📊 Comparison Results:
   Agents: 12 upstream, 12 local
   Categories: 8 upstream, 8 local

✅ No drift detected - local mirror is up to date
```

**Expected output when drift detected:**
```
⚠ Drift detected!

New agents in upstream (need to add):
   + new-agent-name: openai/gpt-5.2 → anthropic/claude-sonnet-4-5

Agents with changed fallback chains or gating:
   ~ existing-agent:
     upstream chain: openai/gpt-5.2 → anthropic/claude-opus-4-5
     local chain:    openai/gpt-4.1 → anthropic/claude-opus-4-5

💡 Run the following to update:
   1. Review upstream changes at: https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/shared/model-requirements.ts
   2. Update /path/to/lib/core/model-requirements.js
   3. Update pinned SHA in file header or .omo-upstream-sha
```

### Machine-Readable Output (JSON)

```bash
node scripts/drift-check.js --json
```

**Expected output:**
```json
{
  "hasDrift": false,
  "newAgents": [],
  "missingAgents": [],
  "changedAgents": [],
  "newCategories": [],
  "missingCategories": [],
  "changedCategories": [],
  "pinnedSha": "abc123...",
  "currentSha": "def456...",
  "actionRequired": []
}
```

When drift is detected, `hasDrift` will be `true` and the arrays will contain the specific differences.

### Refresh Cache and Check

```bash
node scripts/drift-check.js --refresh
```

**What it does:**
- Fetches fresh upstream data (ignores cache)
- Updates the cached snapshot in `~/.config/opencode/cache/upstream-snapshot.json`
- Performs the drift comparison

**Use when:**
- You suspect the cache is stale
- You want to ensure you're comparing against the absolute latest upstream
- The basic check shows unexpected results

### Pin Current Upstream SHA

```bash
node scripts/drift-check.js --pin
```

**Expected output:**
```
✅ Pinned upstream SHA: def456789abc...
   Written to: /path/to/.omo-upstream-sha
```

**What it does:**
- Records the current upstream commit SHA to `.omo-upstream-sha`
- Future drift checks will display this pinned SHA for reference
- Helps you track exactly which upstream version you're synced to

**JSON mode:**
```bash
node scripts/drift-check.js --pin --json
```

Output:
```json
{
  "pinnedSha": "def456789abc...",
  "success": true
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No drift detected (or network unavailable, graceful) |
| 1 | Drift detected (only with `--exit-on-drift` flag) |
| 2 | Network error or parsing failure |

**CI/CD usage:**
```bash
# Fail the build if drift is detected
node scripts/drift-check.js --exit-on-drift || exit 1
```

---

## Doc Scan Commands

The `omo-doc-scan.js` script scans upstream documentation for explicit "discouraged model" signals.

### Basic Scan (Human-Readable)

```bash
node scripts/omo-doc-scan.js
```

**Expected output when no warnings:**
```
Oh My Opencode Documentation Scan Results
=========================================

No explicit discouraged model signals found across 15 documents

Generated at: 2026-02-20T10:30:00.000Z

Sources scanned (15):
  - docs/agents/oracle.md
  - docs/agents/sisyphus.md
  - ...

No discouraged model signals detected.
```

**Expected output with warnings:**
```
Oh My Opencode Documentation Scan Results
=========================================

Found 3 discouraged model signals (1 avoid, 2 warning) across 15 documents, affecting 2 unique models

Generated at: 2026-02-20T10:30:00.000Z

Sources scanned (15):
  - docs/agents/oracle.md
  - ...

Entries found (3):

AVOID:
  [docs/agents/oracle.md:42] gpt-3.5 (openai)
    Reason: Found "avoid" in context with model mention

WARNINGS:
  [docs/agents/sisyphus.md:88] claude-3-haiku (anthropic)
    Reason: Found "not recommended" in context with model mention
```

### Machine-Readable Output (JSON)

```bash
node scripts/omo-doc-scan.js --json
```

**Expected output:**
```json
{
  "entries": [
    {
      "model": "gpt-3.5",
      "provider": "openai",
      "reason": "Found \"avoid\" in context with model mention",
      "source": "docs/agents/oracle.md",
      "line": 42,
      "severity": "avoid",
      "context": "We recommend you avoid using gpt-3.5 for complex reasoning tasks..."
    }
  ],
  "summary": "Found 1 discouraged model signals (1 avoid, 0 warning) across 15 documents, affecting 1 unique models",
  "sources": [
    "docs/agents/oracle.md",
    "docs/agents/sisyphus.md"
  ],
  "generatedAt": "2026-02-20T10:30:00.000Z"
}
```

### Verbose Mode

```bash
node scripts/omo-doc-scan.js --verbose
```

**Expected output:**
```
Fetching docs directory listing...
Found 15 markdown files to scan
Scanning docs/agents/oracle.md...
Scanning docs/agents/sisyphus.md...
...

Oh My Opencode Documentation Scan Results
=========================================
...
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (or graceful degradation on network error) |
| 1 | Invalid arguments |
| 2 | Fatal error |

---

## Snapshot Commands

The `upstream-snapshot.js` script generates a complete normalized snapshot of upstream state.

### Basic Snapshot (JSON to stdout)

```bash
node scripts/upstream-snapshot.js
```

**Expected output:**
```json
{
  "version": "1.0.0",
  "generatedAt": "2026-02-20T10:30:00.000Z",
  "sourceRef": {
    "repo": "code-yeongyu/oh-my-opencode",
    "branch": "dev",
    "commitSha": "def456789abc..."
  },
  "agents": [
    {
      "name": "oracle",
      "fallbackChain": [...],
      "gating": {...},
      "metadata": {...}
    }
  ],
  "categories": [...],
  "discouraged": []
}
```

### Machine-Readable Mode (Compact JSON)

```bash
node scripts/upstream-snapshot.js --json
```

Outputs compact JSON without formatting (single line, no indentation).

### Save to File

```bash
node scripts/upstream-snapshot.js --output snapshot.json
```

**Expected output:**
```
✅ Snapshot written to snapshot.json
```

### Skip Cache

```bash
node scripts/upstream-snapshot.js --no-cache
```

**What it does:**
- Ignores any existing cached snapshot
- Fetches fresh data from upstream
- Does not write to cache after fetching

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Network error |
| 2 | Parse error |

---

## Typical Workflow

### Daily Development

```bash
# Quick check - are we in sync?
node scripts/drift-check.js

# If drift detected, review the changes
node scripts/drift-check.js --json | jq '.changedAgents[]'
```

### Weekly Maintenance

```bash
# 1. Refresh the cache to get latest upstream
node scripts/drift-check.js --refresh

# 2. Check for documentation warnings
node scripts/omo-doc-scan.js

# 3. Generate a full snapshot for reference
node scripts/upstream-snapshot.js --output upstream-$(date +%Y%m%d).json

# 4. If all looks good, pin the SHA
node scripts/drift-check.js --pin
```

### Before Releases

```bash
# Ensure no drift before cutting a release
node scripts/drift-check.js --exit-on-dift || {
  echo "ERROR: Upstream drift detected. Please sync before releasing."
  exit 1
}

# Verify no discouraged models in current assignments
node scripts/omo-doc-scan.js --json | jq '.entries[] | select(.severity == "avoid")' && {
  echo "WARNING: Current config uses discouraged models"
}
```

### CI/CD Integration

```yaml
# Example GitHub Actions step
- name: Check upstream drift
  run: node scripts/drift-check.js --exit-on-drift
  
- name: Scan for discouraged models
  run: |
    node scripts/omo-doc-scan.js --json > doc-scan.json
    if jq -e '.entries | length > 0' doc-scan.json; then
      echo "Documentation warnings found:"
      jq '.entries[]' doc-scan.json
    fi
```

---

## Troubleshooting

### "Network unavailable or fetch failed"

**Cause:** GitHub API rate limiting or network issues

**Solutions:**
1. Wait a few minutes and retry (rate limits reset)
2. Use cached data: The scripts gracefully fall back to cache on network errors
3. Check your internet connection
4. If behind a proxy, ensure `HTTPS_PROXY` is set

### "Failed to parse AGENT_MODEL_REQUIREMENTS"

**Cause:** Upstream TypeScript format changed

**Solutions:**
1. Check if upstream made breaking changes to the file structure
2. Update the parsing regex in the script if needed
3. File an issue if the format change is permanent

### Cache Issues

**Clear the cache:**
```bash
rm ~/.config/opencode/cache/upstream-snapshot.json
```

**Force refresh:**
```bash
node scripts/drift-check.js --refresh
node scripts/upstream-snapshot.js --no-cache
```

### Drift Check Shows False Positives

**Cause:** Local modifications that intentionally differ from upstream

**Solutions:**
1. Document why the local version differs (add comments in the file)
2. Use `--json` output and filter out known differences in your scripts
3. Consider if the local change should be proposed upstream

### Doc Scan Shows Outdated Warnings

**Cause:** Documentation may reference old model versions

**Solutions:**
1. Check the specific line numbers in the upstream docs
2. Verify if the warning still applies to current model versions
3. The scan is informational - use judgment when interpreting results

---

## Summary Table

| Script | Purpose | Key Flags |
|--------|---------|-----------|
| `drift-check.js` | Compare local vs upstream requirements | `--json`, `--refresh`, `--pin`, `--exit-on-drift` |
| `omo-doc-scan.js` | Scan docs for discouraged model signals | `--json`, `--verbose` |
| `upstream-snapshot.js` | Generate full upstream snapshot | `--json`, `--output <file>`, `--no-cache` |

---

## Related Files

- `lib/core/model-requirements.js` - Local model requirements (the file being checked)
- `.omo-upstream-sha` - Pinned upstream commit SHA
- `~/.config/opencode/cache/upstream-snapshot.json` - Cached upstream data
