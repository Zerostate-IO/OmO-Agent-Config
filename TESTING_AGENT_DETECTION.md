# Testing Agent Discovery

This repo can fetch agent documentation from upstream (GitHub) and check for newly-added agents.

## API endpoints

Start the server (no browser auto-open):

```bash
OMO_NO_OPEN=1 opencode-agent-config
```

Then:

```bash
# List cached agent docs
curl -s http://localhost:3456/api/agents | jq '.total'

# Refresh agent cache from GitHub
curl -s -X POST http://localhost:3456/api/agents/refresh | jq '.status'

# Discover new agents (compares current roster to upstream)
curl -s http://localhost:3456/api/agents/discover | jq
```

## Notes

- Discovery is only as good as upstream visibility and the parser in `lib/core/agents.js`.
- The web UI surfaces this in the Agents view ("check for new agents").
