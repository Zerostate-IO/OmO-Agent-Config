---
name: omo-agent-metadata-and-model-picker
description: |
  Use when a config UI needs richer built-in agent descriptions (purpose, access/read-only, caveats)
  and a scalable model picker (search + filters + grouped results) instead of a giant “other” list.
  Applies to OmO-Agent-Config: merge local AGENT_PROFILES with upstream oh-my-opencode agent metadata,
  then surface it in WebUI and the agent→model selection modal.
---

# OmO agent metadata + scalable model picker

## Problem

- Agent lists are hard to understand with only a name and a minimal description.
- Model selection dialogs don’t scale when they dump a long-tail “other” bucket of 100–200+ models.

## Context / Trigger Conditions

- You have an agent→model assignment UI.
- Users complain that the picker is a flat list / “other” bucket.
- You already have (or can fetch) upstream agent definitions (system prompt metadata) and want to enrich local UI.

## Solution

### 1) Merge two sources of truth

- **Local static profile** (fast, curated UX fields): `AGENT_PROFILES` in `lib/constants.js`.
  - Add fields like: `access` (`read-only|limited|write`), `usage[]`, `caveats[]`, plus existing `preferred[]`, `minContext`.
- **Upstream parsed agent metadata** (authoritative intent): `lib/core/agents.js`.
  - Fetches TypeScript from `code-yeongyu/oh-my-opencode` and parses `description`, role/behaviors/constraints.
  - Infer an `access` mode from common constraint language (read-only/plan-only), but prefer the local curated `AGENT_PROFILES.access` when present.

Expose merged metadata via the API:

- In `lib/server.js` `GET /api/agents` and `GET /api/agents/:name`, attach:
  - `summary` (curated description)
  - `access`, `usage[]`, `caveats[]`, `preferred[]`
  - `recommendedModels[]` (top N) plus `recommendedModel` (single best)

### 2) Replace “other models” with a picker that scales

In the WebUI model selector modal:

- Add an inline **search box** and lightweight **filters**:
  - provider select
  - min context select
  - capability chips (reasoning/image/pdf/thinking/fast)

Render results in sections:

1. **Recommended for this agent** (top N IDs from API; map to model objects in the client)
2. **In use in this config** (models currently assigned to any agent)
3. **All models (N)** grouped by **provider** (optionally capped to avoid huge renders)

This removes the UX anti-pattern of a giant “other” bucket while still offering full access.

## Verification

- `GET /api/agents` returns merged fields (`summary`, `access`, `usage`, `caveats`, `preferred`, `recommendedModels`).
- WebUI agent cards show richer summaries and caveats.
- WebUI “Change model” modal supports search + filters and groups results (no flat “other” dump).
- Basic runtime check: `node -e "require('./lib/constants'); require('./lib/core/agents'); require('./lib/server');"`.

## Example

- User clicks **Change Model** on an agent card.
- Modal shows agent summary + requirement hints.
- User types `claude` and selects provider `anthropic`.
- Results narrow instantly; recommended models are pinned at the top.

## Notes

- Keep the UI dependency-free (plain DOM + event listeners + re-render) to match this repo’s zero-npm approach.
- Cap “All models” rendering (e.g., first 120) and prompt users to refine filters for large catalogs.
