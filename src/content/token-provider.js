/**
 * Token Provider - extracts authentication tokens from Threads page.
 *
 * Required tokens:
 * - csrftoken: from cookie
 * - fb_dtsg: from page HTML/scripts
 * - lsd: from page HTML/scripts
 */

export class TokenProvider {
  constructor() {
    this._tokens = null;
  }

  /**
   * Get all tokens needed for API calls.
   * @returns {Promise<{csrftoken: string, fb_dtsg: string, lsd: string}>}
   */
  async getTokens() {
    if (this._tokens) return this._tokens;
    return this.refreshTokens();
  }

  /**
   * Refresh tokens from page.
   */
  async refreshTokens() {
    const csrftoken = this._getCsrfToken();
    const fb_dtsg = this._getFbDtsg();
    const lsd = this._getLsd();

    if (!csrftoken) {
      throw new Error('Unable to extract csrftoken from cookies');
    }

    this._tokens = { csrftoken, fb_dtsg, lsd };
    return this._tokens;
  }

  /**
   * Invalidate cached tokens.
   */
  invalidate() {
    this._tokens = null;
  }

  /**
   * Get CSRF token from cookie.
   */
  _getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Get fb_dtsg token from page.
   * This token is embedded in the page HTML in various places.
   */
  _getFbDtsg() {
    // Try to find in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';

      // Pattern 1: "DTSGInitialData",[],{"token":"..."}
      const match1 = text.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);
      if (match1) return match1[1];

      // Pattern 2: dtsg":{"token":"..."}
      const match2 = text.match(/dtsg":\{"token":"([^"]+)"/);
      if (match2) return match2[1];

      // Pattern 3: fb_dtsg" value="..."
      const match3 = text.match(/fb_dtsg"?\s*(?:value=|:)\s*"([^"]+)"/);
      if (match3) return match3[1];
    }

    // Try hidden input
    const input = document.querySelector('input[name="fb_dtsg"]');
    if (input) return input.value;

    return null;
  }

  /**
   * Get LSD token from page.
   */
  _getLsd() {
    // Try to find in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';

      // Pattern: "LSD",[],{"token":"..."}
      const match1 = text.match(/"LSD",\[\],\{"token":"([^"]+)"/);
      if (match1) return match1[1];

      // Pattern: lsd" value="..." or "lsd":"..."
      const match2 = text.match(/["\s]lsd"?\s*(?:value=|:)\s*"([^"]+)"/);
      if (match2) return match2[1];
    }

    // Try hidden input
    const input = document.querySelector('input[name="lsd"]');
    if (input) return input.value;

    return null;
  }

  // Legacy method for compatibility
  async getToken() {
    const tokens = await this.getTokens();
    return tokens.csrftoken;
  }
}
