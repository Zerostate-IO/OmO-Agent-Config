#!/usr/bin/env node
/**
 * Tests for provider-aware-sync.js script and /api/upstream/sync route
 *
 * Covers:
 * 1. Script --json dry-run outputs structured JSON with expected fields
 * 2. Script --json with --providers= flag uses specified providers
 * 3. Script exits 2 when requirements file is missing
 * 4. Route dry-run returns structured response
 * 5. Route returns 500 when script is missing
 * 6. Route returns 500 for unparseable script output
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const SYNC_SCRIPT = path.join(__dirname, '..', 'scripts', 'provider-aware-sync.js');
const MODEL_REQS_FILE = path.join(__dirname, '..', 'lib', 'core', 'model-requirements.js');
const SERVER_FILE = path.join(__dirname, '..', 'lib', 'server.js');

function runScript(args = [], env = {}) {
  const fullEnv = { ...process.env, ...env };
  try {
    const output = execSync(`node "${SYNC_SCRIPT}" ${args.join(' ')}`, {
      encoding: 'utf8',
      timeout: 60000,
      env: fullEnv,
      cwd: path.join(__dirname, '..')
    });
    return { success: true, output: output.trim(), status: 0 };
  } catch (e) {
    return {
      success: false,
      output: e.stdout?.trim() || '',
      stderr: e.stderr?.trim() || '',
      status: e.status
    };
  }
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test 1: Script --json dry-run produces structured output
function testScriptDryRunJson() {
  console.log('Test 1: Script --json dry-run produces structured JSON');

  const result = runScript(['--json', '--providers=openai,anthropic']);
  const parsed = JSON.parse(result.output || '{}');

  if (result.status !== 0) {
    console.log(`  ✗ Expected exit 0, got ${result.status}`);
    if (result.output) console.log(`    Output: ${result.output.slice(0, 300)}`);
    return false;
  }

  if (parsed.success !== true) {
    console.log(`  ✗ Expected success: true, got ${parsed.success}`);
    return false;
  }
  console.log('  ✓ success is true');

  if (parsed.dryRun !== true) {
    console.log(`  ✗ Expected dryRun: true, got ${parsed.dryRun}`);
    return false;
  }
  console.log('  ✓ dryRun is true');

  if (!Array.isArray(parsed.changedAgents)) {
    console.log(`  ✗ Expected changedAgents to be array`);
    return false;
  }
  console.log('  ✓ changedAgents is array');

  if (!Array.isArray(parsed.changedCategories)) {
    console.log(`  ✗ Expected changedCategories to be array`);
    return false;
  }
  console.log('  ✓ changedCategories is array');

  if (!Array.isArray(parsed.warnings)) {
    console.log(`  ✗ Expected warnings to be array`);
    return false;
  }
  console.log('  ✓ warnings is array');

  if (!parsed.sourceRef) {
    console.log(`  ✗ Expected sourceRef object`);
    return false;
  }
  console.log('  ✓ sourceRef present');

  if (typeof parsed.summary !== 'string') {
    console.log(`  ✗ Expected summary to be string`);
    return false;
  }
  console.log(`  ✓ summary: "${parsed.summary}"`);

  if (!Array.isArray(parsed.providers)) {
    console.log(`  ✗ Expected providers to be array`);
    return false;
  }
  console.log(`  ✓ providers: [${parsed.providers.join(', ')}]`);

  return true;
}

// Test 2: Script respects --providers= flag
function testScriptProvidersFlag() {
  console.log('Test 2: Script --providers= flag is respected');

  const result = runScript(['--json', '--providers=openai,google']);
  const parsed = JSON.parse(result.output || '{}');

  if (!parsed.success) {
    console.log(`  ✗ Script failed: ${parsed.error}`);
    return false;
  }

  const hasOpenai = parsed.providers.includes('openai');
  const hasGoogle = parsed.providers.includes('google');

  if (!hasOpenai || !hasGoogle) {
    console.log(`  ✗ Expected openai,google in providers, got: ${parsed.providers.join(',')}`);
    return false;
  }
  console.log('  ✓ Providers correctly set to openai,google');

  return true;
}

// Test 3: Script exits 2 when requirements file missing
function testScriptMissingRequirementsFile() {
  console.log('Test 3: Script exits 2 when requirements file missing');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
  const fakeScript = path.join(tmpDir, 'provider-aware-sync.js');
  const fakeReqs = path.join(tmpDir, 'nonexistent.js');

  try {
    const originalContent = fs.readFileSync(SYNC_SCRIPT, 'utf8');
    const patched = originalContent.replace(
      /const MODEL_REQUIREMENTS_FILE = path\.join\(__dirname, '\.\.', 'lib', 'core', 'model-requirements\.js\);/,
      `const MODEL_REQUIREMENTS_FILE = '${fakeReqs.replace(/'/g, "\\'")}';`
    );
    fs.writeFileSync(fakeScript, patched);

    const result = runScriptDirect(fakeScript, ['--json', '--providers=openai']);

    if (result.status !== 2) {
      console.log(`  ✗ Expected exit 2, got ${result.status}`);
      console.log(`    Output: ${result.output.slice(0, 300)}`);
      return false;
    }
    console.log('  ✓ Exit code is 2');

    const parsed = JSON.parse(result.output || '{}');
    if (parsed.success !== false) {
      console.log(`  ✗ Expected success: false, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is false');

    if (!parsed.error || !parsed.error.includes('not found')) {
      console.log(`  ✗ Expected error mentioning "not found", got: ${parsed.error}`);
      return false;
    }
    console.log('  ✓ error mentions "not found"');

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

function runScriptDirect(scriptPath, args = [], env = {}) {
  const fullEnv = { ...process.env, ...env };
  try {
    const output = execSync(`node "${scriptPath}" ${args.join(' ')}`, {
      encoding: 'utf8',
      timeout: 30000,
      env: fullEnv,
      cwd: path.join(__dirname, '..')
    });
    return { success: true, output: output.trim(), status: 0 };
  } catch (e) {
    return {
      success: false,
      output: e.stdout?.trim() || '',
      stderr: e.stderr?.trim() || '',
      status: e.status
    };
  }
}

// Test 4: Route dry-run returns structured response
async function testRouteDryRun() {
  console.log('Test 4: POST /api/upstream/sync with { dryRun: true } returns structured JSON');

  const port = 34560 + Math.floor(Math.random() * 1000);
  let serverProc = null;

  try {
    serverProc = spawn('node', ['-e', `
      const { startServer } = require('${SERVER_FILE.replace(/'/g, "\\'")}');
      startServer(${port}).then(() => console.log('READY'));
    `], {
      env: { ...process.env, OMO_PORT: String(port), NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('EADDRINUSE')) {
          clearTimeout(timeout);
          reject(new Error('Port in use: ' + port));
        }
      });
    });

    await new Promise(r => setTimeout(r, 500));

    const res = await httpRequest({
      hostname: 'localhost',
      port,
      path: '/api/upstream/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dryRun: true });

    const parsed = JSON.parse(res.body || '{}');

    if (res.statusCode !== 200) {
      console.log(`  ✗ Expected status 200, got ${res.statusCode}`);
      console.log(`    Body: ${res.body.slice(0, 300)}`);
      return false;
    }
    console.log(`  ✓ Status 200`);

    if (parsed.success !== true) {
      console.log(`  ✗ Expected success: true, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is true');

    if (parsed.dryRun !== true) {
      console.log(`  ✗ Expected dryRun: true, got ${parsed.dryRun}`);
      return false;
    }
    console.log('  ✓ dryRun is true');

    if (!parsed.sourceRef || typeof parsed.sourceRef !== 'object') {
      console.log(`  ✗ Expected sourceRef object`);
      return false;
    }
    console.log('  ✓ sourceRef present');

    if (!Array.isArray(parsed.changedAgents)) {
      console.log(`  ✗ Expected changedAgents array`);
      return false;
    }
    console.log('  ✓ changedAgents is array');

    if (!Array.isArray(parsed.changedCategories)) {
      console.log(`  ✗ Expected changedCategories array`);
      return false;
    }
    console.log('  ✓ changedCategories is array');

    if (!Array.isArray(parsed.warnings)) {
      console.log(`  ✗ Expected warnings array`);
      return false;
    }
    console.log('  ✓ warnings is array');

    if (typeof parsed.summary !== 'string') {
      console.log(`  ✗ Expected summary string`);
      return false;
    }
    console.log(`  ✓ summary: "${parsed.summary}"`);

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }
}

// Test 5: Route returns 500 when script is missing
async function testRouteScriptMissing() {
  console.log('Test 5: Route returns 500 when sync script is missing');

  const port = 34560 + Math.floor(Math.random() * 1000);
  let serverProc = null;

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-route-missing-'));
    const scriptsDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    serverProc = spawn('node', ['-e', `
      const http = require('http');
      const fs = require('fs');
      const path = require('path');
      const originalJoin = path.join;
      const originalExistsSync = fs.existsSync;

      const realServerFile = '${SERVER_FILE.replace(/'/g, "\\'")}';
      const realSyncScript = '${SYNC_SCRIPT.replace(/'/g, "\\'")}';
      const fakeScriptsDir = '${scriptsDir.replace(/'/g, "\\'")}';

      // Patch fs.existsSync to hide the real sync script
      const origExists = fs.existsSync;
      fs.existsSync = function(p) {
        if (typeof p === 'string' && p.includes('provider-aware-sync')) {
          return false;
        }
        return origExists.call(fs, p);
      };

      const { startServer } = require(realServerFile);
      startServer(${port}).then(() => console.log('READY'));
    `], {
      env: { ...process.env, OMO_PORT: String(port), NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await new Promise(r => setTimeout(r, 500));

    const res = await httpRequest({
      hostname: 'localhost',
      port,
      path: '/api/upstream/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dryRun: true });

    const parsed = JSON.parse(res.body || '{}');

    if (res.statusCode !== 500) {
      console.log(`  ✗ Expected status 500, got ${res.statusCode}`);
      console.log(`    Body: ${res.body.slice(0, 300)}`);
      return false;
    }
    console.log(`  ✓ Status 500`);

    if (parsed.success !== false) {
      console.log(`  ✗ Expected success: false, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is false');

    if (!parsed.error || !parsed.error.includes('not found')) {
      console.log(`  ✗ Expected error mentioning "not found", got: ${parsed.error}`);
      return false;
    }
    console.log('  ✓ error mentions "not found"');

    if (!Array.isArray(parsed.warnings) || parsed.warnings.length === 0) {
      console.log(`  ✗ Expected non-empty warnings array`);
      return false;
    }
    console.log('  ✓ warnings present');

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }
}

// Test 6: Script --json with no providers exits 1 with structured error
function testScriptNoProviders() {
  console.log('Test 6: Script --json with no detectable providers exits 1 with structured error');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-noproviders-'));
  const fakeScript = path.join(tmpDir, 'provider-aware-sync.js');

  try {
    const originalContent = fs.readFileSync(SYNC_SCRIPT, 'utf8');
    const parentDir = path.dirname(tmpDir);
    const realReqsDir = path.join(parentDir, 'lib', 'core');
    fs.mkdirSync(realReqsDir, { recursive: true });
    fs.copyFileSync(MODEL_REQS_FILE, path.join(realReqsDir, 'model-requirements.js'));

    const patched = originalContent.replace(
      /function detectProviders\(\) \{/,
      'function detectProviders() { return new Set();\n// disabled:'
    );
    fs.writeFileSync(fakeScript, patched);

    const result = runScriptDirect(fakeScript, ['--json']);

    if (result.status !== 1) {
      console.log(`  ✗ Expected exit 1, got ${result.status}`);
      console.log(`    Output: ${result.output.slice(0, 300)}`);
      return false;
    }
    console.log('  ✓ Exit code is 1');

    const parsed = JSON.parse(result.output || '{}');
    if (parsed.success !== false) {
      console.log(`  ✗ Expected success: false, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is false');

    if (!parsed.warnings || parsed.warnings.length === 0) {
      console.log(`  ✗ Expected non-empty warnings`);
      return false;
    }
    console.log('  ✓ warnings present');

    if (!parsed.error) {
      console.log(`  ✗ Expected error field`);
      return false;
    }
    console.log(`  ✓ error: "${parsed.error}"`);

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) { /* ignore */ }
    try {
      const parentDir = path.dirname(tmpDir);
      const libDir = path.join(parentDir, 'lib');
      if (fs.existsSync(libDir)) fs.rmSync(libDir, { recursive: true });
    } catch (e2) { /* ignore */ }
  }
}

// Test 7: Script --json includes pinned SHA in sourceRef
function testScriptSourceRefSha() {
  console.log('Test 7: Script --json includes pinned SHA in sourceRef');

  const pinnedShaFile = path.join(__dirname, '..', '.omo-upstream-sha');
  let pinnedSha = null;
  try {
    pinnedSha = fs.readFileSync(pinnedShaFile, 'utf8').trim();
  } catch (e) { /* no pinned sha file */ }

  const result = runScript(['--json', '--providers=openai']);
  const parsed = JSON.parse(result.output || '{}');

  if (!parsed.success) {
    console.log(`  ✗ Script failed: ${parsed.error}`);
    return false;
  }

  if (!parsed.sourceRef) {
    console.log(`  ✗ Expected sourceRef object`);
    return false;
  }
  console.log('  ✓ sourceRef present');

  if (pinnedSha && parsed.sourceRef.pinnedSha !== pinnedSha) {
    console.log(`  ✗ Expected pinnedSha: ${pinnedSha}, got: ${parsed.sourceRef.pinnedSha}`);
    return false;
  }

  if (pinnedSha) {
    console.log(`  ✓ pinnedSha: ${parsed.sourceRef.pinnedSha}`);
  } else {
    console.log(`  ℹ No .omo-upstream-sha file; pinnedSha is ${parsed.sourceRef.pinnedSha}`);
  }

  return true;
}

// Test 8: Script --apply --json is disabled and returns structured error
function testScriptApplyDisabled() {
  console.log('Test 8: Script --apply --json is disabled (no mutation)');

  const beforeChecksum = checksumFile(MODEL_REQS_FILE);

  const result = runScript(['--apply', '--json', '--providers=openai']);
  const parsed = JSON.parse(result.output || '{}');

  const afterChecksum = checksumFile(MODEL_REQS_FILE);

  if (beforeChecksum !== afterChecksum) {
    console.log(`  ✗ model-requirements.js was mutated! checksum changed from ${beforeChecksum} to ${afterChecksum}`);
    return false;
  }
  console.log('  ✓ model-requirements.js not mutated (checksum unchanged)');

  if (parsed.success !== false) {
    console.log(`  ✗ Expected success: false, got ${parsed.success}`);
    return false;
  }
  console.log('  ✓ success is false');

  if (parsed.dryRun !== true) {
    console.log(`  ✗ Expected dryRun: true (forced by disabled apply), got ${parsed.dryRun}`);
    return false;
  }
  console.log('  ✓ dryRun is true (apply forced to dry-run)');

  if (!parsed.message || !parsed.message.includes('disabled')) {
    console.log(`  ✗ Expected message containing "disabled", got: ${parsed.message}`);
    return false;
  }
  console.log(`  ✓ message contains "disabled"`);

  if (!parsed.warnings || !parsed.warnings.some(w => w.includes('disabled'))) {
    console.log(`  ✗ Expected warnings containing "disabled"`);
    return false;
  }
  console.log('  ✓ warnings mention disabled');

  return true;
}

// Test 9: Route { dryRun: false } returns 501 with apply-disabled message
async function testRouteApplyDisabled() {
  console.log('Test 9: POST /api/upstream/sync with { dryRun: false } returns 501');

  const port = 34560 + Math.floor(Math.random() * 1000);
  let serverProc = null;

  try {
    serverProc = spawn('node', ['-e', `
      const { startServer } = require('${SERVER_FILE.replace(/'/g, "\\'")}');
      startServer(${port}).then(() => console.log('READY'));
    `], {
      env: { ...process.env, OMO_PORT: String(port), NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('EADDRINUSE')) {
          clearTimeout(timeout);
          reject(new Error('Port in use: ' + port));
        }
      });
    });

    await new Promise(r => setTimeout(r, 500));

    const beforeChecksum = checksumFile(MODEL_REQS_FILE);

    const res = await httpRequest({
      hostname: 'localhost',
      port,
      path: '/api/upstream/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dryRun: false });

    const afterChecksum = checksumFile(MODEL_REQS_FILE);

    if (beforeChecksum !== afterChecksum) {
      console.log(`  ✗ model-requirements.js was mutated!`);
      return false;
    }
    console.log('  ✓ model-requirements.js not mutated');

    const parsed = JSON.parse(res.body || '{}');

    if (res.statusCode !== 501) {
      console.log(`  ✗ Expected status 501, got ${res.statusCode}`);
      console.log(`    Body: ${res.body.slice(0, 300)}`);
      return false;
    }
    console.log(`  ✓ Status 501`);

    if (parsed.success !== false) {
      console.log(`  ✗ Expected success: false, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is false');

    if (parsed.dryRun !== false) {
      console.log(`  ✗ Expected dryRun: false (reflecting request), got ${parsed.dryRun}`);
      return false;
    }
    console.log('  ✓ dryRun is false');

    if (!parsed.error || !parsed.error.includes('disabled')) {
      console.log(`  ✗ Expected error containing "disabled", got: ${parsed.error}`);
      return false;
    }
    console.log('  ✓ error contains "disabled"');

    if (!Array.isArray(parsed.warnings) || !parsed.warnings.some(w => w.includes('disabled'))) {
      console.log(`  ✗ Expected warnings containing "disabled"`);
      return false;
    }
    console.log('  ✓ warnings mention disabled');

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }
}

// Test 10: Route { dryRun: true } still works after apply-disabled fix
async function testRouteDryRunStillWorks() {
  console.log('Test 10: POST /api/upstream/sync with { dryRun: true } still returns 200');

  const port = 34560 + Math.floor(Math.random() * 1000);
  let serverProc = null;

  try {
    serverProc = spawn('node', ['-e', `
      const { startServer } = require('${SERVER_FILE.replace(/'/g, "\\'")}');
      startServer(${port}).then(() => console.log('READY'));
    `], {
      env: { ...process.env, OMO_PORT: String(port), NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('EADDRINUSE')) {
          clearTimeout(timeout);
          reject(new Error('Port in use: ' + port));
        }
      });
    });

    await new Promise(r => setTimeout(r, 500));

    const res = await httpRequest({
      hostname: 'localhost',
      port,
      path: '/api/upstream/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dryRun: true });

    if (res.statusCode !== 200) {
      console.log(`  ✗ Expected status 200, got ${res.statusCode}`);
      return false;
    }
    console.log(`  ✓ Status 200`);

    const parsed = JSON.parse(res.body || '{}');
    if (parsed.success !== true) {
      console.log(`  ✗ Expected success: true, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is true');

    if (parsed.dryRun !== true) {
      console.log(`  ✗ Expected dryRun: true, got ${parsed.dryRun}`);
      return false;
    }
    console.log('  ✓ dryRun is true');

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }
}

// Test 11: Route returns 500 with structured error for unparseable script output
async function testRouteUnparseableOutput() {
  console.log('Test 11: Route returns 500 for unparseable script stdout');

  const port = 34560 + Math.floor(Math.random() * 1000);
  let serverProc = null;

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-unparseable-'));
    const fakeScript = path.join(tmpDir, 'provider-aware-sync.js');
    fs.writeFileSync(fakeScript, `#!/usr/bin/env node\nconsole.log('NOT JSON {{{broken');\nprocess.exit(0);\n`);

    const fakeScriptSafe = fakeScript.replace(/'/g, "'\\''");

    serverProc = spawn('node', ['-e', `
      const path = require('path');
      const fs = require('fs');
      const origJoin = path.join;
      const origExists = fs.existsSync;
      const fakeScript = '${fakeScriptSafe}';
      const realSyncScript = '${SYNC_SCRIPT.replace(/'/g, "\\'")}';

      fs.existsSync = function(p) {
        if (typeof p === 'string' && p.includes('provider-aware-sync')) return true;
        return origExists.call(fs, p);
      };

      const origExecSync = require('child_process').execSync;
      require('child_process').execSync = function(cmd, opts) {
        if (cmd && cmd.includes('provider-aware-sync')) {
          return origExecSync('node "' + fakeScript + '" --json', opts);
        }
        return origExecSync(cmd, opts);
      };

      const { startServer } = require('${SERVER_FILE.replace(/'/g, "\\'")}');
      startServer(${port}).then(() => console.log('READY'));
    `], {
      env: { ...process.env, OMO_PORT: String(port), NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProc.stdout.on('data', (data) => {
        if (data.toString().includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await new Promise(r => setTimeout(r, 500));

    const res = await httpRequest({
      hostname: 'localhost',
      port,
      path: '/api/upstream/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dryRun: true });

    const parsed = JSON.parse(res.body || '{}');

    if (res.statusCode !== 500) {
      console.log(`  ✗ Expected status 500, got ${res.statusCode}`);
      console.log(`    Body: ${res.body.slice(0, 300)}`);
      return false;
    }
    console.log(`  ✓ Status 500`);

    if (parsed.success !== false) {
      console.log(`  ✗ Expected success: false, got ${parsed.success}`);
      return false;
    }
    console.log('  ✓ success is false');

    if (!parsed.error || !parsed.error.includes('parse')) {
      console.log(`  ✗ Expected error containing "parse", got: ${parsed.error}`);
      return false;
    }
    console.log('  ✓ error contains "parse"');

    if (!Array.isArray(parsed.warnings) || !parsed.warnings.some(w => w.includes('Unparseable'))) {
      console.log(`  ✗ Expected warnings containing "Unparseable", got: ${JSON.stringify(parsed.warnings)}`);
      return false;
    }
    console.log('  ✓ warnings contain "Unparseable"');

    if (!Array.isArray(parsed.changedAgents) || parsed.changedAgents.length !== 0) {
      console.log(`  ✗ Expected empty changedAgents`);
      return false;
    }
    console.log('  ✓ changedAgents is empty');

    if (!Array.isArray(parsed.changedCategories) || parsed.changedCategories.length !== 0) {
      console.log(`  ✗ Expected empty changedCategories`);
      return false;
    }
    console.log('  ✓ changedCategories is empty');

    return true;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }
}

function checksumFile(filePath) {
  const crypto = require('crypto');
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Main
async function main() {
  console.log('========================================');
  console.log('Upstream Sync Tests');
  console.log('========================================\n');

  if (!fs.existsSync(SYNC_SCRIPT)) {
    console.error(`✗ Sync script not found: ${SYNC_SCRIPT}`);
    process.exit(1);
  }

  const results = [];

  results.push(testScriptDryRunJson());
  results.push(testScriptProvidersFlag());
  results.push(testScriptMissingRequirementsFile());
  results.push(await testRouteDryRun());
  results.push(await testRouteScriptMissing());
  results.push(testScriptNoProviders());
  results.push(testScriptSourceRefSha());
  results.push(testScriptApplyDisabled());
  results.push(await testRouteApplyDisabled());
  results.push(await testRouteDryRunStillWorks());
  results.push(await testRouteUnparseableOutput());

  console.log('\n========================================');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('========================================');

  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
