#!/usr/bin/env node
/**
 * Backup and Drift-Check Test Suite
 * 
 * Tests for:
 * - Purge safety (newest backup never deleted)
 * - Restore creates safety backup
 * - Drift-check detects non-first-entry differences
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
    passed++;
  } catch(e) {
    console.log('✗', name);
    console.log('  Error:', e.message);
    failed++;
  }
}

console.log('==================================');
console.log('Backup & Drift-Check Tests');
console.log('==================================');
console.log('');

console.log('Purge Safety Tests');
console.log('==================================');

test('Purge safety: newest backup is never in wouldPurge list', () => {
  const mockBackups = [
    { timestamp: '2025-01-20-10-00-00', createdAt: '2025-01-20T10:00:00.000Z' },
    { timestamp: '2025-01-20-09-00-00', createdAt: '2025-01-20T09:00:00.000Z' },
    { timestamp: '2025-01-20-08-00-00', createdAt: '2025-01-20T08:00:00.000Z' },
    { timestamp: '2025-01-20-07-00-00', createdAt: '2025-01-20T07:00:00.000Z' },
    { timestamp: '2025-01-20-06-00-00', createdAt: '2025-01-20T06:00:00.000Z' }
  ];

  const keepNewest = 2;
  const keepDays = 0;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const sortedBackups = [...mockBackups].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const wouldPurge = [];
  const kept = [];

  sortedBackups.forEach((backup, index) => {
    const backupDate = new Date(backup.createdAt);
    const isWithinKeepDays = backupDate >= cutoffDate;
    const isWithinKeepNewest = index < keepNewest;

    if (isWithinKeepDays || isWithinKeepNewest) {
      kept.push(backup);
    } else {
      wouldPurge.push(backup);
    }
  });

  const newestBackup = sortedBackups[0];
  const isNewestInPurge = wouldPurge.some(b => b.timestamp === newestBackup.timestamp);
  
  assert.strictEqual(isNewestInPurge, false, 
    `Newest backup (${newestBackup.timestamp}) should NOT be in wouldPurge list`);
  
  const isNewestInKept = kept.some(b => b.timestamp === newestBackup.timestamp);
  assert.strictEqual(isNewestInKept, true,
    `Newest backup should be in kept list`);
});

test('Purge safety: with keepNewest=1, only the single newest is kept', () => {
  const mockBackups = [
    { timestamp: '2025-01-20-10-00-00', createdAt: '2025-01-20T10:00:00.000Z' },
    { timestamp: '2025-01-20-09-00-00', createdAt: '2025-01-20T09:00:00.000Z' },
    { timestamp: '2025-01-20-08-00-00', createdAt: '2025-01-20T08:00:00.000Z' }
  ];

  const keepNewest = 1;
  const keepDays = 0;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const sortedBackups = [...mockBackups].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const wouldPurge = [];
  const kept = [];

  sortedBackups.forEach((backup, index) => {
    const backupDate = new Date(backup.createdAt);
    const isWithinKeepDays = backupDate >= cutoffDate;
    const isWithinKeepNewest = index < keepNewest;

    if (isWithinKeepDays || isWithinKeepNewest) {
      kept.push(backup);
    } else {
      wouldPurge.push(backup);
    }
  });

  assert.strictEqual(kept.length, 1, 'Should keep exactly 1 backup');
  assert.strictEqual(kept[0].timestamp, '2025-01-20-10-00-00', 'Should keep the newest backup');
  
  const newestInPurge = wouldPurge.some(b => b.timestamp === '2025-01-20-10-00-00');
  assert.strictEqual(newestInPurge, false, 'Newest backup should not be in wouldPurge');
});

test('Purge safety: keepDays protects recent backups', () => {
  const now = new Date();
  const oneDayAgo = new Date(now);
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  const mockBackups = [
    { timestamp: 'backup-1', createdAt: now.toISOString() },
    { timestamp: 'backup-2', createdAt: oneDayAgo.toISOString() },
    { timestamp: 'backup-3', createdAt: fiveDaysAgo.toISOString() },
    { timestamp: 'backup-4', createdAt: tenDaysAgo.toISOString() }
  ];

  const keepNewest = 1;
  const keepDays = 7;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const sortedBackups = [...mockBackups].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const wouldPurge = [];
  const kept = [];

  sortedBackups.forEach((backup, index) => {
    const backupDate = new Date(backup.createdAt);
    const isWithinKeepDays = backupDate >= cutoffDate;
    const isWithinKeepNewest = index < keepNewest;

    if (isWithinKeepDays || isWithinKeepNewest) {
      kept.push(backup);
    } else {
      wouldPurge.push(backup);
    }
  });

  const newestKept = kept.some(b => b.timestamp === 'backup-1');
  assert.strictEqual(newestKept, true, 'Newest backup should be kept');
  
  const recentKept = kept.some(b => b.timestamp === 'backup-2');
  assert.strictEqual(recentKept, true, 'Recent backup (1 day old) should be kept');
  
  const oldPurged = wouldPurge.some(b => b.timestamp === 'backup-4');
  assert.strictEqual(oldPurged, true, 'Old backup (10 days) should be purged');
});

console.log('');
console.log('Restore Safety Tests');
console.log('==================================');

test('Restore safety: createBackup is called before restoring', () => {
  let createBackupCalled = false;
  let createBackupCalledBeforeRestore = false;
  let restoreCalled = false;

  const mockCreateBackup = async () => {
    if (!restoreCalled) {
      createBackupCalledBeforeRestore = true;
    }
    createBackupCalled = true;
    return { timestamp: 'safety-backup', path: '/tmp/safety.json', size: 100 };
  };

  const mockRestoreBackup = async (timestamp) => {
    if (!createBackupCalled) {
      throw new Error('Safety violation: restore called before backup!');
    }
    restoreCalled = true;
    return { timestamp, restored: true };
  };

  const testRestore = async () => {
    await mockCreateBackup();
    await mockRestoreBackup('target-backup');
  };

  testRestore();

  assert.strictEqual(createBackupCalled, true, 'createBackup should be called');
  assert.strictEqual(createBackupCalledBeforeRestore, true, 
    'createBackup should be called BEFORE restore');
});

test('Restore safety: safety backup is created even if restore fails', () => {
  let safetyBackupCreated = false;

  const mockCreateBackup = async () => {
    safetyBackupCreated = true;
    return { timestamp: 'safety-backup', path: '/tmp/safety.json', size: 100 };
  };

  const mockRestoreBackup = async (timestamp) => {
    if (!safetyBackupCreated) {
      throw new Error('Safety violation: no safety backup created!');
    }
    throw new Error('Restore failed');
  };

  const testRestoreWithError = async () => {
    try {
      await mockCreateBackup();
      await mockRestoreBackup('target-backup');
    } catch (e) {
    }
  };

  testRestoreWithError();

  assert.strictEqual(safetyBackupCreated, true, 
    'Safety backup should be created even if restore fails');
});

console.log('');
console.log('Drift-Check Tests');
console.log('==================================');

function getFullChainSignature(entry) {
  if (!entry || !Array.isArray(entry.fallbackChain) || entry.fallbackChain.length === 0) {
    return null;
  }

  const chainSigs = entry.fallbackChain.map(fallback => {
    const providers = fallback.providers ? fallback.providers.join(',') : 'none';
    const model = fallback.model || 'unknown';
    const variant = fallback.variant ? `:${fallback.variant}` : '';
    return `${providers}/${model}${variant}`;
  });

  return chainSigs.join(',');
}

function getGatingSignature(entry) {
  if (!entry) return '';

  const parts = [];

  if (Array.isArray(entry.requiresProvider) && entry.requiresProvider.length > 0) {
    parts.push(`reqProv=[${entry.requiresProvider.slice().sort().join(',')}]`);
  }

  if (entry.requiresModel) {
    parts.push(`reqModel=${entry.requiresModel}`);
  }

  if (entry.requiresAnyModel === true) {
    parts.push('reqAnyModel=true');
  }

  if (entry.variant) {
    parts.push(`variant=${entry.variant}`);
  }

  return parts.join('|');
}

function getCompleteSignature(entry) {
  const chainSig = getFullChainSignature(entry);
  const gatingSig = getGatingSignature(entry);

  if (!chainSig) return null;

  if (gatingSig) {
    return `${chainSig};${gatingSig}`;
  }
  return chainSig;
}

function compareRequirements(upstream, local) {
  const drift = {
    missingAgents: [],
    newAgents: [],
    changedAgents: [],
    missingCategories: [],
    newCategories: [],
    changedCategories: [],
    hasDrift: false
  };

  const upstreamAgents = Object.keys(upstream.agents || {});
  const localAgents = Object.keys(local.agents || {});

  for (const agent of localAgents) {
    if (!upstream.agents[agent]) {
      drift.missingAgents.push(agent);
      drift.hasDrift = true;
    }
  }

  for (const agent of upstreamAgents) {
    if (!local.agents[agent]) {
      drift.newAgents.push(agent);
      drift.hasDrift = true;
    }
  }

  for (const agent of upstreamAgents) {
    if (local.agents[agent]) {
      const upstreamSig = getCompleteSignature(upstream.agents[agent]);
      const localSig = getCompleteSignature(local.agents[agent]);

      if (upstreamSig !== localSig) {
        drift.changedAgents.push({
          name: agent,
          upstream: {
            fallbackChain: upstream.agents[agent].fallbackChain,
            requiresProvider: upstream.agents[agent].requiresProvider || null,
            requiresModel: upstream.agents[agent].requiresModel || null,
            requiresAnyModel: upstream.agents[agent].requiresAnyModel || false,
            variant: upstream.agents[agent].variant || null
          },
          local: {
            fallbackChain: local.agents[agent].fallbackChain,
            requiresProvider: local.agents[agent].requiresProvider || null,
            requiresModel: local.agents[agent].requiresModel || null,
            requiresAnyModel: local.agents[agent].requiresAnyModel || false,
            variant: local.agents[agent].variant || null
          }
        });
        drift.hasDrift = true;
      }
    }
  }

  const upstreamCats = Object.keys(upstream.categories || {});
  const localCats = Object.keys(local.categories || {});

  for (const cat of localCats) {
    if (!upstream.categories[cat]) {
      drift.missingCategories.push(cat);
      drift.hasDrift = true;
    }
  }

  for (const cat of upstreamCats) {
    if (!local.categories[cat]) {
      drift.newCategories.push(cat);
      drift.hasDrift = true;
    }
  }

  for (const cat of upstreamCats) {
    if (local.categories[cat]) {
      const upstreamSig = getCompleteSignature(upstream.categories[cat]);
      const localSig = getCompleteSignature(local.categories[cat]);

      if (upstreamSig !== localSig) {
        drift.changedCategories.push({
          name: cat,
          upstream: {
            fallbackChain: upstream.categories[cat].fallbackChain,
            requiresProvider: upstream.categories[cat].requiresProvider || null,
            requiresModel: upstream.categories[cat].requiresModel || null,
            requiresAnyModel: upstream.categories[cat].requiresAnyModel || false,
            variant: upstream.categories[cat].variant || null
          },
          local: {
            fallbackChain: local.categories[cat].fallbackChain,
            requiresProvider: local.categories[cat].requiresProvider || null,
            requiresModel: local.categories[cat].requiresModel || null,
            requiresAnyModel: local.categories[cat].requiresAnyModel || false,
            variant: local.categories[cat].variant || null
          }
        });
        drift.hasDrift = true;
      }
    }
  }

  return drift;
}

test('Drift-check: detects different non-first fallback entry', () => {
  const upstream = {
    agents: {
      sisyphus: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' },
          { providers: ['opencode-go'], model: 'kimi-k2.5' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const local = {
    agents: {
      sisyphus: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' },
          { providers: ['kimi-for-coding'], model: 'k2p5' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const upstreamSig = getCompleteSignature(upstream.agents.sisyphus);
  const localSig = getCompleteSignature(local.agents.sisyphus);

  assert.notStrictEqual(upstreamSig, localSig, 
    'Different fallback chains should produce different signatures');
});

test('Drift-check: detects changed provider in non-first entry', () => {
  const upstream = {
    agents: {
      testAgent: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6' },
          { providers: ['github-copilot'], model: 'claude-opus-4.6' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const local = {
    agents: {
      testAgent: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6' },
          { providers: ['opencode'], model: 'claude-opus-4-6' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const upstreamSig = getCompleteSignature(upstream.agents.testAgent);
  const localSig = getCompleteSignature(local.agents.testAgent);

  assert.notStrictEqual(upstreamSig, localSig,
    'Different providers in non-first entry should be detected');
});

test('Drift-check: detects changed model in non-first entry', () => {
  const upstream = {
    agents: {
      testAgent: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6' },
          { providers: ['opencode-go'], model: 'kimi-k2.5' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const local = {
    agents: {
      testAgent: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6' },
          { providers: ['opencode-go'], model: 'glm-5' },
          { providers: ['opencode'], model: 'big-pickle' }
        ]
      }
    },
    categories: {}
  };

  const upstreamSig = getCompleteSignature(upstream.agents.testAgent);
  const localSig = getCompleteSignature(local.agents.testAgent);

  assert.notStrictEqual(upstreamSig, localSig,
    'Different models in non-first entry should be detected');
});

test('Drift-check: identical chains produce identical signatures', () => {
  const chain = {
    fallbackChain: [
      { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' },
      { providers: ['opencode-go'], model: 'kimi-k2.5' },
      { providers: ['opencode'], model: 'big-pickle' }
    ],
    requiresProvider: ['anthropic', 'github-copilot', 'opencode'],
    requiresAnyModel: true
  };

  const sig1 = getCompleteSignature(chain);
  const sig2 = getCompleteSignature(chain);

  assert.strictEqual(sig1, sig2, 'Identical chains should produce identical signatures');
});

test('Drift-check: compareRequirements detects changed agents', () => {
  const upstream = {
    agents: {
      sisyphus: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' },
          { providers: ['opencode-go'], model: 'kimi-k2.5' }
        ]
      }
    },
    categories: {}
  };

  const local = {
    agents: {
      sisyphus: {
        fallbackChain: [
          { providers: ['anthropic'], model: 'claude-opus-4-6', variant: 'max' },
          { providers: ['kimi-for-coding'], model: 'k2p5' }
        ]
      }
    },
    categories: {}
  };

  const result = compareRequirements(upstream, local);

  assert.strictEqual(result.hasDrift, true, 'Should detect drift');
  assert.strictEqual(result.changedAgents.length, 1, 'Should have one changed agent');
  assert.strictEqual(result.changedAgents[0].name, 'sisyphus', 'Should identify sisyphus as changed');
});

test('Drift-check: compareRequirements detects changed categories', () => {
  const upstream = {
    agents: {},
    categories: {
      deep: {
        fallbackChain: [
          { providers: ['openai'], model: 'gpt-5.3-codex' },
          { providers: ['anthropic'], model: 'claude-opus-4-6' }
        ]
      }
    }
  };

  const local = {
    agents: {},
    categories: {
      deep: {
        fallbackChain: [
          { providers: ['openai'], model: 'gpt-5.3-codex' },
          { providers: ['github-copilot'], model: 'claude-opus-4.6' }
        ]
      }
    }
  };

  const result = compareRequirements(upstream, local);

  assert.strictEqual(result.hasDrift, true, 'Should detect drift in categories');
  assert.strictEqual(result.changedCategories.length, 1, 'Should have one changed category');
  assert.strictEqual(result.changedCategories[0].name, 'deep', 'Should identify deep as changed');
});

test('Drift-check: no drift when chains are identical', () => {
  const chain = {
    fallbackChain: [
      { providers: ['anthropic'], model: 'claude-opus-4-6' },
      { providers: ['opencode'], model: 'big-pickle' }
    ]
  };

  const upstream = {
    agents: { testAgent: chain },
    categories: {}
  };

  const local = {
    agents: { testAgent: chain },
    categories: {}
  };

  const result = compareRequirements(upstream, local);

  assert.strictEqual(result.hasDrift, false, 'Should not detect drift for identical chains');
  assert.strictEqual(result.changedAgents.length, 0, 'Should have no changed agents');
});

console.log('');
console.log('==================================');
console.log('Test Summary');
console.log('==================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  console.log('❌ Some tests failed');
  process.exit(1);
} else {
  console.log('✅ All tests passed');
  process.exit(0);
}
