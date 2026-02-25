# Provider Policies

OmO Agent Config supports customizing provider policies to control model ranking and recommendations. This document explains how provider policies work and how to configure them.

## Overview

Provider policies define:
- **Billing Model**: How the provider charges (subscription, metered, free, unknown)
- **Speed Tier**: Relative inference speed (fast, normal, slow, unknown)
- **Priority Tier**: Ranking priority (1 = highest priority, 99 = lowest)

These policies influence:
1. Model ranking when multiple providers offer the same model
2. Model recommendations for agents
3. Badge display in the UI (SUB/PAY/FREE billing badges, ⚡ speed badge)

## Default Policies

The following default policies are configured for known providers:

| Provider | Billing | Speed | Priority |
|----------|---------|-------|----------|
| Anthropic | metered | normal | 1 |
| OpenAI | metered | normal | 1 |
| Google | metered | normal | 1 |
| Fireworks AI | metered | fast | 2 |
| GitHub Copilot | subscription | normal | 4 |
| Kimi for Coding | unknown | fast | 5 |
| OpenCode | unknown | normal | 6 |
| Z.ai Coding Plan | unknown | normal | 7 |
| Venice | free | slow | 8 |

## User Overrides

Users can customize provider policies through:

### 1. Web UI

1. Click the **📊 Policies** button in the header
2. Modify billing model, speed tier, and priority for each provider
3. Click **Save Changes**

### 2. Manual Configuration

Create or edit `~/.config/opencode/provider-policies.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-02-24T12:00:00Z",
  "providers": {
    "fireworks-ai": {
      "billingModel": "subscription",
      "speedTier": "fast",
      "priorityTier": 1,
      "notes": "Custom priority for Fireworks"
    }
  }
}
```

## Policy Fields

### billingModel

- `subscription` - Fixed monthly/yearly fee
- `metered` - Pay per token/request
- `free` - No cost
- `unknown` - Pricing unknown

### speedTier

- `fast` - Fast inference (⚡ badge shown)
- `normal` - Standard speed
- `slow` - Slower inference
- `unknown` - Speed unknown

### priorityTier

- Range: 1-99
- Lower = better (higher priority in rankings)
- Default for unknown providers: 99

### notes

- Optional text field (max 120 characters)
- For user reference only

## Ranking Algorithm

When ranking providers for a model:

1. **Priority Tier Score**: `priorityTier * 10` (lower is better)
2. **Speed Score**: `-5` for fast, `+5` for slow
3. **Context Score**: `-20` for 200K+ context, `-10` for 128K+
4. **Cost Score**: 
   - Known cost: `min(totalCost, 50)`
   - Unknown cost with subscription/free: `-10` bonus

Total score is summed; lower is better.

## API Endpoints

### GET /api/providers

Returns all provider policies:

```json
{
  "providers": {
    "anthropic": { "billingModel": "metered", "speedTier": "normal", "priorityTier": 1, "source": "default" }
  },
  "hasOverride": true,
  "overrideFile": "~/.config/opencode/provider-policies.json"
}
```

### POST /api/providers

Update provider policies:

```json
{
  "providers": {
    "fireworks-ai": { "billingModel": "metered", "speedTier": "fast", "priorityTier": 2 }
  }
}
```

### POST /api/providers/reset

Delete all user overrides and restore defaults.

## UI Badges

Based on provider policies, models display:

- **SUB** badge for subscription billing
- **PAY** badge for metered billing  
- **FREE** badge for free billing
- **⚡** badge for fast speed tier

## Troubleshooting

### Policies not taking effect

1. Verify the override file exists and is valid JSON
2. Check that provider IDs match (use lowercase with hyphens, e.g., `fireworks-ai`)
3. Restart the web UI to reload policies

### Invalid override file

If `provider-policies.json` is invalid, the system logs a warning and falls back to defaults. Fix the JSON syntax and reload.
