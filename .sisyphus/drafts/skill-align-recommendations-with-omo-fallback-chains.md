---
name: align-recommendations-with-omo-fallback-chains
description: |
  Use when updating a tool's "recommended models" logic to match Oh My OpenCode.
  Trigger: recommendations drift from upstream docs; you need deterministic, provider-aware
  fallback chains, variant handling, and github-copilot model-id transforms.
---

# Align Recommendations With Oh My OpenCode Fallback Chains

## Problem

A local configuration UI/tool recommends models using heuristics (context/capabilities/cost), but upstream Oh My OpenCode defines explicit fallback chains per agent/category plus provider priority and provider-specific model-id transforms.

Symptoms:
- UI recommends models from the wrong family (e.g., GPT for Claude-optimized agents).
- Duplicate model provider compare picks the "wrong" provider.
- Recommendations fail to resolve because upstream uses `claude-opus-4-6` but a provider uses `claude-opus-4.6`.

## Context / Trigger Conditions

- You have an available model list from `opencode models --verbose`.
- You want recommendations to match upstream docs:
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/guide/agent-model-matching.md`
- You want to treat upstream `model-requirements.ts` as the recommendation "truth":
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`

## Solution

1) Mirror upstream requirements locally
- Copy `AGENT_MODEL_REQUIREMENTS` and `CATEGORY_MODEL_REQUIREMENTS` as static data.

2) Implement upstream-style resolution
- Resolve by iterating `fallbackChain` entries in order, then providers in order.
- Provider availability can be inferred from the discovered model list ("provider is available" if any model exists with that provider).
- Apply provider-specific transforms (github-copilot transforms are critical):
  - `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/provider-model-id-transform.ts`

3) Add tolerant model-id matching
- Normalize punctuation so `claude-opus-4-6` can match `claude-opus-4.6` (and similar).
- Prefer exact `provider/model` match when possible; fallback to normalized comparison.

4) Preserve heuristics as a fallback
- If an agent/category is unknown to upstream, keep existing heuristic scoring so the system still works.

5) Variant handling
- Upstream uses `variant` as a separate config field. If your tool can write configs, persist `variant` when the user selects a recommended model that includes it.

6) Provider priority in compare views
- If you have a "compare providers" route/feature, update provider tiers to match upstream priority:
  Native (anthropic/openai/google) > kimi-for-coding > github-copilot > venice > opencode > zai-coding-plan.

## Verification

- Deterministic node script (no test runner) that validates:
  - fallback ordering for 1-2 agents
  - github-copilot transforms
  - punctuation-tolerant matching
  - legacy agent key normalization if applicable
- One Playwright assertion to ensure the UI shows a Recommended section with at least one item.

## Example

- Implement `resolveModelFromChain(fallbackChain, availability) -> { model, variant } | null`.
- Implement `transformModelForProvider("github-copilot", "claude-opus-4-6") -> "claude-opus-4.6"`.
- Match `"anthropic/claude-opus-4.6"` when the requirement asks for `"claude-opus-4-6"`.

## Notes

- Upstream agent keys are lowercase; tools should treat keys case-insensitively and write canonical lowercase.
- Keep API responses backward compatible: add fields, don’t remove.

## References

- Guide: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/guide/agent-model-matching.md`
- Requirements: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/shared/model-requirements.ts`
- Resolution: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/fallback-chain-resolution.ts`
- Copilot transforms: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/src/cli/provider-model-id-transform.ts`
- Config variant field: `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/docs/configurations.md`
