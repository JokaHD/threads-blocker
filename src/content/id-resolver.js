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
   * Discriminated return so the caller can tell network failure apart from
   * "user genuinely doesn't exist" — the former should retry, the latter shouldn't.
   *
   * @param {string} username
   * @returns {Promise<{userId: string|null, transient: boolean}>}
   *   - `{ userId: '123', transient: false }` — resolved
   *   - `{ userId: null,  transient: false }` — permanent miss (404, pattern not found)
   *   - `{ userId: null,  transient: true  }` — transient (fetch throw, 5xx, 429)
   */
  async resolve(username) {
    // Check cache first
    if (this._cache.has(username)) {
      return { userId: this._cache.get(username), transient: false };
    }

    // Check if already fetching
    if (this._pending.has(username)) {
      return this._pending.get(username);
    }

    // Start fetch
    const promise = this._fetchUserId(username);
    this._pending.set(username, promise);

    try {
      const result = await promise;
      if (result.userId) {
        this._cache.set(username, result.userId);
      }
      return result;
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
        return { userId: fromPage, transient: false };
      }

      // Method 2: Fetch profile page and extract from script data
      const response = await fetch(`https://www.threads.com/@${username}`, {
        credentials: 'include',
        headers: {
          Accept: 'text/html',
        },
      });

      if (!response.ok) {
        // 5xx / 429 → transient; 4xx (esp. 404) → permanent
        const transient = response.status >= 500 || response.status === 429;
        console.warn(
          `[ThreadBlocker] Failed to fetch profile for @${username}: ${response.status} (transient=${transient})`
        );
        return { userId: null, transient };
      }

      const html = await response.text();

      // Pattern A: "username":"<uname>" ... "pk|id|user_id":"<digits>"
      const patternA = html.match(
        new RegExp(`"username"\\s*:\\s*"${uname}"[^}]*"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?`)
      );
      if (patternA) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternA[1]}`);
        return { userId: patternA[1], transient: false };
      }

      // Pattern B: "pk|id|user_id":"<digits>" ... "username":"<uname>"
      const patternB = html.match(
        new RegExp(`"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?[^}]*"username"\\s*:\\s*"${uname}"`)
      );
      if (patternB) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternB[1]}`);
        return { userId: patternB[1], transient: false };
      }

      // Pattern C: fallback with wider gap — <uname> ... "id":"<10+ digits>"
      const patternC = html.match(new RegExp(`${uname}[^}]{0,200}"id"\\s*:\\s*"?(\\d{10,})"?`));
      if (patternC) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${patternC[1]}`);
        return { userId: patternC[1], transient: false };
      }

      console.warn(`[ThreadBlocker] Could not find user_id for @${username} in profile page`);
      return { userId: null, transient: false };
    } catch (err) {
      // fetch throw (network offline / DNS / CORS) → transient
      console.error(`[ThreadBlocker] Error fetching user_id for @${username}:`, err);
      return { userId: null, transient: true };
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
