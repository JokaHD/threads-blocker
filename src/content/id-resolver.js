/**
 * ID Resolver - resolves username to numeric user_id.
 * Threads API requires numeric user_id, not username.
 */

// Threads usernames are validated upstream to /^[a-zA-Z0-9_.]+$/ — only `.` is
// a regex metachar, so this handles it deterministically. Kept as a helper
// (rather than a hard-coded pattern) so future format changes don't silently
// re-open injection.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class IDResolver {
  constructor() {
    this._cache = new Map();
    this._pending = new Map(); // Prevent duplicate fetches
  }

  /**
   * Resolve username to user_id.
   * @param {string} username
   * @returns {Promise<string|null>} user_id or null if not found
   */
  async resolve(username) {
    // Check cache first
    if (this._cache.has(username)) {
      return this._cache.get(username);
    }

    // Check if already fetching
    if (this._pending.has(username)) {
      return this._pending.get(username);
    }

    // Start fetch
    const promise = this._fetchUserId(username);
    this._pending.set(username, promise);

    try {
      const userId = await promise;
      if (userId) {
        this._cache.set(username, userId);
      }
      return userId;
    } finally {
      this._pending.delete(username);
    }
  }

  /**
   * Fetch user_id from profile page.
   *
   * IMPORTANT: every regex used here MUST include the target username so we
   * never return an unrelated account's id (e.g. a featured widget's owner)
   * as if it belonged to `username`. Silent mis-attribution here means the
   * caller blocks the wrong account.
   */
  async _fetchUserId(username) {
    const uname = escapeRegex(username);

    try {
      // Method 1: Try to find in page HTML (if we're on their profile or they're in feed)
      const fromPage = this._findInPage(username);
      if (fromPage) {
        console.log(`[ThreadBlocker] Found user_id for @${username} in page: ${fromPage}`);
        return fromPage;
      }

      // Method 2: Fetch profile page and extract from script data
      const response = await fetch(`https://www.threads.com/@${username}`, {
        credentials: 'include',
        headers: {
          Accept: 'text/html',
        },
      });

      if (!response.ok) {
        console.warn(
          `[ThreadBlocker] Failed to fetch profile for @${username}: ${response.status}`
        );
        return null;
      }

      const html = await response.text();

      // Pattern A: "username":"<uname>" ... "pk|id|user_id":"<digits>"
      const patternA = html.match(
        new RegExp(`"username"\\s*:\\s*"${uname}"[^}]*"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?`)
      );
      if (patternA) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternA[1]}`);
        return patternA[1];
      }

      // Pattern B: "pk|id|user_id":"<digits>" ... "username":"<uname>"
      const patternB = html.match(
        new RegExp(`"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?[^}]*"username"\\s*:\\s*"${uname}"`)
      );
      if (patternB) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternB[1]}`);
        return patternB[1];
      }

      // Pattern C: fallback with wider gap — <uname> ... "id":"<10+ digits>"
      const patternC = html.match(new RegExp(`${uname}[^}]{0,200}"id"\\s*:\\s*"?(\\d{10,})"?`));
      if (patternC) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternC[1]}`);
        return patternC[1];
      }

      console.warn(`[ThreadBlocker] Could not find user_id for @${username} in profile page`);
      return null;
    } catch (err) {
      console.error(`[ThreadBlocker] Error fetching user_id for @${username}:`, err);
      return null;
    }
  }

  /**
   * Try to find user_id in current page HTML/scripts.
   */
  _findInPage(username) {
    const uname = escapeRegex(username);

    // Look in script tags for user data
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';

      // Pattern: username followed by user_id/pk/id
      const pattern = new RegExp(
        `"username"\\s*:\\s*"${uname}"[^}]*"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?`
      );
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }

      // Reverse pattern: id followed by username
      const pattern2 = new RegExp(
        `"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?[^}]*"username"\\s*:\\s*"${uname}"`
      );
      const match2 = text.match(pattern2);
      if (match2) {
        return match2[1];
      }
    }

    return null;
  }

  /**
   * Pre-populate cache with known mappings.
   */
  setCache(username, userId) {
    this._cache.set(username, userId);
  }

  /**
   * Clear cache.
   */
  clearCache() {
    this._cache.clear();
  }
}
