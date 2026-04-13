/**
 * ID Resolver - resolves username to numeric user_id.
 * Threads API requires numeric user_id, not username.
 */

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
   */
  async _fetchUserId(username) {
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

      // Look for user_id in various patterns
      // Pattern 1: "user_id":"12345"
      const match1 = html.match(/"user_id"\s*:\s*"(\d+)"/);
      if (match1) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${match1[1]}`);
        return match1[1];
      }

      // Pattern 2: "pk":"12345" or "id":"12345" near username
      const match2 = html.match(
        new RegExp(`"username"\\s*:\\s*"${username}"[^}]*"(?:pk|id)"\\s*:\\s*"?(\\d+)"?`)
      );
      if (match2) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${match2[1]}`);
        return match2[1];
      }

      // Pattern 3: userID or userId in script
      const match3 = html.match(/"(?:userID|userId|user_id|profileID)"\s*:\s*"?(\d+)"?/);
      if (match3) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${match3[1]}`);
        return match3[1];
      }

      // Pattern 4: props containing id near username context
      const match4 = html.match(new RegExp(`${username}[^}]{0,200}"id"\\s*:\\s*"?(\\d{10,})"?`));
      if (match4) {
        console.log(`[ThreadBlocker] Found user_id for @${username}: ${match4[1]}`);
        return match4[1];
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
    // Look in script tags for user data
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';

      // Pattern: username followed by user_id/pk/id
      const pattern = new RegExp(
        `"username"\\s*:\\s*"${username}"[^}]*"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?`
      );
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }

      // Reverse pattern: id followed by username
      const pattern2 = new RegExp(
        `"(?:pk|id|user_id)"\\s*:\\s*"?(\\d+)"?[^}]*"username"\\s*:\\s*"${username}"`
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
