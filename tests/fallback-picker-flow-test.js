/**
 * Test for fallback model picker modal flow
 * Verifies that selecting a model returns to the fallback editor
 */
const assert = require('assert');

function runTests() {
    console.log('Running fallback picker modal flow tests...\n');
    
    // Test 1: selectModelForFallback should close modal and reopen editor
    console.log('Test 1: Modal flow after selecting model');
    
    let modalClosed = false;
    let editorReopened = false;
    let reopenAgentName = null;
    let reopenOptions = null;
    let lastStatusMsg = '';
    let lastStatusType = '';
    
    // Mock setTimeout to execute immediately
    const originalSetTimeout = setTimeout;
    global.setTimeout = function(fn, delay) {
        fn(); // Execute immediately
    };
    
    // Mock state
    global.state = {
        fallbackEditorState: {
            agentName: 'sisyphus',
            fallbacks: ['anthropic/claude-sonnet-4'],
            originalFallbacks: ['anthropic/claude-sonnet-4']
        }
    };
    
    // Mock isProviderModelId
    function isProviderModelId(str) {
        if (typeof str !== 'string') return false;
        const trimmed = str.trim();
        if (trimmed.length === 0) return false;
        const slashIndex = trimmed.indexOf('/');
        if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return false;
        const provider = trimmed.substring(0, slashIndex);
        const providerPattern = /^[-a-z0-9_.]+$/i;
        if (!providerPattern.test(provider)) return false;
        const model = trimmed.substring(slashIndex + 1);
        const modelPattern = /^[-a-z0-9_.:/]+$/i;
        return modelPattern.test(model);
    }
    
    // Mock functions
    global.closeModal = function() {
        modalClosed = true;
    };
    
    global.openFallbackEditor = function(agentName, options) {
        editorReopened = true;
        reopenAgentName = agentName;
        reopenOptions = options || null;
    };
    
    global.updateStatus = function(msg, type) {
        lastStatusMsg = msg;
        lastStatusType = type;
    };
    
    // The function we're testing (copied from app.js)
    function selectModelForFallback(modelId) {
        if (!global.state.fallbackEditorState) {
            global.updateStatus('Fallback editor not initialized', 'error');
            return;
        }
        
        if (!isProviderModelId(modelId)) {
            global.updateStatus('Invalid model ID format: ' + modelId, 'error');
            return;
        }
        
        if (global.state.fallbackEditorState.fallbacks.includes(modelId)) {
            global.updateStatus('Model already in fallback list: ' + modelId, 'info');
            return;
        }
        
        global.state.fallbackEditorState.fallbacks.push(modelId);
        const restoreState = {
            fallbacks: [...global.state.fallbackEditorState.fallbacks],
            originalFallbacks: [...global.state.fallbackEditorState.originalFallbacks]
        };
        
        global.updateStatus('Added ' + modelId + ' to fallback list', 'success');
        
        // Close the model picker modal
        global.closeModal();
        
        // Re-open the fallback editor to show the updated list
        // Use setTimeout to avoid modal close/open animation conflicts
        setTimeout(() => {
            global.openFallbackEditor(global.state.fallbackEditorState.agentName, { restoreState: restoreState });
        }, 50);
    }
    
    // Execute test
    selectModelForFallback('openai/gpt-5');
    
    assert.strictEqual(modalClosed, true, 'Modal should be closed');
    assert.strictEqual(editorReopened, true, 'Fallback editor should be reopened');
    assert.strictEqual(reopenAgentName, 'sisyphus', 'Should reopen editor for correct agent');
    assert.ok(reopenOptions && reopenOptions.restoreState, 'Reopen should preserve in-memory fallback state');
    assert.deepStrictEqual(
        reopenOptions.restoreState.fallbacks,
        ['anthropic/claude-sonnet-4', 'openai/gpt-5'],
        'Reopen state should include newly added fallback'
    );
    assert.strictEqual(global.state.fallbackEditorState.fallbacks.length, 2, 'Should have 2 fallbacks');
    assert.strictEqual(global.state.fallbackEditorState.fallbacks[1], 'openai/gpt-5', 'Should have added correct model');
    
    console.log('  ✅ Modal closes and reopens fallback editor');
    console.log('  ✅ Model added to fallback list');
    console.log('  ✅ Correct agent name passed to reopened editor\n');
    
    // Test 2: Selecting duplicate should not close modal
    console.log('Test 2: Duplicate model selection');
    
    modalClosed = false;
    editorReopened = false;
    reopenOptions = null;
    lastStatusMsg = '';
    lastStatusType = '';
    
    selectModelForFallback('openai/gpt-5'); // Already added in test 1
    
    assert.strictEqual(modalClosed, false, 'Modal should NOT close for duplicate');
    assert.strictEqual(editorReopened, false, 'Editor should NOT reopen for duplicate');
    assert.strictEqual(lastStatusType, 'info', 'Should show info status');
    assert.ok(lastStatusMsg.includes('already in fallback list'), 'Should mention duplicate: ' + lastStatusMsg);
    
    console.log('  ✅ Duplicate selection prevented');
    console.log('  ✅ Modal stays open');
    console.log('  ✅ User informed: ' + lastStatusMsg + '\n');
    
    // Test 3: Invalid model ID should not close modal
    console.log('Test 3: Invalid model ID format');
    
    modalClosed = false;
    editorReopened = false;
    reopenOptions = null;
    lastStatusMsg = '';
    lastStatusType = '';
    
    selectModelForFallback('invalid-no-slash');
    
    assert.strictEqual(modalClosed, false, 'Modal should NOT close for invalid ID');
    assert.strictEqual(editorReopened, false, 'Editor should NOT reopen for invalid ID');
    assert.strictEqual(lastStatusType, 'error', 'Should show error status');
    assert.ok(lastStatusMsg.includes('Invalid model ID'), 'Should mention invalid format: ' + lastStatusMsg);
    
    console.log('  ✅ Invalid format rejected');
    console.log('  ✅ Modal stays open');
    console.log('  ✅ User informed: ' + lastStatusMsg + '\n');

    console.log('Test 4: Nested Fireworks model ID');

    modalClosed = false;
    editorReopened = false;
    reopenOptions = null;
    lastStatusMsg = '';
    lastStatusType = '';

    selectModelForFallback('fireworks-ai/accounts/fireworks/models/deepseek-v3p1');

    assert.strictEqual(modalClosed, true, 'Modal should close for valid nested Fireworks ID');
    assert.strictEqual(editorReopened, true, 'Editor should reopen for valid nested Fireworks ID');
    assert.strictEqual(lastStatusType, 'success', 'Nested Fireworks ID should be accepted');
    assert.ok(
        reopenOptions && reopenOptions.restoreState && reopenOptions.restoreState.fallbacks.includes('fireworks-ai/accounts/fireworks/models/deepseek-v3p1'),
        'Reopen state should preserve nested Fireworks fallback ID'
    );

    console.log('  ✅ Nested Fireworks fallback accepted');
    console.log('  ✅ Nested fallback preserved across modal reopen\n');
    
    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
    
    console.log('✅ All fallback picker modal flow tests passed!\n');
}

runTests();
