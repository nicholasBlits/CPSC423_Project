// Parse UGS lobby join code from the URL for friend invites.
// Supports: ?join=CODE, #join=CODE, or /join/CODE path pattern.
// Returns uppercase code (4-12 alphanumeric) or null.

/**
 * Parse join code from URL components
 * @param {string} search - URL search string (e.g., location.search)
 * @param {string} hash - URL hash string (e.g., location.hash)
 * @param {string} pathname - URL pathname (e.g., location.pathname)
 * @returns {string|null} - Uppercase join code or null
 */
function parseJoinCode(search, hash, pathname) {
  // Try query parameter first
  const params = new URLSearchParams(search);
  let value = params.get('join')?.trim();
  
  // Try hash fragment (ONLY with join= prefix, not plain hashes)
  if (!value && hash.startsWith('#join=')) {
    const hashCode = hash.substring(6); // Remove '#join='
    if (hashCode && /^[A-Za-z0-9]{4,12}$/.test(hashCode)) {
      value = hashCode;
    }
  }
  
  // Try path pattern /join/CODE
  if (!value) {
    const pathMatch = pathname.match(/\/join\/([A-Za-z0-9]{4,12})$/);
    if (pathMatch) {
      value = pathMatch[1];
    }
  }
  
  // Validate and uppercase
  if (value && /^[A-Za-z0-9]{4,12}$/.test(value)) {
    return value.toUpperCase();
  }
  
  return null;
}

// Export for Node.js tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseJoinCode };
}

// Attach to window for browser usage
if (typeof window !== 'undefined') {
  window.parseJoinCode = parseJoinCode;
}
