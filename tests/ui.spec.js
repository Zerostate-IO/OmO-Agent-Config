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
});
