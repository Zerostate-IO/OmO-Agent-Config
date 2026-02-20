#!/bin/bash

# Test runner for OmO Agent Config
# Usage: ./run-tests.sh [api|ui|install|drift|all]

set -e

# Cleanup trap to ensure server is always terminated
cleanup() {
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
        rm -f "$LOG_FILE"
    fi
}
trap cleanup EXIT

echo "=================================="
echo "OmO Agent Config - Test Suite"
echo "=================================="
echo ""

# Create temp log file for server output
LOG_FILE=$(mktemp /tmp/omo-test-server.XXXXXX.log)
SERVER_PID=""
BASE_URL=""

# Function to extract port from log file
get_port_from_log() {
    grep -oE "http://localhost:[0-9]+" "$LOG_FILE" 2>/dev/null | head -n1 | cut -d: -f3
}

run_install_tests() {
    echo "=== Install Tests ==="
    echo ""
    
    local INSTALL_DIR="$HOME/.config/opencode"
    local BINARY="$INSTALL_DIR/bin/opencode-agent-config"
    local FAILED=0
    
    if [ -f "$BINARY" ]; then
        echo "✅ Binary exists: $BINARY"
    else
        echo "❌ Binary not found: $BINARY"
        FAILED=1
    fi
    
    if [ -x "$BINARY" ]; then
        echo "✅ Binary is executable"
    else
        echo "❌ Binary is not executable"
        FAILED=1
    fi
    
    if [ -x "$BINARY" ]; then
        if "$BINARY" --help > /dev/null 2>&1; then
            echo "✅ Binary responds to --help"
        else
            echo "❌ Binary --help failed"
            FAILED=1
        fi
    fi
    
    local LIB_FILES=(
        "$INSTALL_DIR/lib/server.js"
        "$INSTALL_DIR/lib/core/model-requirements.js"
        "$INSTALL_DIR/lib/core/agents.js"
    )
    
    for lib_file in "${LIB_FILES[@]}"; do
        if [ -f "$lib_file" ]; then
            echo "✅ Lib file exists: $(basename "$lib_file")"
        else
            echo "❌ Lib file not found: $lib_file"
            FAILED=1
        fi
    done
    
    echo ""
    if [ $FAILED -eq 0 ]; then
        echo "✅ Install tests passed"
        return 0
    else
        echo "❌ Install tests failed"
        return 1
    fi
}

# Function to wait for server to be ready
wait_for_server() {
    local max_wait=${1:-30}
    local count=0
    local port=""
    
    while [ $count -lt $max_wait ]; do
        # Check if server process is still running
        if ! kill -0 $SERVER_PID 2>/dev/null; then
            echo "❌ Server process died unexpectedly"
            return 1
        fi
        
        # Try to get port from log if we don't have it yet
        if [ -z "$port" ]; then
            port=$(get_port_from_log)
        fi
        
        # Test if server is actually responding
        if [ -n "$port" ]; then
            if curl -s "http://localhost:$port/api/config" > /dev/null 2>&1; then
                echo "$port"
                return 0
            fi
        fi
        
        sleep 1
        count=$((count+1))
        echo "  Waiting for server... ($count/$max_wait)" >&2
    done
    
    return 1
}

# Check if an OmO server is already running on any port 3456-3465
# Validates the server by checking for the 'config' key in the response
find_existing_server() {
    for port in 3456 3457 3458 3459 3460 3461 3462 3463 3464 3465; do
        local response
        response=$(curl -s "http://localhost:$port/api/config" 2>/dev/null)
        # Check if response contains "config" key (OmO server signature)
        if echo "$response" | grep -q '"config"'; then
            echo "$port"
            return 0
        fi
    done
    return 1
}

# Check for explicit port from environment variable
if [ -n "$OMO_PORT" ]; then
    echo "Using explicit port from OMO_PORT: $OMO_PORT"
    BASE_URL="http://localhost:$OMO_PORT"
    # Don't start a server, assume user has started one or will start one
    SERVER_PID=""
# Try to find existing server first
elif EXISTING_PORT=$(find_existing_server); then
    echo "✅ Using existing server at http://localhost:$EXISTING_PORT"
    BASE_URL="http://localhost:$EXISTING_PORT"
else
    echo "Starting server..."
    OMO_NO_OPEN=1 CI=true node bin/opencode-agent-config > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    echo "  Server PID: $SERVER_PID"
    echo "  Polling for port..."

    TEST_PORT=$(wait_for_server 30)

    if [ -z "$TEST_PORT" ]; then
        echo "❌ Server failed to start within timeout"
        echo ""
        echo "Server log output:"
        cat "$LOG_FILE" || true
        exit 1
    fi

    BASE_URL="http://localhost:$TEST_PORT"
    echo "✅ Server running at $BASE_URL"
fi

echo ""

# Run tests based on argument
TEST_TYPE=${1:-all}

case $TEST_TYPE in
  api)
    echo "Running API tests..."
    echo ""
    
    # Test config endpoint
    echo "Testing /api/config..."
    curl -s "$BASE_URL/api/config" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); const agents=d.config?.agents||{}; console.log('  Config loaded:', Object.keys(agents).length, 'agents')" || echo "  ❌ Failed"
    
    # Test agents endpoint
    echo "Testing /api/agents..."
    curl -s "$BASE_URL/api/agents" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log('  Agents loaded:', d.total, 'agents')" || echo "  ❌ Failed"
    
    # Test profiles endpoint
    echo "Testing /api/profiles..."
    curl -s "$BASE_URL/api/profiles" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log('  Profiles loaded:', d.total, 'profiles')" || echo "  ❌ Failed"
    
    # Test models endpoint
    echo "Testing /api/models..."
    curl -s "$BASE_URL/api/models" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log('  Models loaded:', d.total, 'models')" || echo "  ❌ Failed"
    
    # Run Node.js requirements tests
    echo ""
    echo "Running requirements tests..."
    node tests/requirements-test.js || { echo "  ❌ Requirements tests failed"; exit 1; }
    
    echo ""
    echo "✅ API tests complete"
    ;;
    
  ui)
    echo "Running UI tests..."
    echo ""
    npx playwright test tests/ui.spec.js --headed
    echo ""
    echo "✅ UI tests complete"
    echo "Screenshots saved in test-results/"
    ;;
    
  install)
    run_install_tests
    ;;
    
  drift)
    echo "=== Drift Check ==="
    echo ""
    node scripts/drift-check.js || true
    echo ""
    echo "✅ Drift check complete"
    ;;
    
  all|*)
    echo "Running all tests..."
    echo ""
    
    run_install_tests || exit 1
    
    # Drift check (non-blocking, dev-only)
    echo ""
    echo "=== Drift Check ==="
    node scripts/drift-check.js || true
    echo ""
    
    # API tests
    echo ""
    echo "=== API Tests ==="
    curl -s "$BASE_URL/api/config" > /dev/null && echo "✅ Config API" || echo "❌ Config API"
    curl -s "$BASE_URL/api/agents" > /dev/null && echo "✅ Agents API" || echo "❌ Agents API"
    curl -s "$BASE_URL/api/profiles" > /dev/null && echo "✅ Profiles API" || echo "❌ Profiles API"
    curl -s "$BASE_URL/api/models" > /dev/null && echo "✅ Models API" || echo "❌ Models API"

    # Requirements tests
    echo ""
    echo "=== Requirements Tests ==="
    node tests/requirements-test.js || { echo "❌ Requirements tests failed"; exit 1; }

    echo ""
    echo "=== UI Tests ==="
    npx playwright test tests/ui.spec.js
    
    echo ""
    echo "✅ All tests complete"
    ;;
esac

echo ""
echo "=================================="
echo "Test Results:"
echo "=================================="

# Show summary
curl -s "$BASE_URL/api/config" 2>/dev/null | node -e "
const d = JSON.parse(require('fs').readFileSync(0));
const agents = d.config?.agents || {};
console.log('Active Profile:', Object.keys(agents).length, 'agents configured');
" || true

curl -s "$BASE_URL/api/models" 2>/dev/null | node -e "
const d = JSON.parse(require('fs').readFileSync(0));
const providers = d.providers || [];
console.log('Available Models:', d.total, 'from', providers.length, 'providers');
if (d.hasDuplicates) {
    console.log('Duplicate Models:', d.duplicateCount, 'models on multiple providers');
}
" || true

echo ""
