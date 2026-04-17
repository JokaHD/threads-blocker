/**
 * DOM Observer for detecting comments.
 * Uses site adapter for Threads-specific logic.
 */

import { getSiteRule } from './site-adapter.js';

const COMMENT_ID_ATTR = 'data-tb-comment-id';

export class DOMObserver {
  constructor() {
    this._observer = null;
    this._urlObserver = null;
    this._onNewComments = null;
    this._debounceTimer = null;
    this._lastUrl = location.href;
    this._siteRule = null;
  }

  /**
   * Initialize with site rule.
   */
  init() {
    this._siteRule = getSiteRule();
    if (!this._siteRule) {
      console.warn('[ThreadBlocker] No site rule matched for', location.href);
    }
  }

  /**
   * Find comments in the DOM.
   * For each unique username (text link, not avatar), finds the container.
   * @param {Element} root - Root element to search within
   * @returns {Array<{username: string, container: Element, link: Element}>}
   */
  findComments(root = document.body) {
    if (!this._siteRule) return [];

    const links = root.querySelectorAll(this._siteRule.usernameSelector);
    const results = [];
    const seenUsernames = new Set();

    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this._siteRule.extractUsername(href);
      if (!username) continue;

      // Skip avatar links (we want text links only)
      if (this._siteRule.isAvatarLink(link)) continue;

      // Skip duplicates
      if (seenUsernames.has(username)) continue;
      seenUsernames.add(username);

      // Find container
      const container = this._siteRule.findContainer(link);
      if (!container) continue;

      // Skip already processed
      if (container.hasAttribute(COMMENT_ID_ATTR)) continue;

      results.push({
        username,
        container,
        link,
      });
    }

    return results;
  }

  /**
   * Mark a container as processed.
   * @param {Element} container
   * @param {string} username
   */
  markProcessed(container, username) {
    container.setAttribute(COMMENT_ID_ATTR, username);
  }

  /**
   * Start observing DOM for new comments.
   * @param {function} onNewComments - Callback with array of new comments
   */
  startObserving(onNewComments) {
    if (!this._siteRule) {
      this.init();
    }

    this._onNewComments = onNewComments;

    // Main DOM observer with debounce
    this._observer = new MutationObserver(() => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._scan(), 100);
    });

    this._observer.observe(
      this._siteRule?.getObserveTarget() || document.body,
      this._siteRule?.observeConfig || { childList: true, subtree: true }
    );

    // URL change observer for SPA navigation
    this._urlObserver = new MutationObserver(() => {
      if (location.href !== this._lastUrl) {
        this._lastUrl = location.href;
        this._handleRouteChange();
      }
    });

    this._urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Stop observing.
   */
  stopObserving() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._urlObserver) {
      this._urlObserver.disconnect();
      this._urlObserver = null;
    }
    clearTimeout(this._debounceTimer);
  }

  /**
   * Scan for new comments and notify callback.
   */
  _scan() {
    const comments = this.findComments();
    if (comments.length > 0 && this._onNewComments) {
      this._onNewComments(comments);
    }
  }

  /**
   * Handle SPA route change.
   * Clear old markers and re-scan.
   */
  _handleRouteChange() {
    console.log('[ThreadBlocker] Route changed to', location.href);

    // Clear old markers
    document.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach((el) => {
      el.removeAttribute(COMMENT_ID_ATTR);
      el.classList.remove('tb-blockmode-target', 'tb-selected');
    });

    // Dispatch route change event for other components
    window.dispatchEvent(new CustomEvent('tb-route-change', { detail: { url: location.href } }));

    // Re-scan after a short delay (let new content load)
    setTimeout(() => this._scan(), 300);
  }

  /**
   * Get all currently marked comments.
   * @returns {Array<{username: string, container: Element}>}
   */
  getMarkedComments() {
    const elements = document.querySelectorAll(`[${COMMENT_ID_ATTR}]`);
    return Array.from(elements).map((el) => ({
      username: el.getAttribute(COMMENT_ID_ATTR),
      container: el,
    }));
  }
}

// Export attribute name for other modules
export { COMMENT_ID_ATTR };
