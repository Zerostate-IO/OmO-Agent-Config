/**
 * Canonical fallback_models normalization contract
 *
 * Provides utilities to validate, normalize, and sanitize fallback_models
 * configuration for agent configs in an upstream-compatible way.
 *
 * Supports:
 * - String entries: "provider/model-name"
 * - Object entries: { model: "provider/model-name", variant: "high", ... }
 * - Mixed arrays of strings and objects
 * - Unknown fields on object entries are preserved through round-trips
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

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
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
  // Also allows slashes for nested paths (e.g., accounts/fireworks/models/...)
  const model = trimmed.substring(slashIndex + 1);
  const modelPattern = /^[-a-z0-9_.:/]+$/i;
  if (!modelPattern.test(model)) {
    return false;
  }

  return true;
}

/**
 * Extract a model ID string from a fallback entry (string or object).
 *
 * For strings: returns the trimmed string.
 * For objects: returns the `model` property (must be a valid provider/model string).
 *
 * @param {any} entry - Fallback entry (string or object)
 * @returns {string|null} - Extracted model ID or null if invalid
 */
function extractModelId(entry) {
  if (entry == null) {
    return null;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return isProviderModelId(trimmed) ? trimmed : null;
  }

  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const model = entry.model;
    if (typeof model === 'string') {
      const trimmed = model.trim();
      return isProviderModelId(trimmed) ? trimmed : null;
    }
  }

  return null;
}

/**
 * Normalize fallback_models array to ordered unique provider/model strings
 *
 * - Converts single string to array
 * - Handles objects with { model: "provider/name" } — extracts the model string
 * - Trims whitespace from each entry
 * - Filters out invalid entries (non-strings/non-objects, malformed format)
 * - Deduplicates while preserving order (by model ID)
 * - Returns ordered array of valid provider/model ID strings
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

  // Process each entry — extract model ID from strings and objects
  const seen = new Set();
  const result = [];

  for (const entry of arr) {
    const modelId = extractModelId(entry);
    if (modelId === null) {
      continue;
    }

    // Deduplicate while preserving order
    if (!seen.has(modelId)) {
      seen.add(modelId);
      result.push(modelId);
    }
  }

  return result;
}

/**
 * Normalize fallback_models preserving full entry shape (objects stay objects).
 *
 * Unlike normalizeFallbackModels() which returns only strings, this returns
 * the original entry shapes: strings remain strings, objects remain objects
 * with all their properties preserved.
 *
 * - Converts single string to array
 * - Handles objects with { model: "provider/name" }
 * - Deduplicates by model ID, preserving first occurrence's shape
 * - Filters out invalid entries
 *
 * @param {any} fallbackModels - Input value (string, array, or other)
 * @returns {Array<string|Object>} - Normalized array preserving entry shapes
 */
function normalizeFallbackModelsRich(fallbackModels) {
  if (fallbackModels == null) {
    return [];
  }

  let arr;
  if (typeof fallbackModels === 'string') {
    arr = [fallbackModels];
  } else if (Array.isArray(fallbackModels)) {
    arr = fallbackModels;
  } else {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const entry of arr) {
    const modelId = extractModelId(entry);
    if (modelId === null) {
      continue;
    }

    if (!seen.has(modelId)) {
      seen.add(modelId);
      // Preserve original shape: string stays string, object stays object
      if (typeof entry === 'string') {
        result.push(entry.trim());
      } else if (typeof entry === 'object') {
        // Shallow clone to avoid mutation of source
        result.push({ ...entry });
      }
    }
  }

  return result;
}

/**
 * Format a fallback entry as a human-readable label for UI display.
 *
 * For strings: returns the model ID as-is.
 * For objects: returns "model" plus compact metadata badges.
 *
 * @param {string|Object} entry - Fallback entry
 * @returns {string} - Human-readable label (never "[object Object]")
 */
function formatFallbackLabel(entry) {
  if (entry == null) {
    return '';
  }

  if (typeof entry === 'string') {
    return entry;
  }

  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const model = entry.model || '(unknown)';
    const parts = [model];

    if (entry.variant) {
      parts.push(entry.variant);
    }
    if (entry.reasoningEffort) {
      parts.push('reasoning:' + entry.reasoningEffort);
    }

    if (parts.length > 1) {
      return parts[0] + ' (' + parts.slice(1).join(', ') + ')';
    }
    return parts[0];
  }

  // Fallback for unexpected types
  return String(entry);
}

/**
 * Format an upstream fallbackChain entry for display.
 * These entries have { providers: [...], model: "...", variant: "..." } shape.
 *
 * @param {string|Object} entry - Upstream fallback chain entry
 * @returns {string} - Human-readable label
 */
function formatUpstreamFallbackLabel(entry) {
  if (entry == null) {
    return '';
  }

  if (typeof entry === 'string') {
    return entry;
  }

  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const parts = [];

    if (entry.model) {
      parts.push(entry.model);
    }

    if (Array.isArray(entry.providers) && entry.providers.length > 0) {
      parts.push('via ' + entry.providers.join(', '));
    } else if (entry.provider) {
      parts.push('via ' + entry.provider);
    }

    if (entry.variant) {
      parts.push(entry.variant);
    }

    return parts.length > 0 ? parts.join(' ') : JSON.stringify(entry);
  }

  return typeof entry === 'string' ? entry : '';
}

/**
 * Sanitize agent config object by normalizing fallback_models.
 * Preserves object entry shapes through the sanitization.
 *
 * - Normalizes fallback_models using rich preservation
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

  // Normalize fallback_models with rich preservation
  const normalized = normalizeFallbackModelsRich(result.fallback_models);

  if (normalized.length === 0) {
    // Remove key if empty
    delete result.fallback_models;
  } else {
    // Update with normalized array (preserving object shapes)
    result.fallback_models = normalized;
  }

  return result;
}

module.exports = {
  isProviderModelId,
  extractModelId,
  normalizeFallbackModels,
  normalizeFallbackModelsRich,
  formatFallbackLabel,
  formatUpstreamFallbackLabel,
  sanitizeAgentFallbackConfig
};
