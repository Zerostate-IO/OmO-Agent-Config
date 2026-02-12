#!/bin/bash

# Test runner for OmO Agent Config
# Usage: ./run-tests.sh [api|ui|all]

set -e

echo "=================================="
echo "OmO Agent Config - Test Suite"
echo "=================================="
echo ""

# Ensure server is running
if ! curl -s http://localhost:3456/api/config > /dev/null 2>&1; then
    echo "Starting server..."
    OMO_NO_OPEN=1 CI=true node bin/opencode-agent-config > /tmp/omo-test-server.log 2>&1 &
    sleep 3
fi

# Check server is up
if ! curl -s http://localhost:3456/api/config > /dev/null 2>&1; then
    echo "❌ Server failed to start"
    exit 1
fi

echo "✅ Server running at http://localhost:3456"
echo ""

# Run tests based on argument
TEST_TYPE=${1:-all}

case $TEST_TYPE in
  api)
    echo "Running API tests..."
    echo ""
    
    # Test config endpoint
    echo "Testing /api/config..."
    curl -s http://localhost:3456/api/config | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Config loaded: {len(d.get(\"config\", {}).get(\"agents\", {}))} agents')" || echo "  ❌ Failed"
    
    # Test agents endpoint
    echo "Testing /api/agents..."
    curl -s http://localhost:3456/api/agents | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Agents loaded: {d.get(\"total\", 0)} agents')" || echo "  ❌ Failed"
    
    # Test profiles endpoint
    echo "Testing /api/profiles..."
    curl -s http://localhost:3456/api/profiles | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Profiles loaded: {d.get(\"total\", 0)} profiles')" || echo "  ❌ Failed"
    
    # Test models endpoint
    echo "Testing /api/models..."
    curl -s http://localhost:3456/api/models | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Models loaded: {d.get(\"total\", 0)} models')" || echo "  ❌ Failed"
    
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
    
  all|*)
    echo "Running all tests..."
    echo ""
    
    # API tests
    echo "=== API Tests ==="
    curl -s http://localhost:3456/api/config > /dev/null && echo "✅ Config API" || echo "❌ Config API"
    curl -s http://localhost:3456/api/agents > /dev/null && echo "✅ Agents API" || echo "❌ Agents API"
    curl -s http://localhost:3456/api/profiles > /dev/null && echo "✅ Profiles API" || echo "❌ Profiles API"
    curl -s http://localhost:3456/api/models > /dev/null && echo "✅ Models API" || echo "❌ Models API"
    
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
curl -s http://localhost:3456/api/config 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    agents = len(d.get('config', {}).get('agents', {}))
    print(f'Active Profile: {agents} agents configured')
except:
    pass
" || true

curl -s http://localhost:3456/api/models 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'Available Models: {d.get(\"total\", 0)} from {len(d.get(\"providers\", []))} providers')
    if d.get('hasDuplicates'):
        print(f'Duplicate Models: {d.get(\"duplicateCount\", 0)} models on multiple providers')
except:
    pass
" || true

echo ""
