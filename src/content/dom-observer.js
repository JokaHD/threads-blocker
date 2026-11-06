/**
 * DOM Observer for detecting comments.
 * Uses site adapter for Threads-specific logic.
 */

import { getSiteRule } from './site-adapter.js';
import { railTracker, RAIL_CHANGE_EVENT } from './rail-tracker.js';
import { COMMENT_ID_ATTR } from '../shared/constants.js';

export class DOMObserver {
  constructor() {
    this._observer = null;
    this._urlObserver = null;
    this._onNewComments = null;
    this._onScan = null;
    this._debounceTimer = null;
    this._lastUrl = location.href;
    this._siteRule = null;
    // A scan before the rail was laid out (late mount, or a zero-size rail
    // on a narrow window that was then widened) may have marked rail users
    this._onRailChange = (e) => {
      if (e.detail?.rail) this._unmarkInside(e.detail.rail);
    };
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
   *
   * Dedup is per CONTAINER, not per username: a user with several comments
   * must have every one of them marked. An unmarked comment is not
   * intercepted in block mode, so clicking it navigates to the permalink
   * and the route change wipes the whole selection.
   *
   * Links are visited in document order, so a comment's author link claims
   * the container before any @mention inside the comment body can.
   *
   * @param {Element} root - Root element to search within
   * @returns {Array<{username: string, container: Element, link: Element}>}
   */
  findComments(root = document.body) {
    if (!this._siteRule) return [];

    const links = root.querySelectorAll(this._siteRule.usernameSelector);
    const results = [];
    const claimedContainers = new Set();
    const seenUsernames = new Set();
    // Right rail content (focused author, quotes, follow suggestions) is
    // never a target; resolved once per scan, read per link
    const rail = railTracker.current();

    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this._siteRule.extractUsername(href);
      if (!username) continue;

      // Skip non-comment links (avatars, navigation, compose areas, right rail)
      if (rail?.contains(link) || this._siteRule.shouldExcludeLink(link)) continue;

      const alreadySeen = seenUsernames.has(username);
      seenUsernames.add(username);

      // Fast path: a link inside a comment already marked for the SAME user
      // resolves to that comment, or to a nested embed whose click would
      // select the same user anyway. Skip before findContainer's layout
      // reads; this is most links on every re-scan tick. A link inside
      // another user's comment can't take it: it may be a quoted post
      // rendered after the outer comment was marked.
      if (
        alreadySeen &&
        link.closest(`[${COMMENT_ID_ATTR}]`)?.getAttribute(COMMENT_ID_ATTR) === username
      ) {
        continue;
      }

      // Find container
      const container = this._siteRule.findContainer(link);
      if (!container) continue;

      // Skip already processed, or claimed earlier in this scan
      if (container.hasAttribute(COMMENT_ID_ATTR)) continue;
      if (claimedContainers.has(container)) continue;

      // A container nested in another comment is a separate target only
      // when it is an embedded post (quoted post B inside quote post A):
      // clicking B selects B's author, clicking the rest of A selects A's —
      // even when B's author was already seen elsewhere (e.g. a reply
      // quoting the OP). Any other nested container is a fragment of the
      // outer post's body and stays unmarked.
      if (
        this._isInsideComment(container, claimedContainers) &&
        !this._siteRule.isEmbeddedPost(container)
      ) {
        continue;
      }

      claimedContainers.add(container);

      results.push({
        username,
        container,
        link,
      });
    }

    // Second entry point: dialog user lists (e.g. the post insights likes
    // list) whose rows carry no username anchor — see
    // threadsSiteRule.findUserListRows. Already-marked rows are skipped
    // inside the adapter, before the expensive extraction.
    const listRows = this._siteRule.findUserListRows(root, (row) =>
      row.hasAttribute(COMMENT_ID_ATTR)
    );
    for (const row of listRows) {
      if (claimedContainers.has(row.container)) continue;
      claimedContainers.add(row.container);
      results.push(row);
    }

    return results;
  }

  /**
   * Is `container` inside a comment that is already marked, or claimed
   * earlier in the current scan?
   */
  _isInsideComment(container, claimedContainers) {
    if (container.parentElement?.closest(`[${COMMENT_ID_ATTR}]`)) return true;
    for (const claimed of claimedContainers) {
      if (claimed.contains(container)) return true;
    }
    return false;
  }

  /**
   * Drop marks (and block-mode classes) from every element inside `root`.
   */
  _unmarkInside(root) {
    root.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach((el) => {
      el.removeAttribute(COMMENT_ID_ATTR);
      el.classList.remove('tb-blockmode-target', 'tb-selected', 'tb-hover');
    });
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
   * @param {function} [onScan] - Called after every scan tick, new comments
   *   or not (re-rendered content inside already-marked posts)
   */
  startObserving(onNewComments, onScan = null) {
    if (!this._siteRule) {
      this.init();
    }

    this._onNewComments = onNewComments;
    this._onScan = onScan;
    window.addEventListener(RAIL_CHANGE_EVENT, this._onRailChange);

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
    window.removeEventListener(RAIL_CHANGE_EVENT, this._onRailChange);
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
    this._onScan?.();
  }

  /**
   * Handle SPA route change.
   * Clear old markers and re-scan.
   */
  _handleRouteChange() {
    console.log('[ThreadBlocker] Route changed to', location.href);

    // Clear old markers
    this._unmarkInside(document);

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
