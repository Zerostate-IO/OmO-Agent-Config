const { test, expect } = require('@playwright/test');

test.describe('OmO Agent Config UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3456');
    await page.waitForLoadState('networkidle');
  });

  test('Agents view loads by default', async ({ page }) => {
    // Check that agents grid is visible
    const agentsGrid = await page.locator('#agents-grid');
    await expect(agentsGrid).toBeVisible();
    
    // Check that agents view button is active
    const agentsBtn = await page.locator('#view-agents-btn');
    await expect(agentsBtn).toHaveClass(/active/);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/agents-view.png' });
  });

  test('Agents are displayed', async ({ page }) => {
    // Wait for agents to load
    await page.waitForTimeout(2000);
    
    // Check for agent cards
    const agentCards = await page.locator('.agent-config-card');
    const count = await agentCards.count();
    
    console.log(`Found ${count} agent cards`);
    expect(count).toBeGreaterThan(0);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/agents-displayed.png' });
  });

  test('Can switch to models view', async ({ page }) => {
    // Click models button
    await page.click('#view-models-btn');
    
    // Check that models grid is visible
    const modelsGrid = await page.locator('#models-grid');
    await expect(modelsGrid).toBeVisible();
    
    // Check that models view button is active
    const modelsBtn = await page.locator('#view-models-btn');
    await expect(modelsBtn).toHaveClass(/active/);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/models-view.png' });
  });

  test('Models are displayed', async ({ page }) => {
    // Switch to models view
    await page.click('#view-models-btn');
    await page.waitForTimeout(1000);
    
    // Check for model cards
    const modelCards = await page.locator('.model-card');
    const count = await modelCards.count();
    
    console.log(`Found ${count} model cards`);
    expect(count).toBeGreaterThan(0);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/models-displayed.png' });
  });

  test('Can change agent model', async ({ page }) => {
    // Click change model on first agent
    const changeBtn = await page.locator('.agent-config-card').first().locator('button:has-text("Change Model")');
    await changeBtn.click();
    
    // Wait for model selector modal
    await page.waitForTimeout(500);
    
    // Check modal is open
    const modal = await page.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/change-model-modal.png' });
  });

  test('Profile management opens', async ({ page }) => {
    // Click manage profiles button
    await page.click('#manage-profiles-btn');
    
    // Wait for modal
    await page.waitForTimeout(500);
    
    // Check modal is open
    const modal = await page.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/profile-management.png' });
  });

  test('Recommendations render in agent model selector', async ({ page }) => {
    // Wait for agents to load
    await page.waitForTimeout(2000);

    // Click the "Change Model" button for the sisyphus agent specifically
    // Use exact match for the agent name to avoid matching sisyphus-junior
    const changeModelBtn = await page.locator('button[onclick="changeAgentModel(\'sisyphus\')"]');
    await changeModelBtn.click();
    
    // Wait for modal to open
    await page.waitForTimeout(500);
    
    // Check modal is open
    const modal = await page.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Assert "Recommended" section exists
    const recommendedHeading = await page.locator('h4:has-text("Recommended for")');
    await expect(recommendedHeading).toBeVisible();
    
    // Assert at least 1 recommendation item is visible
    const recommendedButtons = await page.locator('.model-selector-list .model-select-btn');
    const count = await recommendedButtons.count();
    expect(count).toBeGreaterThan(0);
    console.log(`Found ${count} recommended model buttons`);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/recommendations.png' });
  });

  test('Can change agent model and see pending indicator', async ({ page }) => {
    // Wait for agents to load
    await page.waitForTimeout(2000);

    // Use stable selector for sisyphus agent
    const sisyphusCard = await page.locator('.agent-config-card[data-agent-name="sisyphus"]');
    await sisyphusCard.locator('button:has-text("Change Model")').click();

    // Wait for modal to open
    await page.waitForTimeout(500);

    // Select a non-current model
    await page.locator('.model-select-btn:not(.current)').first().click();
    await page.waitForTimeout(500);

    // Assert pending indicator appears on the card
    await expect(sisyphusCard).toHaveClass(/pending-change/);
    await expect(sisyphusCard.locator('.agent-config-pending-label')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/pending-indicator-visible.png' });
  });

  test('Undo removes pending indicator', async ({ page }) => {
    // Wait for agents to load
    await page.waitForTimeout(2000);

    // First make a change
    const sisyphusCard = await page.locator('.agent-config-card[data-agent-name="sisyphus"]');
    await sisyphusCard.locator('button:has-text("Change Model")').click();
    await page.waitForTimeout(500);

    // Select a non-current model
    await page.locator('.model-select-btn:not(.current)').first().click();
    await page.waitForTimeout(500);

    // Assert pending indicator is visible before undo
    await expect(sisyphusCard).toHaveClass(/pending-change/);

    // Click undo
    await page.click('#undo-btn');
    await page.waitForTimeout(1000);

    // Assert pending indicator is gone
    await expect(sisyphusCard).not.toHaveClass(/pending-change/);
    await expect(page.locator('#save-btn')).toBeDisabled();

    // Take screenshot
    await page.screenshot({ path: 'test-results/undo-clears-pending.png' });
  });

  test('Discouraged models show warning badge', async ({ page, context }) => {
    // Create a new page to avoid cached data from beforeEach
    const testPage = await context.newPage();
    
    // Intercept models API to inject test model
    await testPage.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/models')) {
        const response = await route.fetch();
        const data = await response.json();
        
        // Inject a test model into the models list
        data.models.unshift({
          id: 'test/discouraged-model',
          name: 'Test Discouraged Model',
          provider: 'test',
          providerID: 'test',
          context: 128000,
          contextDisplay: '128K',
          capabilities: {},
          badges: [],
          costDisplay: '$'
        });
        data.total = data.models.length;
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      } else if (url.includes('/api/agents')) {
        const response = await route.fetch();
        const data = await response.json();
        
        // Find sisyphus agent and add discouraged model to recommendations
        const sisyphusAgent = data.agents.find(a => a.name === 'sisyphus');
        if (sisyphusAgent) {
          if (!sisyphusAgent.recommendedModels) {
            sisyphusAgent.recommendedModels = [];
          }
          sisyphusAgent.recommendedModels.unshift({
            id: 'test/discouraged-model',
            name: 'Test Discouraged Model',
            score: 50,
            provider: 'test',
            provenance: 'heuristic',
            discouragedReason: 'Test: This model is discouraged for testing purposes',
            discouragedSeverity: 'avoid'
          });
        }
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      } else {
        await route.continue();
      }
    });

    // Navigate and refresh to trigger intercepted requests
    await testPage.goto('http://localhost:3456');
    await testPage.waitForLoadState('networkidle');
    await testPage.waitForTimeout(2000);
    await testPage.click('#refresh-btn');
    await testPage.waitForTimeout(2000);

    // Open model selector for sisyphus agent
    await testPage.locator('button[onclick="changeAgentModel(\'sisyphus\')"]').click();
    await testPage.waitForTimeout(500);
    
    // Assert warning badge is visible
    const warningBadge = await testPage.locator('.warning-badge-avoid').first();
    await expect(warningBadge).toBeVisible();
    
    // Verify badge has discouraged reason in title
    const titleAttr = await warningBadge.getAttribute('title');
    expect(titleAttr).toContain('discouraged');
    
    // Take screenshot for verification
    await testPage.screenshot({ path: 'test-results/discouraged-model-warning-badge.png' });
    await testPage.close();
  });

  test('Can open Profile Management and see Backups section', async ({ page }) => {
    // Click manage profiles button
    await page.click('#manage-profiles-btn');
    
    // Wait for modal
    await page.waitForTimeout(500);
    
    // Check modal is open
    const modal = await page.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Check modal title is "Profile Management"
    const modalTitle = await page.locator('#modal-title');
    await expect(modalTitle).toHaveText('Profile Management');
    
    // Check Backups section heading exists
    const backupsHeading = await page.locator('h4:has-text("Configuration Backups")');
    await expect(backupsHeading).toBeVisible();
    
    // Check backups list container exists
    const backupsContainer = await page.locator('#backups-list-container');
    await expect(backupsContainer).toBeVisible();
    
    // Check Purge button exists
    const purgeBtn = await page.locator('button:has-text("Purge Old Backups")');
    await expect(purgeBtn).toBeVisible();
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/profile-management-backups.png' });
  });

  test('Purge preview shows confirmation dialog', async ({ page }) => {
    // Open Profile Management
    await page.click('#manage-profiles-btn');
    await page.waitForTimeout(500);
    
    // Wait for backups to load
    await page.waitForTimeout(1000);
    
    // Click Purge button
    await page.click('button:has-text("Purge Old Backups")');
    
    // Wait for purge preview modal
    await page.waitForTimeout(500);
    
    // Check purge modal title
    const modalTitle = await page.locator('#modal-title');
    await expect(modalTitle).toHaveText('Purge Backups');
    
    // Check purge preview content exists
    const purgePreview = await page.locator('.purge-preview');
    await expect(purgePreview).toBeVisible();
    
    // Check preview heading
    const previewHeading = await page.locator('h4:has-text("Purge Old Backups")');
    await expect(previewHeading).toBeVisible();
    
    // Either "No backups to purge" message OR confirmation buttons exist
    const noBackupsMessage = page.locator('text=No backups to purge');
    const confirmBtn = page.locator('button:has-text("Confirm Purge")');
    const cancelBtn = page.locator('button:has-text("Cancel")');
    
    // At least one of these states should be true
    const hasNoBackupsMsg = await noBackupsMessage.isVisible().catch(() => false);
    const hasConfirmBtn = await confirmBtn.isVisible().catch(() => false);
    const hasCancelBtn = await cancelBtn.isVisible().catch(() => false);
    
    expect(hasNoBackupsMsg || hasConfirmBtn || hasCancelBtn).toBeTruthy();
    
    // If there are backups to purge, test the cancel flow
    if (hasConfirmBtn && hasCancelBtn) {
      // Click Cancel to dismiss
      await cancelBtn.click();
      await page.waitForTimeout(300);
      
      // Modal should close or return to Profile Management
      const currentTitle = await modalTitle.textContent();
      expect(currentTitle === 'Profile Management' || await modal.isHidden().catch(() => false)).toBeTruthy();
    }
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/purge-preview-dialog.png' });
  });

  test('Billing filter chips filter models by billingModel', async ({ page, context }) => {
    // Create a new page to have clean state
    const testPage = await context.newPage();
    
    // Intercept models API to return fixture with subscription and metered models
    await testPage.route('**/api/models*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              id: 'test/subscription-model',
              name: 'Test Subscription Model',
              provider: 'TestProvider',
              providerID: 'test',
              context: 128000,
              contextDisplay: '128K',
              capabilities: {},
              badges: [],
              costDisplay: '$$',
              billingModel: 'subscription'
            },
            {
              id: 'test/metered-model',
              name: 'Test Metered Model',
              provider: 'TestProvider',
              providerID: 'test',
              context: 200000,
              contextDisplay: '200K',
              capabilities: {},
              badges: [],
              costDisplay: '$',
              billingModel: 'metered'
            },
            {
              id: 'test/free-model',
              name: 'Test Free Model',
              provider: 'TestProvider',
              providerID: 'test',
              context: 64000,
              contextDisplay: '64K',
              capabilities: {},
              badges: [],
              costDisplay: '',
              billingModel: 'free'
            }
          ],
          providers: ['TestProvider'],
          total: 3,
          cached: false,
          fetchedAt: new Date().toISOString(),
          hasDuplicates: false,
          duplicateCount: 0
        })
      });
    });
    
    // Navigate and wait for models to load
    await testPage.goto('http://localhost:3456');
    await testPage.waitForLoadState('networkidle');
    
    // Switch to Models view
    await testPage.click('#view-models-btn');
    await testPage.waitForTimeout(500);
    
    // Verify all 3 model cards are visible initially
    let modelCards = await testPage.locator('.model-card');
    let count = await modelCards.count();
    expect(count).toBe(3);
    
    // Click "Sub" chip (data-filter="subscription")
    const subChip = await testPage.locator('.chip[data-filter="subscription"]');
    await subChip.click();
    await testPage.waitForTimeout(300);
    
    // Verify only subscription model is visible
    modelCards = await testPage.locator('.model-card');
    count = await modelCards.count();
    expect(count).toBe(1);
    await expect(testPage.locator('.model-card:has-text("Test Subscription Model")')).toBeVisible();
    await expect(testPage.locator('.model-card:has-text("Test Metered Model")')).not.toBeVisible();
    await expect(testPage.locator('.model-card:has-text("Test Free Model")')).not.toBeVisible();
    
    // Click "Sub" chip again to deselect
    await subChip.click();
    await testPage.waitForTimeout(300);
    
    // Verify all 3 models visible again
    modelCards = await testPage.locator('.model-card');
    count = await modelCards.count();
    expect(count).toBe(3);
    
    // Click "PayGo" chip (data-filter="metered")
    const paygoChip = await testPage.locator('.chip[data-filter="metered"]');
    await paygoChip.click();
    await testPage.waitForTimeout(300);
    
    // Verify only metered model is visible
    modelCards = await testPage.locator('.model-card');
    count = await modelCards.count();
    expect(count).toBe(1);
    await expect(testPage.locator('.model-card:has-text("Test Metered Model")')).toBeVisible();
    await expect(testPage.locator('.model-card:has-text("Test Subscription Model")')).not.toBeVisible();
    
    // Take screenshot for verification
    await testPage.screenshot({ path: 'test-results/billing-filter-metered.png' });
    await testPage.close();
  });

  test('Billing and speed badges appear in agent model selector rows', async ({ page, context }) => {
    // Create a new page to have clean state
    const testPage = await context.newPage();
    
    // Intercept models API to inject test model with billingModel and speedTier
    await testPage.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/models')) {
        const response = await route.fetch();
        const data = await response.json();
        
        // Inject a test model with metered billing and fast speed
        data.models.unshift({
          id: 'test/fast-metered-model',
          name: 'Test Fast Metered Model',
          provider: 'TestProvider',
          providerID: 'test',
          context: 200000,
          contextDisplay: '200K',
          capabilities: {},
          badges: [],
          costDisplay: '$',
          billingModel: 'metered',
          speedTier: 'fast'
        });
        data.total = data.models.length;
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      } else if (url.includes('/api/agents')) {
        const response = await route.fetch();
        const data = await response.json();
        
        // Find sisyphus agent and add our test model to recommendations
        const sisyphusAgent = data.agents.find(a => a.name === 'sisyphus');
        if (sisyphusAgent) {
          if (!sisyphusAgent.recommendedModels) {
            sisyphusAgent.recommendedModels = [];
          }
          sisyphusAgent.recommendedModels.unshift({
            id: 'test/fast-metered-model',
            name: 'Test Fast Metered Model',
            score: 100,
            provider: 'TestProvider',
            provenance: 'heuristic'
          });
        }
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data)
        });
      } else {
        await route.continue();
      }
    });
    
    // Navigate and refresh to trigger intercepted requests
    await testPage.goto('http://localhost:3456');
    await testPage.waitForLoadState('networkidle');
    await testPage.waitForTimeout(2000);
    await testPage.click('#refresh-btn');
    await testPage.waitForTimeout(2000);
    
    // Open model selector for sisyphus agent
    await testPage.locator('button[onclick="changeAgentModel(\'sisyphus\')"]').click();
    await testPage.waitForTimeout(500);
    
    // Verify modal is open
    const modal = await testPage.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Find model button for fast-metered model and assert badges (use .first() to handle duplicates)
    const fastMeteredBtn = await testPage.locator('.model-select-btn:has-text("Test Fast Metered Model")').first();
    await expect(fastMeteredBtn).toBeVisible();
    
    // Assert PAY billing badge is visible inside the button
    const payBadge = await fastMeteredBtn.locator('.billing-pay');
    await expect(payBadge).toBeVisible();
    await expect(payBadge).toHaveText('PAY');
    
    // Assert speed-fast badge (⚡) is visible inside the button
    const speedBadge = await fastMeteredBtn.locator('.speed-fast');
    await expect(speedBadge).toBeVisible();
    
    // Take screenshot for verification
    await testPage.screenshot({ path: 'test-results/billing-speed-badges-selector.png' });
    await testPage.close();
  });

  test('Provider Policies modal renders notes input and saves notes in POST', async ({ page, context }) => {
    // Create a new page to have clean state
    const testPage = await context.newPage();
    
    // Stub providers API GET
    await testPage.route('**/api/providers*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            providers: {
              'test-provider': {
                billingModel: 'metered',
                speedTier: 'normal',
                priorityTier: 50,
                notes: 'Existing note'
              },
              'other-provider': {
                billingModel: 'subscription',
                speedTier: 'fast',
                priorityTier: 10,
                notes: ''
              }
            }
          })
        });
      } else if (route.request().method() === 'POST') {
        // Capture POST payload for assertion
        const postData = route.request().postDataJSON();
        
        // Verify notes is included in the POST payload
        expect(postData.providers).toBeDefined();
        expect(postData.providers['test-provider']).toBeDefined();
        expect(postData.providers['test-provider'].notes).toBe('Updated test notes');
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });
    
    // Navigate and wait for load
    await testPage.goto('http://localhost:3456');
    await testPage.waitForLoadState('networkidle');
    await testPage.waitForTimeout(1000);
    
    // Click provider policies button
    const providerPoliciesBtn = await testPage.locator('#provider-policies-btn');
    await expect(providerPoliciesBtn).toBeVisible();
    await providerPoliciesBtn.click();
    await testPage.waitForTimeout(500);
    
    // Verify modal is open
    const modal = await testPage.locator('#modal');
    await expect(modal).toBeVisible();
    
    // Verify notes input field exists for test-provider
    const notesInput = await testPage.locator('#policy-test-provider-notes');
    await expect(notesInput).toBeVisible();
    await expect(notesInput).toHaveValue('Existing note');
    
    // Update notes value
    await notesInput.fill('Updated test notes');
    // Click Save Changes button in Provider Policies modal (specific to avoid matching main UI button)
    const saveBtn = await testPage.locator('button[onclick="saveProviderPolicies()"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    // Wait for save to complete
    await testPage.waitForTimeout(500);
    
    // Take screenshot for verification
    await testPage.screenshot({ path: 'test-results/provider-policies-notes.png' });
    await testPage.close();
  });
});
