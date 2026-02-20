

## Task 13: Update run-tests.sh to Run Node Requirements Tests

### Changes Made

#### run-tests.sh

Added Node.js requirements test execution to both `api` and `all` test modes:

1. **API mode** (after curl endpoint tests):
   ```bash
   # Run Node.js requirements tests
   echo ""
   echo "Running requirements tests..."
   node tests/requirements-test.js || { echo "  ❌ Requirements tests failed"; exit 1; }
   ```

2. **All mode** (between API and UI tests):
   ```bash
   # Requirements tests
   echo ""
   echo "=== Requirements Tests ==="
   node tests/requirements-test.js || { echo "❌ Requirements tests failed"; exit 1; }
   ```

### Implementation Details

**Error handling:**
- Uses `|| { echo "..."; exit 1; }` pattern to provide clear failure message and non-zero exit
- The script already has `set -e` which would catch failures, but explicit error handling provides better UX
- The node test script itself exits with code 1 on failure, code 0 on success

**Test execution flow:**
- `api` mode: curl checks → requirements tests → complete
- `all` mode: API tests → requirements tests → UI tests → complete
- `ui` mode: unchanged (Playwright tests only)

### Test Results

```
$ ./run-tests.sh api
...
Running requirements tests...
==================================
Requirements & Normalization Tests
==================================

✓ GitHub Copilot transform: claude-opus-4-6 → claude-opus-4.6
✓ GitHub Copilot transform: claude-sonnet-4-6 → claude-sonnet-4.6
...
✓ Deep category requiresModel: fails when required model unavailable

==================================
Test Summary
==================================
Passed: 41
Failed: 0

✅ All tests passed

✅ API tests complete

Exit code: 0
```

### Files Modified

- `run-tests.sh` - Added node requirements test to `api` and `all` modes

### Dependencies

- Uses existing `tests/requirements-test.js` (Task 11)
- No new dependencies (Node.js built-in only)
