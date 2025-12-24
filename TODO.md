# TODO - Future Enhancements

## LMstudio Model Support

**Issue**: LMstudio plugin initializes but models don't appear in `opencode models` output

**Details**:
- LMstudio is running with models loaded (confirmed via http://localhost:1234/v1/models)
- Plugin shows `[opencode-lmstudio] LM Studio plugin initialized` 
- However, no lmstudio-prefixed models appear in the model list
- Available LMstudio models include: nvidia/nemotron-3-nano, openai/gpt-oss-120b, qwen2.5-14b-instruct-1m, meta-llama-3.1-8b-instruct, mistralai/mistral-7b-instruct-v0.3

**Possible Solutions**:
1. Investigate if opencode-lmstudio plugin needs additional configuration
2. Check if there's a different command to query plugin-provided models
3. Add manual LMstudio model support (allow users to manually add models visible in LMstudio)
4. Work with OpenCode team to fix plugin integration

**Priority**: Medium - Users can still use LMstudio models if they manually type the model ID, but they won't appear in the recommended/searchable list

---

## Other Future Enhancements

Add additional enhancement ideas here as they come up.
