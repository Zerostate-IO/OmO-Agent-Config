/**
 * Upstream Repository Constants
 * 
 * Centralized source-of-truth for all upstream GitHub repository coordinates.
 * All runtime and script code should import from this module rather than
 * hardcoding repository strings.
 * 
 * IMPORTANT: The upstream repository was renamed from 'oh-my-opencode' to 
 * 'oh-my-openagent', but file names (config, schema) intentionally retain 
 * the original names for backward compatibility.
 */

// Repository coordinates
const UPSTREAM_OWNER = 'code-yeongyu';
const UPSTREAM_REPO = 'oh-my-openagent';
const UPSTREAM_BRANCH = 'dev';

// Computed values
const UPSTREAM_REPO_FULL = `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
const UPSTREAM_GITHUB_URL = `https://github.com/${UPSTREAM_REPO_FULL}`;
const UPSTREAM_RAW_BASE_URL = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}`;
const UPSTREAM_API_BASE_URL = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

// File paths within the upstream repo (names preserved for backward compatibility)
const UPSTREAM_SCHEMA_PATH = 'assets/oh-my-opencode.schema.json';
const UPSTREAM_MODEL_REQUIREMENTS_PATH = 'src/shared/model-requirements.ts';
const UPSTREAM_AGENTS_PATH = 'src/agents';

// User-facing config file names (preserved for backward compatibility with upstream)
const CONFIG_FILE_NAME = 'oh-my-opencode.jsonc';
const SCHEMA_FILE_NAME = 'oh-my-opencode.schema.json';

/**
 * Build a raw content URL for a file in the upstream repo
 * @param {string} filePath - Path within the repository
 * @returns {string} Full URL to raw file content
 */
function buildRawUrl(filePath) {
  return `${UPSTREAM_RAW_BASE_URL}/${filePath}`;
}

/**
 * Build a GitHub API URL for a specific endpoint
 * @param {string} endpoint - API endpoint (e.g., 'contents/src/agents', 'commits/dev')
 * @returns {string} Full GitHub API URL
 */
function buildApiUrl(endpoint) {
  return `${UPSTREAM_API_BASE_URL}/${endpoint}`;
}

/**
 * Get the full URL for the upstream schema file
 * @param {string} [ref] - Git ref (defaults to UPSTREAM_BRANCH)
 * @returns {string} Full URL to schema JSON
 */
function getSchemaUrl(ref = UPSTREAM_BRANCH) {
  return `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${ref}/${UPSTREAM_SCHEMA_PATH}`;
}

/**
 * Get the full URL for the model requirements file
 * @returns {string} Full URL to model-requirements.ts
 */
function getModelRequirementsUrl() {
  return buildRawUrl(UPSTREAM_MODEL_REQUIREMENTS_PATH);
}

/**
 * Get the GitHub API URL for listing agents
 * @returns {string} Full API URL for agents directory
 */
function getAgentsApiUrl() {
  return buildApiUrl(`contents/${UPSTREAM_AGENTS_PATH}?ref=${UPSTREAM_BRANCH}`);
}

/**
 * Get the GitHub API URL for latest commit on default branch
 * @returns {string} Full API URL for commits endpoint
 */
function getCommitsApiUrl() {
  return buildApiUrl(`commits/${UPSTREAM_BRANCH}`);
}

module.exports = {
  // Primary coordinates
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
  UPSTREAM_BRANCH,
  
  // Computed values
  UPSTREAM_REPO_FULL,
  UPSTREAM_GITHUB_URL,
  UPSTREAM_RAW_BASE_URL,
  UPSTREAM_API_BASE_URL,
  
  // File paths
  UPSTREAM_SCHEMA_PATH,
  UPSTREAM_MODEL_REQUIREMENTS_PATH,
  UPSTREAM_AGENTS_PATH,
  
  // Preserved file names
  CONFIG_FILE_NAME,
  SCHEMA_FILE_NAME,
  
  // Helper functions
  buildRawUrl,
  buildApiUrl,
  getSchemaUrl,
  getModelRequirementsUrl,
  getAgentsApiUrl,
  getCommitsApiUrl
};
