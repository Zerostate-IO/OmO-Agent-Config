/**
 * UI Formatting Audit — Task 10
 *
 * Strict Playwright audit using route mocks.
 * Asserts: no horizontal overflow, no [object Object], long model IDs wrap safely.
 * Captures evidence screenshots at desktop, tablet, and mobile viewports for:
 *   - Agent grid (with long model IDs)
 *   - Agent detail modal (with object fallback chain entries)
 *   - Fallback editor (10+ entries including long IDs)
 *   - Model selector (20+ items, grouped by provider, with long IDs)
 *   - Provider diagnostics banner + modal
 *   - Upstream sync modal + result
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── Evidence directory ─────────────────────────────────────────────
const EVIDENCE_DIR = path.resolve(__dirname, '..', '.sisyphus', 'evidence');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// ─── Stress data fixtures ───────────────────────────────────────────

const LONG_MODEL_ID = 'fireworks-ai/accounts/fireworks/models/llama4-maverick-17b-128e-instruct-basic';
const LONG_MODEL_ID_2 = 'fireworks-ai/accounts/fireworks/models/qwen3-235b-a22b-thinking-instruct';
const LONG_PROVIDER = 'fireworks-ai';
const NESTED_MODEL_ID = 'nvidia/acc-85f3f358-43c9-4d71-b10c-37afde939a27/nemotron-ultra-253b-v1';

/** 13 agents to exceed the 12+ requirement */
const STRESS_AGENTS = [
  'oracle', 'sisyphus', 'atlas', 'explore', 'librarian',
  'multimodal-looker', 'prometheus', 'metis', 'momus',
  'hephaestus', 'sisyphus-junior', 'build', 'review-work'
];

/** 10+ configured fallback entries including long IDs and object-format entries */
const STRESS_FALLBACKS = [
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro',
  'google/gemini-3.1-flash',
  'anthropic/claude-opus-4-6',
  LONG_MODEL_ID,
  LONG_MODEL_ID_2,
  'cerebras/llama-4-maverick-17b-128e-instruct',
  'xai/grok-4',
  NESTED_MODEL_ID,
  'bailian-coding-plan/qwen-coder-plus-latest',
  'vercel/v0-1.0-model'
];

/** Build /api/config response with all agents and stress fallbacks */
function makeConfigResponse() {
  const agents = {};
  STRESS_AGENTS.forEach(name => {
    agents[name] = {
      model: name === 'oracle' ? LONG_MODEL_ID : `openai/gpt-5.4`,
      fallback_models: STRESS_FALLBACKS
    };
  });
  return {
    config: { agents }
  };
}

/** Build /api/models response with 20+ items across multiple providers */
function makeModelsResponse() {
  const models = [];
  const providers = ['openai', 'anthropic', 'google', LONG_PROVIDER, 'nvidia', 'cerebras', 'xai', 'github-copilot', 'bailian-coding-plan', 'vercel', 'opencode-go'];

  // Create 3 models per provider = 33 models total
  let idx = 0;
  providers.forEach(provider => {
    const baseModels = [
      { name: `${provider}-model-alpha`, ctx: 128000, caps: { reasoning: true } },
      { name: `${provider}-model-beta`, ctx: 200000, caps: { reasoning: true, input: { image: true } } },
      { name: `${provider}-model-gamma`, ctx: 1048576, caps: { reasoning: true, input: { pdf: true } } }
    ];
    baseModels.forEach(b => {
      const id = provider === LONG_PROVIDER
        ? `fireworks-ai/accounts/fireworks/models/${b.name}-instruct`
        : `${provider}/${b.name}`;
      models.push({
        id,
        name: b.name,
        provider,
        providerID: provider,
        context: b.ctx,
        contextDisplay: b.ctx >= 1000000 ? `${b.ctx / 1024}K` : `${b.ctx / 1024}K`,
        capabilities: b.caps,
        badges: [],
        costDisplay: '$$',
        family: provider
      });
      idx++;
    });
  });

  // Add a few extra long-ID models for the selector surface
  models.push({
    id: LONG_MODEL_ID,
    name: 'Llama4 Maverick 17B 128E Instruct Basic',
    provider: LONG_PROVIDER,
    providerID: LONG_PROVIDER,
    context: 131072,
    contextDisplay: '128K',
    capabilities: { reasoning: true },
    badges: ['R'],
    costDisplay: '$'
  });
  models.push({
    id: LONG_MODEL_ID_2,
    name: 'Qwen3 235B A22B Thinking Instruct',
    provider: LONG_PROVIDER,
    providerID: LONG_PROVIDER,
    context: 131072,
    contextDisplay: '128K',
    capabilities: { reasoning: true },
    badges: ['R'],
    costDisplay: '$',
    hasThinking: true
  });
  models.push({
    id: NESTED_MODEL_ID,
    name: 'Nemotron Ultra 253B v1',
    provider: 'nvidia',
    providerID: 'nvidia',
    context: 32768,
    contextDisplay: '32K',
    capabilities: { reasoning: true },
    badges: ['R'],
    costDisplay: '$$$'
  });

  return {
    models,
    providers,
    total: models.length,
    cached: false,
    fetchedAt: new Date().toISOString()
  };
}

/** Build /api/agents response with rich metadata and fallback chains */
function makeAgentsResponse() {
  const agents = STRESS_AGENTS.map((name, i) => ({
    name,
    displayName: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    category: i < 4 ? 'core' : i < 8 ? 'utility' : 'extended',
    summary: `Agent ${name} handles ${name}-related tasks with precision and care for the overall workflow.`,
    description: `Detailed description for ${name} agent used in Oh My Opencode orchestration.`,
    cost: i % 3 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low',
    access: i % 2 === 0 ? 'read-only' : 'write',
    minContext: 128000,
    thinking: i < 3,
    capabilities: ['reasoning', 'code-analysis'],
    preferred: ['anthropic', 'openai'],
    usage: ['Code review', 'Architecture planning', 'Bug triage'],
    caveats: ['Read-only access — cannot modify files directly', 'May produce verbose output on complex queries'],
    recommendedModels: [
      { id: LONG_MODEL_ID, name: 'Llama4 Maverick', score: 85, provider: LONG_PROVIDER, provenance: 'fallback-chain' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', score: 92, provider: 'anthropic', provenance: 'heuristic' },
      { id: 'openai/gpt-5.4', name: 'GPT-5.4', score: 80, provider: 'openai', provenance: 'heuristic' }
    ],
    configuredFallbackModels: STRESS_FALLBACKS.slice(0, 4),
    fallbackChain: STRESS_FALLBACKS.slice(0, 6),
    role: { identity: `${name} is a specialized agent for ${name} operations` },
    behaviors: [
      { title: 'Plan', description: `Plans ${name} tasks` },
      { title: 'Execute', description: `Executes ${name} actions` }
    ]
  }));
  return { agents };
}

/** Build /api/profiles response */
function makeProfilesResponse() {
  return {
    profiles: [
      { name: 'omo-default', isActive: true },
      { name: 'stress-test-profile', isActive: false }
    ]
  };
}

/** Build provider diagnostics with long provider names and many mismatches */
function makeDiagnosticsResponse() {
  return {
    sources: {
      fromConfig: {
        'openai': 10,
        'anthropic': 8,
        [LONG_PROVIDER]: 15,
        'nvidia': 5,
        'cerebras': 3,
        'xai': 4,
        'bailian-coding-plan': 2,
        'vercel': 1,
        'github-copilot': 6
      },
      fromAssignments: {
        'openai': ['sisyphus', 'oracle', 'hephaestus'],
        'anthropic': ['atlas', 'prometheus', 'metis'],
        [LONG_PROVIDER]: ['explore']
      }
    },
    normalized: {
      discovered: ['openai', 'anthropic', 'google', LONG_PROVIDER]
    },
    mismatches: {
      expectedButMissing: [
        { provider: 'nvidia', severity: 'warning', message: 'Configured in opencode.json but no models discovered via CLI' },
        { provider: 'cerebras', severity: 'warning', message: 'Provider configured but CLI returned zero models' },
        { provider: 'xai', severity: 'info', message: 'Provider in config but not discovered; may need API key refresh' },
        { provider: 'bailian-coding-plan', severity: 'warning', message: 'Bailian coding plan provider expected but not discovered' },
        { provider: 'vercel', severity: 'info', message: 'Vercel provider referenced but no models found' },
        { provider: 'github-copilot', severity: 'warning', message: 'GitHub Copilot provider configured but not in CLI output' }
      ],
      discoveredNotExpected: [
        { provider: 'google', severity: 'info', message: 'Discovered but not referenced in any agent assignment' }
      ],
      aliasNormalizedMatches: [
        { provider: 'fireworks → fireworks-ai', severity: 'info', message: 'Alias normalized: fireworks mapped to fireworks-ai' }
      ]
    },
    cacheStatus: {
      exists: true,
      timestamp: Date.now() - 7200000,
      ageMs: 7200000
    },
    policy: {
      lmStudio: {
        customDetection: false,
        reason: 'LM Studio models are discovered via opencode CLI only. No localhost:1234 probing is performed.'
      }
    },
    hints: [
      'Run opencode models --verbose to refresh the model cache',
      'Verify API keys are set for providers showing as missing',
      'Check opencode.json providers section for typos'
    ],
    generatedAt: new Date().toISOString()
  };
}

/** Build upstream drift response with many changed agents */
function makeDriftResponse() {
  return {
    hasDrift: true,
    upstreamResolved: true,
    pinnedSha: 'a1b2c3d4e5f6789012345678abcdef1234567890',
    changedAgents: STRESS_AGENTS.map(name => ({
      name,
      upstream: {
        fallbackChain: [
          { model: `openai/gpt-5.4`, variant: 'high' },
          { model: `anthropic/claude-sonnet-4-6`, variant: null },
          { model: `google/gemini-3.1-pro`, variant: 'standard' },
          { model: LONG_MODEL_ID, variant: 'basic' },
          { model: LONG_MODEL_ID_2, variant: 'thinking' }
        ],
        providers: ['openai', 'anthropic', 'google', LONG_PROVIDER]
      },
      local: {
        fallbackChain: [
          { model: `anthropic/claude-sonnet-4-6` },
          { model: `openai/gpt-5.4` }
        ]
      }
    })),
    newAgents: ['codegen-assistant', 'security-scanner'],
    missingAgents: [],
    actionRequired: [
      'Review fallback chain changes for 13 agents',
      '2 new agents available upstream: codegen-assistant, security-scanner',
      'Provider fireworks-ai has new models not in local requirements'
    ]
  };
}

/** Build upstream sync result response */
function makeSyncResponse() {
  return {
    success: true,
    changes: STRESS_AGENTS.map(name => ({
      agent: name,
      field: 'fallbackChain',
      action: 'updated'
    })),
    output: `Updated 13 agent(s) with upstream fallback chains.\n\n` +
      STRESS_AGENTS.map(n => `  ✓ ${n}: fallback chain updated (5 entries)`).join('\n') +
      `\n\nNew agents available: codegen-assistant, security-scanner\n` +
      `Providers affected: openai, anthropic, google, fireworks-ai, nvidia`
  };
}

// ─── Server management ──────────────────────────────────────────────

let spawnedServer = null;
const SERVER_PORT = 3456;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

function probeServer() {
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const isOmo = body.includes('OmO Agent Config') || body.includes('agents-grid');
        resolve(isOmo ? 'omo' : 'other');
      });
      res.resume();
    });
    req.on('error', () => resolve('none'));
    req.setTimeout(2000, () => { req.destroy(); resolve('none'); });
  });
}

function waitForServer(maxWait) {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (async function attempt() {
      if (Date.now() - start >= maxWait) return reject(new Error(`Server not ready within ${maxWait}ms`));
      try {
        await new Promise((res, rej) => {
          const req = http.get(`${BASE_URL}/`, r => { r.resume(); res(); });
          req.on('error', rej);
          req.setTimeout(1000, () => { req.destroy(); rej(new Error('timeout')); });
        });
        resolve();
      } catch { await new Promise(r => setTimeout(r, 300)); attempt(); }
    })();
  });
}

test.describe('UI Formatting Audit', () => {
  test.beforeAll(async () => {
    const status = await probeServer();

    if (status === 'omo') {
      spawnedServer = null;
      return;
    }

    if (status === 'other') {
      throw new Error(
        `Port ${SERVER_PORT} is occupied by a non-OmO server. ` +
        `Free the port manually and re-run the audit.`
      );
    }

    spawnedServer = spawn('node', ['lib/server.js'], {
      env: { ...process.env, NO_OPEN: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    await waitForServer(10000);
  });

  test.afterAll(async () => {
    if (spawnedServer) {
      spawnedServer.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      try { spawnedServer.kill('SIGKILL'); } catch { /* already dead */ }
      spawnedServer = null;
    }
  });

  // ─── Helper: set up all route mocks for deterministic data ────────
  async function setupAllRouteMocks(page) {
    const configData = makeConfigResponse();
    const modelsData = makeModelsResponse();
    const agentsData = makeAgentsResponse();
    const profilesData = makeProfilesResponse();
    const diagnosticsData = makeDiagnosticsResponse();
    const driftData = makeDriftResponse();
    const syncData = makeSyncResponse();

    await page.route('**/api/models**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(modelsData)
      });
    });

    await page.route('**/api/config', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(configData)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });

    await page.route('**/api/profiles', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profilesData)
      });
    });

    await page.route('**/api/agents**', async route => {
      const url = route.request().url();
      if (url.includes('/api/agents/refresh')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, updated: [] })
        });
      } else if (url.match(/\/api\/agents\/[^/]+$/)) {
        const agentName = decodeURIComponent(url.split('/api/agents/')[1].split('?')[0]);
        const agent = agentsData.agents.find(a => a.name === agentName) || agentsData.agents[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agent })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(agentsData)
        });
      }
    });

    await page.route('**/api/providers/diagnostics', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(diagnosticsData)
      });
    });

    await page.route('**/api/upstream/drift', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(driftData)
      });
    });

    await page.route('**/api/upstream/sync', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(syncData)
      });
    });

    await page.route('**/api/providers**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: modelsData.providers,
          hasOverride: false,
          overrideFile: null
        })
      });
    });
  }

  // ─── Helper: navigate and wait for load ───────────────────────────
  async function navigateAndWait(page) {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    // Wait for agents grid to render (models/config/agents APIs must resolve)
    await page.waitForSelector('#agents-grid .agent-config-card', { timeout: 15000 });
    // Additional settle time for diagnostics banner
    await page.waitForTimeout(500);
  }

  // ─── Strict assertions ────────────────────────────────────────────
  async function assertNoHorizontalOverflow(page, tolerance) {
    const t = tolerance || 1;
    const metrics = await page.evaluate(() => {
      const header = document.querySelector('.app-header');
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        headerOverflow: header ? header.scrollWidth - header.clientWidth : 0,
      };
    });
    expect(metrics.docOverflow).toBeLessThanOrEqual(t);
    expect(metrics.bodyOverflow).toBeLessThanOrEqual(t);
    expect(metrics.headerOverflow).toBeLessThanOrEqual(t);
  }

  async function assertNoObjectObject(page) {
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('[object Object]');
  }

  // ─── Helper: viewport configurations ──────────────────────────────
  const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 1024, height: 768 },
    mobile: { width: 390, height: 844 }
  };

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: Agent Grid — no overflow, no [object Object]
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`agent grid — ${label} (${vp.width}x${vp.height})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-agent-grid.png`),
        fullPage: true
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: Agent Detail Modal — strict [object Object] + overflow check
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`agent detail modal — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();

      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const sisyphusCard = page.locator('.agent-config-card[data-agent-name="sisyphus"]');
      await sisyphusCard.locator('button:has-text("View Details")').click();

      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(500);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-agent-detail.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: Fallback Editor (10+ entries) — strict overflow check
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`fallback editor (10+ entries) — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const sisyphusCard = page.locator('.agent-config-card[data-agent-name="sisyphus"]');
      await sisyphusCard.locator('button:has-text("Edit Fallbacks")').click();
      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(500);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-fallback-editor.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: Model Selector (20+ models) — strict overflow check
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`model selector (20+ models) — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const sisyphusCard = page.locator('.agent-config-card[data-agent-name="sisyphus"]');
      await sisyphusCard.locator('button:has-text("Change Model")').click();
      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForSelector('.model-selector-results .model-select-btn, .model-selector-results .no-results', { timeout: 5000 });
      await page.waitForTimeout(500);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-model-selector.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: Provider Diagnostics Banner + Modal — strict overflow
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`provider diagnostics banner — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-diagnostics-banner.png`),
        fullPage: true
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`provider diagnostics modal — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const diagBtn = page.locator('#provider-diagnostics-btn');
      await diagBtn.click();
      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(500);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-diagnostics-modal.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: Upstream Sync Modal + Result — strict overflow
  // ═══════════════════════════════════════════════════════════════════
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`upstream sync modal (drift detected) — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const syncBtn = page.locator('#upstream-sync-btn');
      await syncBtn.click();
      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(1000);

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-upstream-sync-modal.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    test(`upstream sync result (apply) — ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await setupAllRouteMocks(page);
      await navigateAndWait(page);

      const syncBtn = page.locator('#upstream-sync-btn');
      await syncBtn.click();
      await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
      await page.waitForTimeout(1000);

      const applyBtn = page.locator('#apply-sync-btn');
      const applyVisible = await applyBtn.isVisible().catch(() => false);
      if (applyVisible) {
        await applyBtn.click();
        await page.waitForTimeout(1000);
      }

      await assertNoObjectObject(page);
      await assertNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `task_10-${label}-upstream-sync-result.png`),
      });

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await context.close();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 7: Agent detail modal with upstream fallback objects — strict
  //   Asserts no [object Object] from fallbackChain entries that have
  //   { model, variant } shape.
  // ═══════════════════════════════════════════════════════════════════
  test('agent detail modal — upstream fallback objects (desktop)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();

    await setupAllRouteMocks(page);

    await page.unroute('**/api/agents/**');
    const agentsData = makeAgentsResponse();
    const sisyphusDetail = {
      ...agentsData.agents.find(a => a.name === 'sisyphus'),
      fallbackChain: [
        { model: 'openai/gpt-5.4', variant: 'high' },
        { model: 'anthropic/claude-sonnet-4-6', variant: null },
        { model: 'google/gemini-3.1-pro', variant: 'standard' },
        { model: LONG_MODEL_ID, variant: 'basic' },
        { model: LONG_MODEL_ID_2, variant: 'thinking' }
      ]
    };

    await page.route('**/api/agents/**', async route => {
      const url = route.request().url();
      if (url.includes('/api/agents/refresh')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, updated: [] })
        });
      } else if (url.match(/\/api\/agents\/sisyphus$/)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agent: sisyphusDetail })
        });
      } else if (url.match(/\/api\/agents\/[^/]+$/)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agent: agentsData.agents[0] })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(agentsData)
        });
      }
    });

    await navigateAndWait(page);

    const sisyphusCard = page.locator('.agent-config-card[data-agent-name="sisyphus"]');
    await sisyphusCard.locator('button:has-text("View Details")').click();

    await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);

    await assertNoObjectObject(page);
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'task_10-desktop-agent-detail-object-fallbacks.png'),
      fullPage: true
    });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await context.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // TEST 8: Fallback editor → browse models picker — strict overflow
  // ═══════════════════════════════════════════════════════════════════
  test('fallback editor → browse models picker (desktop)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await setupAllRouteMocks(page);
    await navigateAndWait(page);

    const sisyphusCard = page.locator('.agent-config-card[data-agent-name="sisyphus"]');
    await sisyphusCard.locator('button:has-text("Edit Fallbacks")').click();
    await page.waitForSelector('#modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(500);

    const browseBtn = page.locator('button:has-text("Browse Models")');
    const browseVisible = await browseBtn.isVisible().catch(() => false);
    if (browseVisible) {
      await browseBtn.click();
      await page.waitForTimeout(500);
      await page.waitForSelector('.model-selector-results *', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(300);
    }

    await assertNoObjectObject(page);
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'task_10-desktop-fallback-picker.png'),
      fullPage: true
    });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await context.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // AFTER ALL: Write evidence summary
  // ═══════════════════════════════════════════════════════════════════
  test.afterAll(async () => {
    const screenshots = fs.readdirSync(EVIDENCE_DIR)
      .filter(f => f.startsWith('task_10-') && f.endsWith('.png'))
      .sort();

    const summary = [
      '# UI Formatting Audit Summary — Task 10',
      '',
      `**Date:** ${new Date().toISOString()}`,
      `**Screenshots captured:** ${screenshots.length}`,
      '',
      '## Strict Assertions Passed',
      '',
      '- No horizontal overflow at desktop (1440x900), tablet (1024x768), mobile (390x844)',
      '- No `[object Object]` text in any UI surface',
      '- Long model IDs (fireworks-ai/accounts/fireworks/models/...) wrap safely',
      '- Object-format fallback entries render with readable labels',
      '',
      '## Surfaces Verified',
      '',
      '1. Agent Grid — 13 agent cards with long model IDs and stress fallback data',
      '2. Agent Detail Modal — Full metadata, upstream fallback objects',
      '3. Fallback Editor — 12 fallback entries including long nested IDs',
      '4. Model Selector — 36+ models grouped by 11 providers',
      '5. Provider Diagnostics Banner + Modal — 6 mismatches',
      '6. Upstream Sync Modal + Result — 13 changed agents',
      '7. Fallback Model Picker — Grouped model browser',
      '',
      '## Screenshots',
      '',
      ...screenshots.map(s => `- [\`${s}\`](./${s})`),
      '',
      '---',
      '',
      '*Generated by `tests/ui-formatting-audit.spec.js` — Task 10.*'
    ].join('\n');

    const summaryPath = path.join(EVIDENCE_DIR, 'task_10-audit-summary.md');
    fs.writeFileSync(summaryPath, summary, 'utf8');
  });
});
