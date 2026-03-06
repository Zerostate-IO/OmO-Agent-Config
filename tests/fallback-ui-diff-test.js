/**
 * Fallback UI Diff Tests
 * 
 * Tests for  fallback_models normalization logic in isolation
 */

const assert = require('assert');

// Import from core module instead of
const { normalizeFallbackModels, calculateFallbackDiff } = require('../lib/core/fallback-models');
const { getModelDisplay } = require('../lib/web/app.js');

// ========================================
// Test normalizeFallbackModels
// ========================================
console.log('Testing normalizeFallbackModels...');

// Test: normalizeFallbackModels with null input
{
    const result = normalizeFallbackModels(null);
    assert.deepStrictEqual(result, []);
}

// Test: normalizeFallbackModels with undefined input
{
    const result = normalizeFallbackModels(undefined);
    assert.deepStrictEqual(result, []);
}

// Test: normalizeFallbackModels with empty string
{
    const result = normalizeFallbackModels('');
    assert.deepStrictEqual(result, []);
}

// Test: normalizeFallbackModels with whitespace only string
{
    const result = normalizeFallbackModels('  openai/gpt-4  ');
    assert.deepStrictEqual(result, []);
}

// Test: normalizeFallbackModels - deduplication
{
    const result = normalizeFallbackModels(['openai/gpt-4', 'google/gemini-pro', 'openai/gpt-4']);
    assert.deepStrictEqual(result, ['openai/gpt-4', 'google/gemini-pro']);
}

console.log('normalizeFallbackModels: PASS');

// ========================================
// Test calculateFallbackDiff
// ========================================
console.log('Testing calculateFallbackDiff...');

// Test: fallback order changes
{
    const oldFallback = ['c/d', 'e/f'];
    const newFallback = ['e/f', 'c/d']
    const result = calculateFallbackDiff(oldFallback, newFallback)
    assert.strictEqual(result.reordered, true);
    assert.deepStrictEqual(result.added, []);
    assert.deepStrictEqual(result.removed, [])
    assert.strictEqual(result.hasChanges, true)
}

// Test: fallback added (multiple items)
{
    const oldFallback = ['c/d'];
    const newFallback = ['c/d', 'e/f', 'f/g']
    const result = calculateFallbackDiff(oldFallback, newFallback)
    assert.strictEqual(result.reordered, false)
    assert.deepStrictEqual(result.added, ['e/f', 'f/g'])
    assert.deepStrictEqual(result.removed, [])
    assert.strictEqual(result.hasChanges, true)
}

// Test: fallback removed (multiple items)
{
    const oldFallback = ['c/d', 'e/f', 'f/g']
    const newFallback = ['c/d']
    const result = calculateFallbackDiff(oldFallback, newFallback)
    assert.strictEqual(result.reordered, false)
    assert.deepStrictEqual(result.added, [])
    assert.deepStrictEqual(result.removed, ['e/f', 'f/g'])
    assert.strictEqual(result.hasChanges, true)
}

// Test: fallback added and removed (mixed)
{
    const oldFallback = ['c/d', 'e/f']
    const newFallback = ['e/f', 'f/g']
    const result = calculateFallbackDiff(oldFallback, newFallback)
    assert.strictEqual(result.reordered, false)
    assert.deepStrictEqual(result.added, ['f/g'])
    assert.deepStrictEqual(result.removed, ['c/d'])
    assert.strictEqual(result.hasChanges, true)
}

// Test: empty arrays
{
    const result = calculateFallbackDiff([], [])
    assert.strictEqual(result.reordered, false)
    assert.deepStrictEqual(result.added, [])
    assert.deepStrictEqual(result.removed, [])
    assert.strictEqual(result.hasChanges, false)
}

// Test: null inputs
{
    const result = calculateFallbackDiff(null, null)
    assert.strictEqual(result.reordered, false)
    assert.deepStrictEqual(result.added, [])
    assert.deepStrictEqual(result.removed, [])
    assert.strictEqual(result.hasChanges, false)
}

console.log('calculateFallbackDiff: PASS')

// ========================================
// Test calculateDiff with fallback changes
// ========================================
console.log('Testing calculateDiff with fallback changes...')

// Test: model changed with fallback change
{
    const current = {
        oracle: { model: 'a/b', fallback_models: ['c/d', 'e/f'] }
    };
    const newAssignments = {
        oracle: { model: 'x/y', fallback_models: ['e/f', 'c/d'] }
    };
    const diff = calculateDiff(current, newAssignments)
    assert.strictEqual(diff.length, 1)
    assert.strictEqual(diff[0].type, 'changed')
    assert.strictEqual(diff[0].agent, 'oracle')
    assert.strictEqual(diff[0].from, 'a/b')
    assert.strictEqual(diff[0].to, 'x/y')
    assert.ok(diff[0].fallbackDiff)
    assert.strictEqual(diff[0].fallbackDiff.reordered, true)
    assert.deepStrictEqual(diff[0].fallbackDiff.added, [])
    assert.deepStrictEqual(diff[0].fallbackDiff.removed, [])
}

// Test: model unchanged but fallback change only
{
    const current = {
        oracle: { model: 'a/b', fallback_models: ['c/d', 'e/f'] }
    };
    const newAssignments = {
        oracle: { model: 'a/b', fallback_models: ['e/f', 'c/d'] }
    };
    const diff = calculateDiff(current, newAssignments)
    assert.strictEqual(diff.length, 1)
    assert.strictEqual(diff[0].type, 'fallback_changed')
    assert.strictEqual(diff[0].agent, 'oracle')
    assert.strictEqual(diff[0].model, 'a/b')
    assert.ok(diff[0].fallbackDiff)
    assert.strictEqual(diff[0].fallbackDiff.reordered, true)
}

// Test: model added with fallback
{
    const current = {}
    const newAssignments = {
        oracle: { model: 'a/b', fallback_models: ['c/d', 'e/f'] }
    };
    const diff = calculateDiff(current, newAssignments)
    assert.strictEqual(diff.length, 1)
    assert.strictEqual(diff[0].type, 'added')
    assert.strictEqual(diff[0].agent, 'oracle')
    assert.strictEqual(diff[0].to, 'a/b')
    assert.ok(diff[0].fallbackDiff)
    assert.deepStrictEqual(diff[0].fallbackDiff.added, ['c/d', 'e/f'])
}

// Test: model removed with fallback
{
    const current = {
        oracle: { model: 'a/b', fallback_models: ['c/d', 'e/f'] }
    };
    const newAssignments = {}
    const diff = calculateDiff(current, newAssignments)
    assert.strictEqual(diff.length, 1)
    assert.strictEqual(diff[0].type, 'removed')
    assert.strictEqual(diff[0].agent, 'oracle')
    assert.strictEqual(diff[0].from, 'a/b')
    assert.ok(!diff[0].fallbackDiff.hasChanges)
}

console.log('calculateDiff with fallback changes: PASS')

// ========================================
// Test getPendingModelChanges
// ========================================
console.log('Testing getPendingModelChanges...')

// Mock state
const oldState = {
    savedConfig: {
        agents: {
            oracle: { model: 'a/b', fallback_models: ['c/d', 'e/f'] }
        }
    }
};
const newState = {
    currentConfig: {
        agents: {
            oracle: { model: 'a/b', fallback_models: ['e/f', 'c/d'] }
        }
    }
};
state.savedConfig = oldState.savedConfig;
state.currentConfig = newState.currentConfig;

    const changes = getPendingModelChanges()
    
    assert.ok(changes)
    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0].type, 'fallback_changed')
    assert.strictEqual(changes[0].agent, 'oracle')
    assert.ok(changes[0].fallbackDiff)
    assert.strictEqual(changes[0].fallbackDiff.reordered, true)
    assert.deepStrictEqual(changes[0].fallbackDiff.added, [])
    assert.deepStrictEqual(changes[0].fallbackDiff.removed, ['c/d'])

console.log('getPendingModelChanges: PASS')

console.log('\nAll tests passed!');
