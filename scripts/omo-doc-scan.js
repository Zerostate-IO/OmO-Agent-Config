#!/usr/bin/env node

/**
 * Oh My Opencode Documentation Scanner
 * Fetches upstream Markdown docs and extracts explicit "discouraged model" signals
 * 
 * Usage: node scripts/omo-doc-scan.js [--json] [--verbose]
 * 
 * Exit codes:
 *   0 - Success (or graceful degradation on network error)
 *   1 - Invalid arguments
 *   2 - Fatal error
 */

const https = require('https');
const {
  UPSTREAM_API_BASE_URL,
  UPSTREAM_BRANCH
} = require('../lib/upstream-constants');

// Configuration (uses centralized upstream constants)
const GITHUB_API_BASE = UPSTREAM_API_BASE_URL;
const DOCS_PATH = '/contents/docs';
const REF = UPSTREAM_BRANCH;

// Keywords that indicate discouraged model signals
const WARNING_KEYWORDS = [
  'avoid',
  'discouraged',
  'not recommended',
  'warning',
  'do not use',
  'deprecated',
  'not supported',
  'issues with',
  'problems with',
  'unreliable',
  'poor performance',
  'not suitable'
];

// Model name patterns to detect
const MODEL_PATTERNS = [
  // OpenAI models
  /\bgpt-?4\b/gi,
  /\bgpt-?3\.?5\b/gi,
  /\bo1\b/gi,
  /\bo3\b/gi,
  // Anthropic models
  /\bclaude-?3[\w-]*/gi,
  /\bclaude-?opus\b/gi,
  /\bclaude-?sonnet\b/gi,
  /\bclaude-?haiku\b/gi,
  // Google models
  /\bgemini-?[\w-]*/gi,
  /\bgemini-?pro\b/gi,
  /\bgemini-?flash\b/gi,
  // Other providers
  /\bgrok-?[\w-]*/gi,
  /\bdeepseek-?[\w-]*/gi,
  /\bllama-?[\w-]*/gi,
  /\bmistral-?[\w-]*/gi,
  /\bqwen-?[\w-]*/gi,
  /\bcodestral\b/gi,
  // Generic patterns
  /\bopenai\/\w+/gi,
  /\banthropic\/\w+/gi,
  /\bgoogle\/\w+/gi,
  /\bxai\/\w+/gi,
  /\bdeepseek\/\w+/gi,
  /\bmeta\/\w+/gi,
  /\bmistral\/\w+/gi,
  /\balibaba\/\w+/gi
];

// Severity mapping based on keyword intensity
const SEVERITY_MAP = {
  'avoid': 'avoid',
  'discouraged': 'avoid',
  'do not use': 'avoid',
  'not recommended': 'warning',
  'warning': 'warning',
  'deprecated': 'warning',
  'not supported': 'warning',
  'issues with': 'warning',
  'problems with': 'warning',
  'unreliable': 'warning',
  'poor performance': 'warning',
  'not suitable': 'warning'
};

/**
 * Fetch content from HTTPS URL
 * @param {string} url - URL to fetch
 * @param {Object} options - Additional request options
 * @returns {Promise<string>} Response body
 */
function fetchHttps(url, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      timeout: 15000,
      headers: {
        'User-Agent': 'OmO-Doc-Scanner/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      },
      ...options
    };

    const req = https.get(url, reqOptions, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        fetchHttps(redirectUrl, options).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Fetch JSON from HTTPS URL
 * @param {string} url - URL to fetch
 * @param {Object} options - Additional request options
 * @returns {Promise<Object>} Parsed JSON
 */
async function fetchJson(url, options = {}) {
  const data = await fetchHttps(url, options);
  try {
    return JSON.parse(data);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e.message}`);
  }
}

/**
 * Recursively fetch all markdown files from docs directory
 * @param {string} path - API path to fetch
 * @param {string} basePath - Base path for constructing source references
 * @returns {Promise<Array>} Array of file objects with path and download_url
 */
async function fetchDocsListing(path = DOCS_PATH, basePath = 'docs') {
  const url = `${GITHUB_API_BASE}${path}?ref=${REF}`;
  const items = await fetchJson(url);
  
  const files = [];
  
  for (const item of items) {
    if (item.type === 'file' && item.name.endsWith('.md')) {
      files.push({
        name: item.name,
        path: `${basePath}/${item.name}`,
        download_url: item.download_url,
        html_url: item.html_url
      });
    } else if (item.type === 'dir') {
      // Recursively fetch subdirectory
      const subFiles = await fetchDocsListing(
        `${path}/${item.name}`,
        `${basePath}/${item.name}`
      );
      files.push(...subFiles);
    }
  }
  
  return files;
}

/**
 * Extract model mentions from text
 * @param {string} text - Text to scan
 * @returns {Array} Array of model names found
 */
function extractModelMentions(text) {
  const mentions = new Set();
  
  for (const pattern of MODEL_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        mentions.add(m.toLowerCase().trim());
      }
    }
  }
  
  return Array.from(mentions);
}

/**
 * Determine severity based on keyword
 * @param {string} keyword - Matched keyword
 * @returns {string} Severity level
 */
function getSeverity(keyword) {
  const normalized = keyword.toLowerCase().trim();
  return SEVERITY_MAP[normalized] || 'warning';
}

/**
 * Extract provider from model name
 * @param {string} model - Model name
 * @returns {string|null} Provider name or null
 */
function extractProvider(model) {
  const providerMap = {
    'gpt': 'openai',
    'o1': 'openai',
    'o3': 'openai',
    'claude': 'anthropic',
    'gemini': 'google',
    'grok': 'xai',
    'deepseek': 'deepseek',
    'llama': 'meta',
    'mistral': 'mistral',
    'codestral': 'mistral',
    'qwen': 'alibaba'
  };
  
  // Check for provider/model format
  if (model.includes('/')) {
    const provider = model.split('/')[0];
    return provider;
  }
  
  // Check against known prefixes
  for (const [prefix, provider] of Object.entries(providerMap)) {
    if (model.toLowerCase().includes(prefix)) {
      return provider;
    }
  }
  
  return null;
}

/**
 * Scan markdown content for discouraged model signals
 * @param {string} content - Markdown content
 * @param {string} source - Source file path
 * @returns {Array} Array of entry objects
 */
function scanContent(content, source) {
  const entries = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for warning keywords in this line
    for (const keyword of WARNING_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      
      if (regex.test(line)) {
        // Found a warning keyword, now look for model mentions
        // Check current line and surrounding context (2 lines before and after)
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(lines.length, i + 3);
        const contextLines = lines.slice(contextStart, contextEnd);
        const contextText = contextLines.join(' ');
        
        const models = extractModelMentions(contextText);
        
        if (models.length > 0) {
          for (const model of models) {
            const provider = extractProvider(model);
            
            entries.push({
              model: model,
              provider: provider,
              reason: `Found "${keyword}" in context with model mention`,
              source: source,
              line: lineNum,
              severity: getSeverity(keyword),
              context: contextText.substring(0, 200).trim()
            });
          }
        }
        
        // Break after first match to avoid duplicate entries for same line
        break;
      }
    }
  }
  
  return entries;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  // Validate arguments
  const validArgs = ['--json', '--verbose', '-v', '-h', '--help'];
  const invalidArgs = args.filter(arg => !validArgs.includes(arg) && !arg.startsWith('-'));
  if (invalidArgs.length > 0 && !jsonOutput) {
    console.error(`Unknown arguments: ${invalidArgs.join(', ')}`);
    console.error('Usage: node scripts/omo-doc-scan.js [--json] [--verbose]');
    process.exit(1);
  }
  
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Oh My Opencode Documentation Scanner');
    console.log('');
    console.log('Usage: node scripts/omo-doc-scan.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --json       Output only JSON (machine-readable)');
    console.log('  --verbose    Show progress messages');
    console.log('  -h, --help   Show this help message');
    console.log('');
    console.log('Scans upstream Oh My Opencode documentation for explicit');
    console.log('"discouraged model" signals and outputs structured data.');
    process.exit(0);
  }
  
  const result = {
    entries: [],
    summary: '',
    sources: [],
    generatedAt: new Date().toISOString()
  };
  
  try {
    if (verbose && !jsonOutput) {
      console.error('Fetching docs directory listing...');
    }
    
    // Fetch all markdown files from docs directory
    let files;
    try {
      files = await fetchDocsListing();
    } catch (e) {
      if (verbose && !jsonOutput) {
        console.error(`Network error fetching directory: ${e.message}`);
      }
      result.summary = `Failed to fetch docs listing: ${e.message}`;
      result.sources = [];
      
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error('Network error - could not fetch documentation');
        console.error(result.summary);
      }
      process.exit(0); // Graceful exit
    }
    
    result.sources = files.map(f => f.path);
    
    if (verbose && !jsonOutput) {
      console.error(`Found ${files.length} markdown files to scan`);
    }
    
    // Scan each file
    for (const file of files) {
      if (verbose && !jsonOutput) {
        console.error(`Scanning ${file.path}...`);
      }
      
      try {
        const content = await fetchHttps(file.download_url);
        const entries = scanContent(content, file.path);
        result.entries.push(...entries);
      } catch (e) {
        if (verbose && !jsonOutput) {
          console.error(`  Warning: Failed to fetch ${file.path}: ${e.message}`);
        }
        // Continue with other files
      }
    }
    
    // Generate summary
    if (result.entries.length === 0) {
      result.summary = `No explicit discouraged model signals found across ${files.length} documents`;
    } else {
      const avoidCount = result.entries.filter(e => e.severity === 'avoid').length;
      const warningCount = result.entries.filter(e => e.severity === 'warning').length;
      const uniqueModels = new Set(result.entries.map(e => e.model)).size;
      
      result.summary = `Found ${result.entries.length} discouraged model signals (${avoidCount} avoid, ${warningCount} warning) across ${files.length} documents, affecting ${uniqueModels} unique models`;
    }
    
    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Oh My Opencode Documentation Scan Results');
      console.log('=========================================\n');
      console.log(result.summary);
      console.log(`\nGenerated at: ${result.generatedAt}`);
      console.log(`\nSources scanned (${result.sources.length}):`);
      for (const s of result.sources) {
        console.log(`  - ${s}`);
      }
      
      if (result.entries.length > 0) {
        console.log(`\nEntries found (${result.entries.length}):\n`);
        
        // Group by severity
        const avoidEntries = result.entries.filter(e => e.severity === 'avoid');
        const warningEntries = result.entries.filter(e => e.severity === 'warning');
        
        if (avoidEntries.length > 0) {
          console.log('AVOID:');
          for (const e of avoidEntries) {
            console.log(`  [${e.source}:${e.line}] ${e.model}${e.provider ? ` (${e.provider})` : ''}`);
            console.log(`    Reason: ${e.reason}`);
          }
          console.log('');
        }
        
        if (warningEntries.length > 0) {
          console.log('WARNINGS:');
          for (const e of warningEntries) {
            console.log(`  [${e.source}:${e.line}] ${e.model}${e.provider ? ` (${e.provider})` : ''}`);
            console.log(`    Reason: ${e.reason}`);
          }
        }
      } else {
        console.log('\nNo discouraged model signals detected.');
      }
    }
    
    process.exit(0);
    
  } catch (e) {
    if (jsonOutput) {
      result.summary = `Fatal error: ${e.message}`;
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Fatal error: ${e.message}`);
    }
    process.exit(2);
  }
}

// Run main
main().catch(e => {
  console.error(`Unexpected error: ${e.message}`);
  process.exit(2);
});
