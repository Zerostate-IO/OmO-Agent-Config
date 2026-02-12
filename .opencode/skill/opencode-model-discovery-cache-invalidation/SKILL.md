---
name: opencode-model-discovery-cache-invalidation
description: |
  Use when OmO-Agent-Config (or similar tools) doesn't show newly-added OpenCode providers/models even though you updated opencode.json.
  Symptoms: UI still shows old provider list; API reports `cached: true`; models appear after waiting a few minutes or forcing refresh.
  Solves: stale model cache + overly-strict model header regex for `opencode models --verbose` output.
---

# OpenCode model discovery: cache invalidation + robust parsing

## Problem

After adding/enabling a provider or plan (e.g. a Codex plan) in `~/.config/opencode/opencode.json`, tools that consume `opencode models --verbose` may keep showing the old provider/model list.

## Context / Trigger Conditions

- The tool caches results from `opencode models --verbose` (e.g. `~/.config/opencode/cache/models-cache.json`).
- The UI/API indicates the model list was served from cache (`cached: true`).
- Newly added provider/models appear only after cache TTL expires or after a manual refresh.

Secondary trigger:
- A provider/model exists in `opencode models --verbose`, but parsing fails because the tool uses a too-strict header regex for lines like `providerID/modelID` (common misses: underscores/dots in provider IDs).

## Solution

1) **Invalidate model cache when the OpenCode provider config changes**

- Compare `mtime` of `~/.config/opencode/opencode.json` to the cache timestamp.
- If `opencode.json` is newer than the cache, treat cache as stale and refetch.

2) **Use a more permissive model header regex**

- Header lines in `opencode models --verbose` are emitted as `providerID/modelID` on their own line.
- Use a regex that supports common provider/model ID characters beyond `[a-z0-9-]` (at least allow `_` and `.`).

Example pattern (case-insensitive):

```js
const modelHeaderLineRe = /^[a-z0-9_.-]+\/[a-z0-9_.-]+[a-z0-9_.-:/]*$/i;
```

## Verification

- Warm-cache behavior:
  - First load: `cached: false`
  - Second load: `cached: true`

- After touching/modifying `opencode.json`:
  - Next load should return `cached: false` and include the new provider in the providers list.

## Example

- Add a new provider/plan in `~/.config/opencode/opencode.json`.
- Start tool, see provider missing.
- With cache invalidation, provider appears immediately after config change (no waiting for TTL).

## Notes

- Brace-count parsing of JSON blocks can be fragile if `{`/`}` appear inside JSON strings. Prefer a parser that can handle this if upstream ever emits braces inside string values.
