#!/usr/bin/env node

/**
 * API contract tests for fallback override endpoints.
 * Tests the following endpoints:
 * - GET /api/agents/:name/fallbacks
 * - PUT /api/agents/:name/fallbacks
 * - DELETE /api/agents/:name/fallbacks
 *
 * These tests are designed to FAIL initially (endpoints not yet implemented).
 * They define the exact contract that Task 4 must implement.
 *
 * Usage: node tests/fallback-api-test.js <base_url>
 * Example: node tests/fallback-api-test.js http://localhost:3456
 */

const http = require('http');
const assert = require('assert');

// Parse command line arguments
const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node tests/fallback-api-test.js <base_url>');
  console.error('Example: node tests/fallback-api-test.js http://localhost:3456');
  process.exit(1);
}

const url = new URL(baseUrl);
const baseHost = url.hostname;
const basePort = url.port || 80;

/**
 * Make HTTP request helper
 */
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseHost,
      port: basePort,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Test suite
 */
async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('=== Fallback Override API Contract Tests ===\n');

  // Test 1: GET /api/agents/:name/fallbacks - valid agent
  console.log('Test 1: GET /api/agents/sisyphus/fallbacks (valid agent)');
  try {
    const res = await makeRequest('GET', '/api/agents/sisyphus/fallbacks');
    
    // Expect 200 OK
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    
    // Validate response structure
    assert.ok(res.body, 'Response body should exist');
    assert.strictEqual(res.body.agent, 'sisyphus', 'Response should have agent name');
    assert.ok(['override', 'upstream'].includes(res.body.source), 'Source should be override or upstream');
    assert.ok(Array.isArray(res.body.fallbackChain), 'fallbackChain should be array');
    
    // Validate fallbackChain entry structure
    if (res.body.fallbackChain.length > 0) {
      const entry = res.body.fallbackChain[0];
      assert.ok(Array.isArray(entry.providers), 'Entry should have providers array');
      assert.ok(entry.providers.length > 0, 'Providers array should not be empty');
      assert.ok(entry.model, 'Entry should have model');
    }
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 2: GET /api/agents/:name/fallbacks - unknown agent
  console.log('Test 2: GET /api/agents/unknown-agent-xyz/fallbacks (unknown agent)');
  try {
    const res = await makeRequest('GET', '/api/agents/unknown-agent-xyz/fallbacks');
    
    // Expect 404 Not Found
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 3: PUT /api/agents/:name/fallbacks - valid payload
  console.log('Test 3: PUT /api/agents/sisyphus/fallbacks (valid payload)');
  try {
    const payload = {
      fallbackChain: [
        {
          providers: ['anthropic'],
          model: 'claude-opus-4-6',
          variant: 'max'
        }
      ]
    };
    
    const res = await makeRequest('PUT', '/api/agents/sisyphus/fallbacks', payload);
    
    // Expect 200 OK
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    
    // Validate response structure
    assert.ok(res.body, 'Response body should exist');
    assert.strictEqual(res.body.agent, 'sisyphus', 'Response should have agent name');
    assert.strictEqual(res.body.source, 'override', 'Source should be override after PUT');
    assert.ok(Array.isArray(res.body.fallbackChain), 'fallbackChain should be array');
    assert.strictEqual(res.body.fallbackChain.length, 1, 'Should have 1 entry');
    
    // Verify the entry matches what we sent
    const entry = res.body.fallbackChain[0];
    assert.deepStrictEqual(entry.providers, ['anthropic'], 'Providers should match');
    assert.strictEqual(entry.model, 'claude-opus-4-6', 'Model should match');
    assert.strictEqual(entry.variant, 'max', 'Variant should match');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 4: PUT /api/agents/:name/fallbacks - invalid payload (missing providers)
  console.log('Test 4: PUT /api/agents/sisyphus/fallbacks (invalid: missing providers)');
  try {
    const payload = {
      fallbackChain: [
        {
          model: 'claude-opus-4-6'
          // missing providers
        }
      ]
    };
    
    const res = await makeRequest('PUT', '/api/agents/sisyphus/fallbacks', payload);
    
    // Expect 400 Bad Request
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 5: PUT /api/agents/:name/fallbacks - invalid payload (empty providers)
  console.log('Test 5: PUT /api/agents/sisyphus/fallbacks (invalid: empty providers)');
  try {
    const payload = {
      fallbackChain: [
        {
          providers: [],
          model: 'claude-opus-4-6'
        }
      ]
    };
    
    const res = await makeRequest('PUT', '/api/agents/sisyphus/fallbacks', payload);
    
    // Expect 400 Bad Request
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 6: PUT /api/agents/:name/fallbacks - invalid payload (missing model)
  console.log('Test 6: PUT /api/agents/sisyphus/fallbacks (invalid: missing model)');
  try {
    const payload = {
      fallbackChain: [
        {
          providers: ['anthropic']
          // missing model
        }
      ]
    };
    
    const res = await makeRequest('PUT', '/api/agents/sisyphus/fallbacks', payload);
    
    // Expect 400 Bad Request
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 7: PUT /api/agents/:name/fallbacks - unknown agent
  console.log('Test 7: PUT /api/agents/unknown-agent-xyz/fallbacks (unknown agent)');
  try {
    const payload = {
      fallbackChain: [
        {
          providers: ['anthropic'],
          model: 'claude-opus-4-6'
        }
      ]
    };
    
    const res = await makeRequest('PUT', '/api/agents/unknown-agent-xyz/fallbacks', payload);
    
    // Expect 404 Not Found
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 8: DELETE /api/agents/:name/fallbacks - valid agent
  console.log('Test 8: DELETE /api/agents/sisyphus/fallbacks (valid agent)');
  try {
    const res = await makeRequest('DELETE', '/api/agents/sisyphus/fallbacks');
    
    // Expect 200 OK
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    
    // Validate response structure
    assert.ok(res.body, 'Response body should exist');
    assert.strictEqual(res.body.agent, 'sisyphus', 'Response should have agent name');
    assert.strictEqual(res.body.source, 'upstream', 'Source should be upstream after DELETE (reset)');
    assert.ok(Array.isArray(res.body.fallbackChain), 'fallbackChain should be array');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 9: DELETE /api/agents/:name/fallbacks - unknown agent
  console.log('Test 9: DELETE /api/agents/unknown-agent-xyz/fallbacks (unknown agent)');
  try {
    const res = await makeRequest('DELETE', '/api/agents/unknown-agent-xyz/fallbacks');
    
    // Expect 404 Not Found
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.ok(res.body.error, 'Response should have error message');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 10: Verify PUT persists and GET retrieves
  console.log('Test 10: Roundtrip - PUT then GET (persistence verification)');
  try {
    const payload = {
      fallbackChain: [
        {
          providers: ['google'],
          model: 'gemini-3-pro',
          variant: 'high'
        },
        {
          providers: ['anthropic'],
          model: 'claude-opus-4-6'
        }
      ]
    };
    
    // PUT the data
    const putRes = await makeRequest('PUT', '/api/agents/oracle/fallbacks', payload);
    assert.strictEqual(putRes.status, 200, `PUT expected 200, got ${putRes.status}`);
    
    // GET it back
    const getRes = await makeRequest('GET', '/api/agents/oracle/fallbacks');
    assert.strictEqual(getRes.status, 200, `GET expected 200, got ${getRes.status}`);
    
    // Verify it matches
    assert.strictEqual(getRes.body.agent, 'oracle', 'Agent should be oracle');
    assert.strictEqual(getRes.body.source, 'override', 'Source should be override');
    assert.strictEqual(getRes.body.fallbackChain.length, 2, 'Should have 2 entries');
    
    // Verify first entry
    const entry1 = getRes.body.fallbackChain[0];
    assert.deepStrictEqual(entry1.providers, ['google'], 'First entry providers should match');
    assert.strictEqual(entry1.model, 'gemini-3-pro', 'First entry model should match');
    assert.strictEqual(entry1.variant, 'high', 'First entry variant should match');
    
    // Verify second entry
    const entry2 = getRes.body.fallbackChain[1];
    assert.deepStrictEqual(entry2.providers, ['anthropic'], 'Second entry providers should match');
    assert.strictEqual(entry2.model, 'claude-opus-4-6', 'Second entry model should match');
    
    console.log('  ✓ PASS\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. This is expected - endpoints not yet implemented.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
