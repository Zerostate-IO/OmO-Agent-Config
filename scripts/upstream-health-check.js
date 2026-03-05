#!/usr/bin/env node

/**
 * Unified Upstream Health Check Script
 * Aggregates drift-check JSON output + lib/upstream.js schema check
 * into one consolidated health report with actionRequired[] array.
 *
 * Usage: node scripts/upstream-health-check.js [--json] [--strict]
 *
 * Exit codes:
 *   0 - No actions required (healthy)
 *   1 - Actions required (drift or schema issues)
 *   2 - Network error
 *   3 - Upstream unresolved (strict mode only)
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// Import upstream schema checker
let checkAndUpdateOhMyOpenCodeSchema;
try {
  const upstream = require('../lib/upstream');
  checkAndUpdateOhMyOpenCodeSchema = upstream.checkAndUpdateOhMyOpenCodeSchema;
} catch (e) {
  console.error('Failed to load lib/upstream.js:', e.message);
  process.exit(2);
}

// Configuration
const DRIFT_CHECK_SCRIPT = path.join(__dirname, 'drift-check.js');
const CACHE_DIR = path.join(os.homedir(), '.config', 'opencode', 'cache');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Run drift-check and capture JSON output
 * @param {boolean} strictUpstream - Use --strict-upstream flag
 * @returns {Object} Parsed drift-check output
 */
function runDriftCheck(strictUpstream = false) {
  try {
    const args = ['--json'];
    if (strictUpstream) {
      args.push('--strict-upstream');
    }
    
    const cmd = `node "${DRIFT_CHECK_SCRIPT}" ${args.join(' ')}`;
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    return {
      success: true,
      data: JSON.parse(output)
    };
  } catch (e) {
    // If exit code is non-zero, still try to parse the output
    if (e.stdout) {
      try {
        return {
          success: false,
          exitCode: e.status || 1,
          data: JSON.parse(e.stdout)
        };
      } catch (parseError) {
        return {
          success: false,
          exitCode: e.status || 2,
          error: e.message,
          data: null
        };
      }
    }
    
    return {
      success: false,
      exitCode: e.status || 2,
      error: e.message,
      data: null
    };
  }
}

/**
 * Run upstream schema check
 * @returns {Promise<Object>} Schema check result
 */
async function runSchemaCheck() {
  try {
    const result = await checkAndUpdateOhMyOpenCodeSchema({ cacheDir: CACHE_DIR });
    return {
      valid: true,
      updated: result.updated,
      tag: result.tag,
      url: result.url,
      diff: result.diff,
      error: null
    };
  } catch (e) {
    return {
      valid: false,
      updated: false,
      tag: null,
      url: null,
      diff: null,
      error: e.message
    };
  }
}

/**
 * Build unified actionRequired array from both checks
 * @param {Object} driftResult - Drift check result
 * @param {Object} schemaResult - Schema check result
 * @returns {Array<string>} List of actions required
 */
function buildActionRequired(driftResult, schemaResult) {
  const actions = [];
  
  // Drift-related actions
  if (driftResult) {
    if (driftResult.hasDrift) {
      actions.push('drift detected');
    }
    
    if (driftResult.newAgents && driftResult.newAgents.length > 0) {
      for (const agent of driftResult.newAgents) {
        actions.push(`add agent ${agent}`);
      }
    }
    
    if (driftResult.missingAgents && driftResult.missingAgents.length > 0) {
      for (const agent of driftResult.missingAgents) {
        actions.push(`remove agent ${agent} (no longer in upstream)`);
      }
    }
    
    if (driftResult.changedAgents && driftResult.changedAgents.length > 0) {
      for (const change of driftResult.changedAgents) {
        actions.push(`update chain for agent ${change.name}`);
      }
    }
    
    if (driftResult.newCategories && driftResult.newCategories.length > 0) {
      for (const cat of driftResult.newCategories) {
        actions.push(`add category ${cat}`);
      }
    }
    
    if (driftResult.missingCategories && driftResult.missingCategories.length > 0) {
      for (const cat of driftResult.missingCategories) {
        actions.push(`remove category ${cat} (no longer in upstream)`);
      }
    }
    
    if (driftResult.changedCategories && driftResult.changedCategories.length > 0) {
      for (const change of driftResult.changedCategories) {
        actions.push(`update chain for category ${change.name}`);
      }
    }
    
    if (driftResult.upstreamResolved === false) {
      actions.push('upstream unresolved - network or fetch failure');
    }
  }
  
  // Schema-related actions
  if (schemaResult) {
    if (!schemaResult.valid) {
      actions.push('schema check failed');
    }
    
    if (schemaResult.diff && schemaResult.diff.hasChanges) {
      if (schemaResult.diff.agents && schemaResult.diff.agents.added && schemaResult.diff.agents.added.length > 0) {
        actions.push(`new agents in schema: ${schemaResult.diff.agents.added.join(', ')}`);
      }
      if (schemaResult.diff.agents && schemaResult.diff.agents.removed && schemaResult.diff.agents.removed.length > 0) {
        actions.push(`removed agents in schema: ${schemaResult.diff.agents.removed.join(', ')}`);
      }
      if (schemaResult.diff.skills && schemaResult.diff.skills.added && schemaResult.diff.skills.added.length > 0) {
        actions.push(`new skills in schema: ${schemaResult.diff.skills.added.join(', ')}`);
      }
      if (schemaResult.diff.skills && schemaResult.diff.skills.removed && schemaResult.diff.skills.removed.length > 0) {
        actions.push(`removed skills in schema: ${schemaResult.diff.skills.removed.join(', ')}`);
      }
    }
  }
  
  // Deduplicate actions
  return [...new Set(actions)];
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const strictMode = args.includes('--strict');
  
  // Build unified report
  const report = {
    timestamp: new Date().toISOString(),
    drift: null,
    schema: null,
    actionRequired: []
  };
  
  if (!jsonOutput) {
    console.log(`${colors.cyan}🔍 OmO Upstream Health Check${colors.reset}`);
    console.log('');
  }
  
  // Run drift check
  if (!jsonOutput) {
    console.log(`${colors.gray}Running drift check...${colors.reset}`);
  }
  
  const driftResult = runDriftCheck(strictMode);
  
  if (driftResult.data) {
    report.drift = driftResult.data;
    
    // Handle strict upstream failure
    if (strictMode && driftResult.exitCode === 3) {
      report.actionRequired = ['upstream SHA could not be resolved (strict mode)'];
      
      if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.error(`${colors.red}❌ [STRICT] Upstream SHA could not be resolved${colors.reset}`);
      }
      process.exit(3);
    }
  } else {
    report.drift = {
      error: driftResult.error || 'Unknown error',
      hasDrift: false,
      upstreamResolved: false,
      unresolvedReason: driftResult.error
    };
    
    // Network error exit code
    if (driftResult.exitCode === 2) {
      if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.error(`${colors.red}❌ Network error during drift check${colors.reset}`);
      }
      process.exit(2);
    }
  }
  
  // Run schema check
  if (!jsonOutput) {
    console.log(`${colors.gray}Running schema check...${colors.reset}`);
  }
  
  const schemaResult = await runSchemaCheck();
  report.schema = {
    valid: schemaResult.valid,
    updated: schemaResult.updated,
    tag: schemaResult.tag,
    error: schemaResult.error
  };
  
  // Build actionRequired array
  report.actionRequired = buildActionRequired(report.drift, report.schema);
  
  // Determine exit code
  const hasActions = report.actionRequired.length > 0;
  
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(hasActions ? 1 : 0);
  }
  
  // Human-readable output
  console.log('');
  console.log(`${colors.cyan}📊 Health Check Results:${colors.reset}`);
  console.log('');
  
  // Drift status
  if (report.drift) {
    if (report.drift.hasDrift) {
      console.log(`${colors.yellow}⚠ Drift: DETECTED${colors.reset}`);
    } else if (report.drift.upstreamResolved === false) {
      console.log(`${colors.yellow}⚠ Drift: UNRESOLVED (${report.drift.unresolvedReason})${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Drift: OK (in sync)${colors.reset}`);
    }
  }
  
  // Schema status
  if (report.schema) {
    if (!report.schema.valid) {
      console.log(`${colors.red}✗ Schema: ERROR (${report.schema.error})${colors.reset}`);
    } else if (report.schema.updated) {
      console.log(`${colors.green}✓ Schema: UPDATED (tag: ${report.schema.tag})${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Schema: OK (tag: ${report.schema.tag})${colors.reset}`);
    }
  }
  
  console.log('');
  
  // Actions required
  if (hasActions) {
    console.log(`${colors.yellow}📋 Actions Required:${colors.reset}`);
    for (const action of report.actionRequired) {
      console.log(`   - ${action}`);
    }
    console.log('');
    
    if (strictMode) {
      console.log(`${colors.red}❌ Health check FAILED - actions required${colors.reset}`);
      process.exit(1);
    } else {
      console.log(`${colors.yellow}⚠ Health check completed with warnings${colors.reset}`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.green}✅ Health check PASSED - no actions required${colors.reset}`);
    process.exit(0);
  }
}

// Run main
main().catch(e => {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  
  const report = {
    timestamp: new Date().toISOString(),
    drift: null,
    schema: null,
    actionRequired: ['unexpected error: ' + e.message],
    error: e.message
  };
  
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error(`${colors.red}❌ Unexpected error: ${e.message}${colors.reset}`);
  }
  process.exit(2);
});
