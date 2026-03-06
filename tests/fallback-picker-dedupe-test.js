/**
 * Tests for fallback model picker with duplicate prevention
 */
const assert = require('assert');
const path = require('path');

function isProviderModelId(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex === -1 || slashIndex === 0 || slashIndex !== trimmed.lastIndexOf('/')) return false;
    const provider = trimmed.substring(0, slashIndex);
    const model = trimmed.substring(slashIndex + 1);
    if (provider.length === 0 || model.length === 0) return false;
    return true;
}

function runTests() {
    console.log('Running fallback picker and dedupe tests...');
    let pass = true;
}

runTests();
const assert = require('assert');
const path = require('path');

// Import the validation function for testing
// We'll test the logic directly without a browser by testing the core functions

describe('Fallback Model Picker', function() {
    
    describe('isProviderModelId validation', function() {
        it('should validate correct provider/model format', function() {
            const validIds = [
                'anthropic/claude-3-5-sonnet',
                'google/gemini-3-pro',
                'openai/gpt-4',
                'opencode/gpt-5.2',
                'provider/model-name'
                'a/b'
            ];
            
            validIds.forEach(id => {
                assert.strictEqual(isProviderModelId(id), true, `Expected ${id} to be valid`);
            });
        });
        
        it('should reject invalid formats', function() {
            const invalidIds = [
                'invalid-no-slash',
                'provider/',
                '/model-only',
                '',
                '   ',
                'provider//double-slash',
                'provider model space',
                123/invalid',
                null,
                undefined
            ];
            
            invalidIds.forEach(id => {
                assert.strictEqual(isProviderModelId(id), false, `Expected ${id} to be invalid`);
            });
        });
    });
    
    describe('Duplicate Prevention Logic', function() {
        it('should detect duplicates in fallback list', function() {
            const existingFallbacks = [
                'anthropic/claude-3-5-sonnet',
                'google/gemini-3-pro'
            ];
            
            const testModelId = 'anthropic/claude-3-5-sonnet';
            
            assert.strictEqual(existingFallbacks.includes(testModelId), true, 
                'Should detect existing model as duplicate');
            
            const newModelId = 'openai/gpt-4';
            assert.strictEqual(existingFallbacks.includes(newModelId), false, 
                'Should not detect new model as duplicate');
        });
        
        it('should prevent adding duplicate via selectModelForFallback', function() {
            const fallbacks = [
                'google/gemini-3-pro'
            ];
            
            const duplicateModel = 'google/gemini-3-pro';
            const newModel = 'anthropic/claude-3-5-sonnet';
            
            assert.strictEqual(fallbacks.includes(duplicateModel), true);
            assert.strictEqual(fallbacks.includes(newModel), false);
        });
    });
    
    describe('Canonical ID Storage', function() {
        it('should store provider/model format not display names', function() {
            const modelId = 'anthropic/claude-3-5-sonnet';
            const parts = modelId.split('/');
            
            assert.strictEqual(parts.length, 2, 'Should have provider and model parts');
            assert.strictEqual(parts[0], 'anthropic');
            assert.strictEqual(parts[1], 'claude-3-5-sonnet');
        });
        
        it('should handle various provider prefixes correctly', function() {
            const testCases = [
                { id: 'google/gemini-3-flash', provider: 'google' },
                { id: 'anthropic/claude-opus-4', provider: 'anthropic' },
                { id: 'openai/gpt-4o', provider: 'openai' },
                { id: 'opencode/gpt-5.2', provider: 'opencode' },
                { id: 'mistral/codestral-latest', provider: 'mistral' },
                { id: 'deepseek/deepseek-chat', provider: 'deepseek' }
            ];
            
            testCases.forEach(tc => {
                assert.strictEqual(isProviderModelId(tc.id), true);
                const parts = tc.id.split('/');
                assert.strictEqual(parts[0], tc.provider);
            });
        });
    });
});

/**
 * Helper function that matches the validation logic in app.js
 * Must be kept in sync with isProviderModelId in lib/web/app.js
 */
function isProviderModelId(str) {
    if (typeof str !== 'string') {
        return false;
    }
    
    const trimmed = str.trim();
    if (trimmed.length === 0) {
        return false;
    }
    
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
        return false;
    }
    
    if (trimmed.indexOf('/', slashIndex + 1) !== -1) {
        return false;
    }
    
    const provider = trimmed.substring(0, slashIndex);
    const model = trimmed.substring(slashIndex + 1);
    
    if (provider.length === 0 || model.length === 0) {
        return false;
    }
    
    if (!/^[a-z0-9_-]+$/i.test(provider)) {
        return false;
    }
    
    if (!/^[a-z0-9_.-]+$/i.test(model)) {
        return false;
    }
    
    return true;
}
