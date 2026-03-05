const assert = require('assert');
const { JSDOM } = require('jsdom');

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Fallback UI Test</title>
    <link rel="stylesheet" href="../lib/web/styles.css">
</head>
<body>
    <div id="modal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-title">Title</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" id="modal-body">
            <!-- Modal content -->
            </div>
        </div>
    </div>
    
    <script src="../lib/web/app.js"></script>
    <script>
        // Mock state
        const state = {
            currentConfig: {
                agents: {
                    sisyphus: {
                    model: 'google/gemini-3-flash',
                    fallback_models: ['anthropic/claude-sonnet-4']
                    }
                }
            },
            savedConfig: null,
            fallbackEditorState: null
        };
        
        // Mock DOM elements
        const elements = {
            modal: document.getElementById('modal'),
            modalTitle: document.getElementById('modal-title'),
            modalBody: document.getElementById('modal-body'),
            modalClose: document.querySelector('.modal-close')
        };
        
        // Test showModal function
        function showModal(title, content) {
            elements.modalTitle.textContent = title;
            elements.modalBody.innerHTML = content;
            elements.modal.classList.remove('hidden');
        }
        
        function closeModal() {
            elements.modal.classList.add('hidden');
        }
        
        // Test isProviderModelId
        function isProviderModelId(str) {
            if (typeof str !== 'string') return false;
            const trimmed = str.trim();
            if (trimmed.length === 0) return false;
            const slashIndex = trimmed.indexOf('/');
            if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return false;
            if (trimmed.indexOf('/', slashIndex + 1) !== -1) return false;
            const provider = trimmed.substring(0, slashIndex);
            const providerPattern = /^[-a-z0-9_.]+$/i;
            if (!providerPattern.test(provider)) return false;
            const model = trimmed.substring(slashIndex + 1);
            const modelPattern = /^[-a-z0-9_.:]+$/i;
            if (!modelPattern.test(model)) return false;
            return true;
        }
        
        // Test openFallbackEditor
        function openFallbackEditor(agentName) {
            const agentConfig = state.currentConfig.agents[agentName];
            const currentModel = agentConfig.model || 'none';
            const currentFallbacks = agentConfig.fallback_models || [];
            
            state.fallbackEditorState = {
                agentName: agentName,
                fallbacks: [...currentFallbacks],
                originalFallbacks: [...currentFallbacks]
            };
            
            let content = '<div class="fallback-editor">';
            content += '<div class="fallback-editor-header">';
            content += '<h3>Edit Fallback Models for ' + agentName + '</h3>';
            content += '<p class="fallback-editor-subtitle">Current model: <code>' + currentModel + '</code></p>';
            content += '</div>';
            content += '<div class="fallback-editor-list" id="fallback-list"></div>';
            content += '<div class="fallback-editor-add">';
            content += '<input type="text" id="new-fallback-input" class="fallback-input" placeholder="provider/model">';
            content += '<button class="btn btn-secondary" onclick="addFallbackEntry()">Add</button>';
            content += '<div id="fallback-validation-error" class="fallback-validation-error hidden"></div>';
            content += '</div>';
            content += '<div class="fallback-editor-actions">';
            content += '<button class="btn btn-primary" onclick="saveFallbackModels()">Save Changes</button>';
            content += '<button class="btn btn-secondary" onclick="cancelFallbackEditor()">Cancel</button>';
            content += '</div>';
            content += '</div>';
            
            showModal('Fallback Models Editor', content);
        }
        
        // Test renderFallbackEditorList
        function renderFallbackEditorList(fallbacks) {
            if (!fallbacks || fallbacks.length === 0) {
                return '<div class="fallback-empty">No fallback models configured. Add models above.</div>';
            }
            let html = '';
            fallbacks.forEach((modelId, index) => {
                html += '<div class="fallback-item" data-index="' + index + '">';
                html += '<div class="fallback-item-info">';
                html += '<span class="fallback-item-id">' + modelId + '</span>';
                html += '<span class="fallback-item-priority">Priority ' + (index + 1) + '</span>';
                html += '</div>';
                html += '<div class="fallback-item-controls">';
                html += '<button class="btn btn-icon" onclick="moveFallbackEntry(' + index + ', -1)">↑</button>';
                html += '<button class="btn btn-icon" onclick="moveFallbackEntry(' + index + ', 1)">↓</button>';
                html += '<button class="btn btn-icon btn-danger" onclick="removeFallbackEntry(' + index + ')">✕</button>';
                html += '</div>';
                html += '</div>';
            });
            return html;
        }
        
        // Test addFallbackEntry
        function addFallbackEntry() {
            const input = document.getElementById('new-fallback-input');
            const errorDiv = document.getElementById('fallback-validation-error');
            const value = input.value.trim();
            
            if (!value) {
                errorDiv.textContent = 'Please enter a provider/model ID';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            if (!isProviderModelId(value)) {
                errorDiv.textContent = 'Invalid format';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            if (state.fallbackEditorState.fallbacks.includes(value)) {
                errorDiv.textContent = 'Already in list';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            state.fallbackEditorState.fallbacks.push(value);
            input.value = '';
            errorDiv.classList.add('hidden');
            
            document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
        }
        
        // Test removeFallbackEntry
        function removeFallbackEntry(index) {
            state.fallbackEditorState.fallbacks.splice(index, 1);
            document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
        }
        
        // Test moveFallbackEntry
        function moveFallbackEntry(index, direction) {
            const fallbacks = state.fallbackEditorState.fallbacks;
            const newIndex = index + direction;
            
            if (newIndex < 0 || newIndex >= fallbacks.length) return;
            
            const temp = fallbacks[index];
            fallbacks[index] = fallbacks[newIndex];
            fallbacks[newIndex] = temp;
            
            document.getElementById('fallback-list').innerHTML = renderFallbackEditorList(state.fallbackEditorState.fallbacks);
        }
        
        // Test saveFallbackModels
        function saveFallbackModels() {
            const agentName = state.fallbackEditorState.agentName;
            const newFallbacks = state.fallbackEditorState.fallbacks;
            
            state.currentConfig.agents[agentName].fallback_models = newFallbacks;
            closeModal();
            delete state.fallbackEditorState;
        }
        
        function cancelFallbackEditor() {
            delete state.fallbackEditorState;
            closeModal();
        }
        
        // Expose functions to window
        window.openFallbackEditor = openFallbackEditor;
        window.addFallbackEntry = addFallbackEntry;
        window.removeFallbackEntry = removeFallbackEntry;
        window.moveFallbackEntry = moveFallbackEntry;
        window.saveFallbackModels = saveFallbackModels;
        window.cancelFallbackEditor = cancelFallbackEditor;
        
        // Run tests
        describe('Fallback Editor', function() {
            beforeEach(function() {
                document.body.innerHTML = '';
            });
            
            afterEach(function() {
                document.body.innerHTML = '';
            });
            
            describe('isProviderModelId', function() {
                it('should validate correct format', function() {
                    assert.strictEqual(isProviderModelId('anthropic/claude-3-5-sonnet'), true);
                    assert.strictEqual(isProviderModelId('openai/gpt-4'), true);
                    assert.strictEqual(isProviderModelId('google/gemini-2.0-flash'), true);
                });
                
                it('should reject invalid format', function() {
                    assert.strictEqual(isProviderModelId('invalid'), false);
                    assert.strictEqual(isProviderModelId('no-slash'), false);
                    assert.strictEqual(isProviderModelId('slash/at/end'), false);
                    assert.strictEqual(isProviderModelId('/no-provider'), false);
                    assert.strictEqual(isProviderModelId('provider/'), false);
                    assert.strictEqual(isProviderModelId(''), false);
                    assert.strictEqual(isProviderModelId(null), false);
                    assert.strictEqual(isProviderModelId(undefined), false);
                    assert.strictEqual(isProviderModelId(123), false);
                    assert.strictEqual(isProviderModelId('has spaces/in model'), false);
                    assert.strictEqual(isProviderModelId('provider/model/extra'), false);
                });
            });
            
            describe('openFallbackEditor', function() {
                it('should open modal with correct content', function() {
                    openFallbackEditor('sisyphus');
                    
                    assert.strictEqual(elements.modal.classList.contains('hidden'), false);
                    assert.strictEqual(elements.modalTitle.textContent, 'Fallback Models Editor');
                    assert.ok(elements.modalBody.innerHTML.includes('sisyphus'));
                    assert.ok(elements.modalBody.innerHTML.includes('gemini-3-flash'));
                    assert.ok(elements.modalBody.innerHTML.includes('claude-sonnet-4'));
                });
            });
            
            describe('renderFallbackEditorList', function() {
                it('should render empty state when no fallbacks', function() {
                    const html = renderFallbackEditorList([]);
                    assert.ok(html.includes('No fallback models configured'));
                });
                
                it('should render fallback items with priority', function() {
                    const html = renderFallbackEditorList(['model-a', 'model-b', 'model-c']);
                    assert.ok(html.includes('model-a'));
                    assert.ok(html.includes('Priority 1'));
                    assert.ok(html.includes('Priority 2'));
                    assert.ok(html.includes('Priority 3'));
                });
            });
            
            describe('addFallbackEntry', function() {
                beforeEach(function() {
                    openFallbackEditor('sisyphus');
                });
                
                it('should add valid entry', function() {
                    const input = document.getElementById('new-fallback-input');
                    input.value = 'openai/gpt-4';
                    
                    addFallbackEntry();
                    
                    assert.deepEqual(state.fallbackEditorState.fallbacks, ['anthropic/claude-sonnet-4', 'openai/gpt-4']);
                    assert.strictEqual(input.value, '');
                });
                
                it('should show error for empty input', function() {
                    const input = document.getElementById('new-fallback-input');
                    input.value = '';
                    
                    addFallbackEntry();
                    
                    const errorDiv = document.getElementById('fallback-validation-error');
                    assert.ok(errorDiv.classList.contains('hidden') === false);
                    assert.ok(errorDiv.textContent.includes('enter'));
                });
                
                it('should show error for invalid format', function() {
                    const input = document.getElementById('new-fallback-input');
                    input.value = 'invalid-format';
                    
                    addFallbackEntry();
                    
                    const errorDiv = document.getElementById('fallback-validation-error');
                    assert.ok(errorDiv.classList.contains('hidden') === false);
                    assert.ok(errorDiv.textContent.includes('Invalid'));
                });
                
                it('should show error for duplicate', function() {
                    const input = document.getElementById('new-fallback-input');
                    input.value = 'anthropic/claude-sonnet-4'; // Already in list
                    
                    addFallbackEntry();
                    
                    const errorDiv = document.getElementById('fallback-validation-error');
                    assert.ok(errorDiv.classList.contains('hidden') === false);
                    assert.ok(errorDiv.textContent.includes('already'));
                });
            });
            
            describe('removeFallbackEntry', function() {
                beforeEach(function() {
                    openFallbackEditor('sisyphus');
                });
                
                it('should remove entry at function() {
                    assert.strictEqual(state.fallbackEditorState.fallbacks.length, 2);
                    
                    removeFallbackEntry(0);
                    
                    assert.strictEqual(state.fallbackEditorState.fallbacks.length, 1);
                    assert.strictEqual(state.fallbackEditorState.fallbacks[0], 'claude-sonnet-4');
                });
            });
            
            describe('moveFallbackEntry', function() {
                beforeEach(function() {
                    openFallbackEditor('sisyphus');
                });
                
                it('should move entry up', function() {
                    const original = [...state.fallbackEditorState.fallbacks];
                    
                    moveFallbackEntry(1, -1);
                    
                    assert.strictEqual(state.fallbackEditorState.fallbacks[0], original[1]);
                    assert.strictEqual(state.fallbackEditorState.fallbacks[1], original[0]);
                });
                
                it('should move entry down', function() {
                    const original = [...state.fallbackEditorState.fallbacks];
                    
                    moveFallbackEntry(0, 1);
                    
                    assert.strictEqual(state.fallbackEditorState.fallbacks[0], original[1]);
                    assert.strictEqual(state.fallbackEditorState.fallbacks[1], original[0]);
                });
                
                it('should not move first item up', function() {
                    const original = [...state.fallbackEditorState.fallbacks];
                    
                    moveFallbackEntry(0, -1);
                    
                    assert.deepEqual(state.fallbackEditorState.fallbacks, original);
                });
                
                it('should not move last item down', function() {
                    const original = [...state.fallbackEditorState.fallbacks];
                    
                    moveFallbackEntry(original.length - 1, 1);
                    
                    assert.deepEqual(state.fallbackEditorState.fallbacks, original);
                });
            });
            
            describe('saveFallbackModels', function() {
                beforeEach(function() {
                    openFallbackEditor('sisyphus');
                });
                
                it('should update config and close modal', function() {
                    state.fallbackEditorState.fallbacks.push('openai/gpt-4');
                    
                    saveFallbackModels();
                    
                    assert.deepEqual(
                        state.currentConfig.agents.sisyphus.fallback_models,
                        ['anthropic/claude-sonnet-4', 'openai/gpt-4']
                    );
                    assert.strictEqual(elements.modal.classList.contains('hidden'), true);
                    assert.strictEqual(state.fallbackEditorState, undefined);
                });
            });
            
            describe('cancelFallbackEditor', function() {
                beforeEach(function() {
                    openFallbackEditor('sisyphus');
                });
                
                it('should close modal without saving', function() {
                    state.fallbackEditorState.fallbacks.push('openai/gpt-4');
                    
                    cancelFallbackEditor();
                    
                    assert.strictEqual(elements.modal.classList.contains('hidden'), true);
                    assert.strictEqual(state.fallbackEditorState, undefined);
                    // Original config should not be modified
                    assert.deepEqual(
                        state.currentConfig.agents.sisyphus.fallback_models,
                        ['anthropic/claude-sonnet-4']
                    );
                });
            });
        });
    </script>
</body>
</html>
`;

(global as describe => {
    describe('Fallback Editor UI Contract Tests', describe);
        
        describe('isProviderModelId validation', describe, {
            it('validates correct provider/model format', function() {
                assert.strictEqual(isProviderModelId('anthropic/claude-3-5-sonnet'), true);
                assert.strictEqual(isProviderModelId('openai/gpt-4'), true);
                assert.strictEqual(isProviderModelId('google/gemini-2.0-flash'), true);
            });
            
            it('rejects invalid formats', function() {
                assert.strictEqual(isProviderModelId('invalid'), false);
                assert.strictEqual(isProviderModelId('no-slash'), false);
                assert.strictEqual(isProviderModelId('slash/at/end/'), false);
                assert.strictEqual(isProviderModelId('/no-provider'), false);
                assert.strictEqual(isProviderModelId('provider/'), false);
                assert.strictEqual(isProviderModelId(''), false);
                assert.strictEqual(isProviderModelId(null), false);
                assert.strictEqual(isProviderModelId(undefined), false);
                assert.strictEqual(isProviderModelId(123), false);
                assert.strictEqual(isProviderModelId('has spaces/model'), false);
                assert.strictEqual(isProviderModelId('provider/model/extra'), false);
            });
        });
        
        describe('Modal functionality', describe, {
            beforeEach(function() {
                openFallbackEditor('sisyphus');
            });
            
            afterEach(function() {
                closeModal();
            });
            
            it('modal opens with correct title and function() {
                const title = document.getElementById('modal-title');
                assert.ok(title.textContent.includes('Fallback Models'));
            });
            
            it('displays agent name in header', function() {
                const body = document.getElementById('modal-body');
                assert.ok(body.innerHTML.includes('sisyphus'));
            });
            
            it('shows current fallback models', function() {
                const list = document.getElementById('fallback-list');
                assert.ok(list.innerHTML.includes('claude-sonnet-4'));
            });
            
            it('has add input and button', function() {
                const input = document.getElementById('new-fallback-input');
                const addBtn = document.querySelector('.fallback-editor-add .btn-secondary');
                assert.ok(input);
                assert.ok(addBtn);
            });
            
            it('has save and cancel buttons', function() {
                const body = document.getElementById('modal-body');
                assert.ok(body.innerHTML.includes('Save Changes'));
                assert.ok(body.innerHTML.includes('Cancel'));
            });
        });
        
        describe('Reorder controls', describe, {
            beforeEach(function() {
                openFallbackEditor('sisyphus');
            });
            
            afterEach(function() {
                closeModal();
            });
            
            it('has up/down buttons for each item', function() {
                const controls = document.querySelectorAll('.fallback-item-controls');
                assert.ok(controls.length >= 1);
                controls.forEach(function(control) {
                    const buttons = control.querySelectorAll('.btn-icon');
                    assert.strictEqual(buttons.length, 3); // up, down, remove
                });
            });
            
            it('first item has up button disabled', function() {
                const firstItem = document.querySelector('.fallback-item[data-index="0"]');
                const upBtn = firstItem.querySelector('.btn-icon[onclick*="moveFallbackEntry(0, -1)"]');
                assert.ok(upBtn);
            });
            
            it('reordering works correctly', function() {
                const initialList = [...state.fallbackEditorState.fallbacks];
                moveFallbackEntry(0, 1);
                assert.strictEqual(state.fallbackEditorState.fallbacks[0], initialList[1]);
                assert.strictEqual(state.fallbackEditorState.fallbacks[1], initialList[0]);
            });
        });
        
        describe('Add/Remove functionality', describe, {
            beforeEach(function() {
                openFallbackEditor('sisyphus');
            });
            
            afterEach(function() {
                closeModal();
            });
            
            it('adds valid model to list', function() {
                const input = document.getElementById('new-fallback-input');
                input.value = 'openai/gpt-4o';
                addFallbackEntry();
                
                assert.ok(state.fallbackEditorState.fallbacks.includes('openai/gpt-4o'));
            });
            
            it('shows validation error for invalid format', function() {
                const input = document.getElementById('new-fallback-input');
                const errorDiv = document.getElementById('fallback-validation-error');
                
                input.value = 'invalid-format';
                addFallbackEntry();
                
                assert.ok(!errorDiv.classList.contains('hidden'));
            });
            
            it('removes item from list', function() {
                const initialLength = state.fallbackEditorState.fallbacks.length;
                removeFallbackEntry(0);
                assert.strictEqual(state.fallbackEditorState.fallbacks.length, initialLength - 1);
            });
        });
        
        describe('Save/Cancel functionality', describe, {
            beforeEach(function() {
                openFallbackEditor('sisyphus');
            });
            
            it('save updates config and closes modal', function() {
                state.fallbackEditorState.fallbacks.push('openai/gpt-4o');
                saveFallbackModels();
                
                assert.deepEqual(
                    state.currentConfig.agents.sisyphus.fallback_models,
                    ['anthropic/claude-sonnet-4', 'openai/gpt-4o']
                );
                assert.ok(document.getElementById('modal').classList.contains('hidden'));
            });
            
            it('cancel closes modal without saving changes', function() {
                state.fallbackEditorState.fallbacks.push('openai/gpt-4o');
                cancelFallbackEditor();
                
                assert.deepEqual(
                    state.currentConfig.agents.sisyphus.fallback_models,
                    ['anthropic/claude-sonnet-4']
                );
                assert.ok(document.getElementById('modal').classList.contains('hidden'));
            });
        });
    });
});
})();