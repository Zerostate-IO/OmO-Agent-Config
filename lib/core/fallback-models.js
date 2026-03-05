/**
 * Canonical fallback_models normalization contract
 * 
 * Provides utilities to validate, normalize, and sanitize fallback_models
 * configuration for agent configs in an upstream-compatible way.
 * 
 * @module lib/core/fallback-models
 */

/**
 * Check if a string is a valid provider/model ID format
 * 
 * Valid format: `provider/model-name` where:
 * - provider: alphanumeric, underscore, dot, hyphen
 * - model-name: alphanumeric, underscore, dot, hyphen, colon, slash
 * 
 * @param {any} str - Value to check
 * @returns {boolean} - True if valid provider/model format
 */
function isProviderModelId(str) {
  if (typeof str !== 'string') {
    return false;
  }
  
  // Must be non-empty after trim
  const trimmed = str.trim();
  if (trimmed.length === 0) {
    return false;
  }
  
  // Must contain exactly one slash as separator
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return false;
  }
  
  // Must not have additional slashes (only provider/model format)
  if (trimmed.indexOf('/', slashIndex + 1) !== -1) {
    return false;
  }
  
  // Provider pattern: alphanumeric, underscore, dot, hyphen
  const provider = trimmed.substring(0, slashIndex);
  const providerPattern = /^[-a-z0-9_.]+$/i;
  if (!providerPattern.test(provider)) {
    return false;
  }
  
  // Model pattern: alphanumeric, underscore, dot, hyphen, colon
  // Note: Some model names include colons (e.g., model:variant)
  const model = trimmed.substring(slashIndex + 1);
  const modelPattern = /^[-a-z0-9_.:]+$/i;
  if (!modelPattern.test(model)) {
    return false;
  }
  
  return true;
}

/**
 * Normalize fallback_models array to ordered unique provider/model strings
 * 
 * - Converts single string to array
 * - Trims whitespace from each entry
 * - Filters out invalid entries (non-strings, malformed format)
 * - Deduplicates while preserving order
 * - Returns ordered array of valid provider/model IDs
 * 
 * @param {any} fallbackModels - Input value (string, array, or other)
 * @returns {string[]} - Normalized array of valid provider/model IDs
 */
function normalizeFallbackModels(fallbackModels) {
  // Handle null/undefined
  if (fallbackModels == null) {
    return [];
  }
  
  // Convert single string to array
  let arr;
  if (typeof fallbackModels === 'string') {
    arr = [fallbackModels];
  } else if (Array.isArray(fallbackModels)) {
    arr = fallbackModels;
  } else {
    // Invalid type
    return [];
  }
  
  // Process each entry
  const seen = new Set();
  const result = [];
  
  for (const entry of arr) {
    // Skip non-strings
    if (typeof entry !== 'string') {
      continue;
    }
    
    // Trim whitespace
    const trimmed = entry.trim();
    
    // Skip empty strings
    if (trimmed.length === 0) {
      continue;
    }
    
    // Validate provider/model format
    if (!isProviderModelId(trimmed)) {
      continue;
    }
    
    // Deduplicate while preserving order
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  
  return result;
}

/**
 * Sanitize agent config object by normalizing fallback_models
 * 
 * - Normalizes fallback_models to ordered unique array
 * - Removes fallback_models key if result is empty
 * - Returns new object (does not mutate input)
 * 
 * @param {Object} agentConfig - Agent configuration object
 * @returns {Object} - Sanitized agent configuration
 */
function sanitizeAgentFallbackConfig(agentConfig) {
  if (typeof agentConfig !== 'object' || agentConfig === null) {
    return {};
  }
  
  // Create shallow copy
  const result = { ...agentConfig };
  
  // Check if fallback_models exists
  if (!Object.prototype.hasOwnProperty.call(result, 'fallback_models')) {
    return result;
  }
  
  // Normalize fallback_models
  const normalized = normalizeFallbackModels(result.fallback_models);
  
  if (normalized.length === 0) {
    // Remove key if empty
    delete result.fallback_models;
  } else {
    // Update with normalized array
    result.fallback_models = normalized;
  }
  
  return result;
}

module.exports = {
  isProviderModelId,
  normalizeFallbackModels,
  sanitizeAgentFallbackConfig
};
