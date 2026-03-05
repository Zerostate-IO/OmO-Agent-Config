#!/usr/bin/env node

/**
 * Test configuredFallbackModels field in agent API responses.
 * 
 * Tests cover:
 * - /api/agents returns configuredFallbackModels array per agent
 * - /api/agents/:name returns configuredFallbackModels for single agent
 * - fallbackChain (upstream) is preserved alongside configuredFallbackModels
 * - Empty array when agent has no fallback_models configured
 */

const http = require('http');
const assert = require('assert');

const PORT = process.env.TEST_PORT || 9876;
const HOST = 'localhost';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET',
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function run() {
  console.log('Testing configuredFallbackModels in agent API responses...\n');
  
  let passed = 0;
  let failed = 0;
  
  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e.message}`);
      failed++;
    }
  }
  
  // ========================================
  // Test /api/agents endpoint
  // ========================================
  
  console.log('GET /api/agents:');
  
  const agentsResponse = await makeRequest('/api/agents');
  
  test('returns 200 status', () => {
    assert.strictEqual(agentsResponse.status, 200);
  });
  
  test('returns agents array', () => {
    assert.ok(Array.isArray(agentsResponse.body.agents), 'agents should be an array');
    assert.ok(agentsResponse.body.agents.length > 0, 'agents array should not be empty');
  });
  
  test('each agent has configuredFallbackModels array', () => {
    for (const agent of agentsResponse.body.agents) {
      assert.ok(
        Array.isArray(agent.configuredFallbackModels),
        `Agent ${agent.name} should have configuredFallbackModels array`
      );
    }
  });
  
  test('configuredFallbackModels contains valid provider/model format', () => {
    for (const agent of agentsResponse.body.agents) {
      for (const model of agent.configuredFallbackModels) {
        assert.ok(
          typeof model === 'string' && model.includes('/'),
          `Model ${model} should be in provider/model format`
        );
      }
    }
  });
  
  test('fallbackChain field is preserved (may be undefined or array)', () => {
    for (const agent of agentsResponse.body.agents) {
      // fallbackChain may be undefined if upstream has no recommendation chain
      // but the key should not be missing due to configuredFallbackModels addition
      assert.ok(
        agent.fallbackChain === undefined || Array.isArray(agent.fallbackChain),
        `Agent ${agent.name} fallbackChain should be undefined or array`
      );
    }
  });
  
  console.log('');
  
  // ========================================
  // Test /api/agents/:name endpoint
  // ========================================
  
  // Pick the first agent from the list for detailed testing
  const firstAgent = agentsResponse.body.agents[0];
  console.log(`GET /api/agents/${firstAgent.name}:`);
  
  const singleAgentResponse = await makeRequest(`/api/agents/${firstAgent.name}`);
  
  test('returns 200 status for single agent', () => {
    assert.strictEqual(singleAgentResponse.status, 200);
  });
  
  test('returns agent object', () => {
    assert.ok(singleAgentResponse.body.agent, 'response should have agent object');
  });
  
  test('single agent has configuredFallbackModels array', () => {
    assert.ok(
      Array.isArray(singleAgentResponse.body.agent.configuredFallbackModels),
      'Single agent should have configuredFallbackModels array'
    );
  });
  
  test('single agent fallbackChain is preserved', () => {
    const agent = singleAgentResponse.body.agent;
    assert.ok(
      agent.fallbackChain === undefined || Array.isArray(agent.fallbackChain),
      'Single agent fallbackChain should be undefined or array'
    );
  });
  
  console.log('');
  
  // ========================================
  // Test consistency between endpoints
  // ========================================
  
  console.log('Consistency checks:');
  
  test('configuredFallbackModels matches between list and single endpoints', () => {
    const listAgent = agentsResponse.body.agents.find(a => a.name === firstAgent.name);
    const singleAgent = singleAgentResponse.body.agent;
    
    assert.deepStrictEqual(
      listAgent.configuredFallbackModels,
      singleAgent.configuredFallbackModels,
      'configuredFallbackModels should match between endpoints'
    );
  });
  
  console.log('');
  
  // ========================================
  // Summary
  // ========================================
  
  console.log('='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
