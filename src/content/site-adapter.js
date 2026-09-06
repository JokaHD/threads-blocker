/**
 * Site adapter for Threads.com
 * Centralizes all Threads-specific DOM knowledge.
 */

import { escapeRegex } from '../shared/utils.js';

const USERNAME_PATTERN = /^\/@([a-zA-Z0-9_.]+)$/;

// Bare username text (no /@ prefix) — used for dialog user-list rows
// where the username exists only as a text node.
const USERNAME_TEXT_PATTERN = /^[a-zA-Z0-9_.]+$/;

// Post permalink, e.g. the timestamp link on quote rows. The username in a
// permalink is the post owner — for a quote row, the quoter.
const POST_PERMALINK_PATTERN = /^\/@([a-zA-Z0-9_.]+)\/post\/[^/]+$/;

// Whitelist of pathnames where extension UI (FAB / block mode) is shown.
// Anything not matching is treated as an unsupported page (e.g. /insights,
// /messages/*, /settings/*).
const SUPPORTED_PATH_PATTERNS = [
  /^\/$/, // home / feed
  /^\/@[^/]+(\/.*)?$/, // profile and post detail under a user
  /^\/saved\/?$/,
  /^\/following(\/.*)?$/,
  /^\/ghost_posts\/?$/,
  /^\/liked\/?$/,
  /^\/search(\/.*)?$/, // search page (with sub-tabs)
];

// Media lightbox view — UI is hidden even though path is under /@*
const MEDIA_VIEW_PATTERN = /\/post\/[^/]+\/media/;

export const threadsSiteRule = {
  id: 'threads',
  match: /^https:\/\/www\.threads\.com\//,

  // Username link selector
  usernameSelector: 'a[href^="/@"]',
  usernamePattern: USERNAME_PATTERN,

  /**
   * Check if a link is an avatar link (should be ignored).
   * Avatar links: text is "個人檔案" (profile in Chinese), or large square (60x60).
   * Text links: text is the actual username.
   */
  isAvatarLink(link) {
    const text = link.textContent?.trim();
    if (text === '個人檔案') return true;

    // Image-only links (no text, just <img>) are always avatars
    if (link.querySelector('img') && !text) return true;

    const rect = link.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 40) return true;

    return false;
  },

  /**
   * Check if a link is inside a navigation container (sidebar, nav bar).
   * These should never be treated as comment authors.
   */
  isNavigationLink(link) {
    return !!link.closest('nav, [role="navigation"]');
  },

  /**
   * Check if a link is inside a compose/post area (contains editable elements).
   */
  isComposeAreaLink(link) {
    return !!link.closest('[role="textbox"], [contenteditable="true"], textarea, [data-composer]');
  },

  /**
   * Single gate: should this link be excluded from comment scanning?
   */
  shouldExcludeLink(link) {
    return this.isAvatarLink(link) || this.isNavigationLink(link) || this.isComposeAreaLink(link);
  },

  /**
   * Extract username from href.
   * Returns null if not a valid username link.
   */
  extractUsername(href) {
    const match = href?.match(USERNAME_PATTERN);
    return match ? match[1] : null;
  },

  /**
   * Find the comment container from a username link.
   * Priority: data-pressable-container > heuristic (children >= 3, width 300-900)
   */
  findContainer(usernameLink) {
    let el = usernameLink.parentElement;
    let depth = 0;
    let fallbackCandidate = null;
    let childCountCandidate = null;

    while (el && depth < 10) {
      if (el === document.body) break;

      // Priority 1: data-pressable-container (Meta's own attribute)
      if (el.hasAttribute('data-pressable-container')) {
        return el;
      }

      // Track fallback by child count (for test environments where rect is 0)
      if (!childCountCandidate && el.children.length >= 3) {
        childCountCandidate = el;
      }

      // Track fallback by dimensions (for real browser)
      const rect = el.getBoundingClientRect();
      if (!fallbackCandidate && el.children.length >= 3 && rect.width > 300 && rect.width < 900) {
        fallbackCandidate = el;
      }

      el = el.parentElement;
      depth++;
    }

    // Prefer dimension-based candidate, fall back to child count
    return fallbackCandidate || childCountCandidate;
  },

  /**
   * Find user rows in dialog-based user lists. Verified on the post insights
   * likes list (2026-09-06 debug); any dialog list with the same row shape
   * (avatar img[alt] + anchor-less pressable content) is picked up too.
   *
   * These rows have NO profile <a href="/@user">: the username exists only
   * as a text node inside a data-pressable-container, plus verbatim inside
   * the avatar img alt (e.g. "user123的大頭貼照"). We cross-validate text
   * candidates against the alt with a character-boundary check, so display
   * names and locale-specific alt suffixes never produce a false username.
   *
   * Quote rows (引用, verified 2026-09-06 debug round 4) additionally carry
   * a timestamp post-permalink anchor (/@quoter/post/x). The permalink owner
   * is the quoter, and becomes the only username candidate for the same alt
   * cross-validation — see _permalinkOverride.
   *
   * Threads keeps a hidden 0x0 duplicate of the list in the dialog; zero-rect
   * rows are dropped whenever a visible row exists, or when the dialog
   * already contains processed rows (a mid-session rescan). They are kept
   * only in rect-less test environments, where neither signal is available.
   *
   * Selector strategy (candidates + risk):
   * 1. `[role="dialog"]` — semantic ARIA, stable; native `dialog` element
   *    covered as fallback in the same query.
   * 2. `[data-pressable-container]` — Meta's own attribute, the same anchor
   *    findContainer() trusts as priority 1; observed on every liker row.
   * 3. `img[alt]` × username-text cross-validation — locale-independent,
   *    since the alt always contains the username verbatim.
   * Failure mode is graceful: any selector breaking means rows are skipped
   * and the likes list degrades to pre-fix behavior — never a false
   * positive, so never a wrong block.
   *
   * @param {Element} root
   * @param {(row: Element) => boolean} isProcessed - rows for which this
   *   returns true are skipped before the (expensive) username extraction;
   *   the scan runs on every mutation batch, so this matters.
   * @returns {Array<{username: string, container: Element, link: null}>}
   */
  findUserListRows(root = document.body, isProcessed = () => false) {
    const candidates = [];
    let sawProcessed = false;

    for (const dialog of root.querySelectorAll('[role="dialog"], dialog')) {
      for (const pressable of dialog.querySelectorAll('[data-pressable-container]')) {
        const override = this._permalinkOverride(pressable);
        if (override === false) continue;

        const match = this._matchUserRow(pressable, dialog, isProcessed, override);
        if (!match) continue;
        if (match.processed) {
          sawProcessed = true;
          continue;
        }

        const rect = match.row.getBoundingClientRect();
        candidates.push({
          username: match.username,
          container: match.row,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
    }

    const dropZeroRect = candidates.some((c) => c.visible) || sawProcessed;
    const seen = new Set();
    const results = [];
    for (const c of candidates) {
      if (dropZeroRect && !c.visible) continue;
      if (seen.has(c.username)) continue;
      seen.add(c.username);
      results.push({ username: c.username, container: c.container, link: null });
    }
    return results;
  },

  /**
   * Classify the /@ anchors inside a row and decide how the row's username
   * may be extracted (verified on the quotes list, 2026-09-06 debug):
   *
   * - Profile link (`/@user`) → the regular comment flow owns this row.
   * - Post permalink (`/@user/post/x`, the quote rows' timestamp link) →
   *   the permalink authoritatively names the row's owner: a quote post
   *   belongs to the quoter. Its username becomes the ONLY candidate for
   *   the alt cross-validation, so text/avatars embedded from the quoted
   *   post can never validate a wrong user.
   * - Anything else → unknown row shape; skip, same as the old
   *   any-anchor-skips behavior. Rather miss a row than mis-mark it.
   *
   * @returns {string[]|null|false} candidate override for _matchUserRow:
   *   an array to restrict candidates, null to use the row's own text
   *   nodes (anchor-less likes/repost rows), false to skip the row.
   */
  _permalinkOverride(pressable) {
    const owners = new Set();
    for (const anchor of pressable.querySelectorAll(this.usernameSelector)) {
      const href = anchor.getAttribute('href');
      if (USERNAME_PATTERN.test(href)) return false;
      const owner = href?.match(POST_PERMALINK_PATTERN)?.[1];
      if (!owner) return false;
      owners.add(owner);
    }
    if (owners.size === 0) return null;
    if (owners.size > 1) return false; // two owners = ambiguous, never guess
    return [...owners];
  },

  /**
   * Walk up from a pressable content block to its row element. A level is
   * accepted as the row only when one of its img alts cross-validates a
   * username-shaped text from the pressable — validation IS the row-boundary
   * criterion, so a non-avatar img (media thumbnail) can never stop the walk
   * early, and an ancestor spanning foreign rows can never validate (their
   * alts belong to other users). Marked rows short-circuit as `processed`
   * before any text extraction. Stops at the dialog boundary.
   *
   * @param {string[]|null} overrideTexts - when given (quote rows), replaces
   *   the row's own text-node candidates entirely — see _permalinkOverride.
   * @returns {{row: Element, username: string}|{processed: true}|null}
   */
  _matchUserRow(pressable, dialog, isProcessed, overrideTexts = null) {
    let texts = null;
    let el = pressable;
    for (let depth = 0; el && depth < 5; depth++) {
      if (el === dialog || el === document.body) return null;
      if (isProcessed(el)) return { processed: true };

      for (const img of el.querySelectorAll('img[alt]')) {
        const alt = img.getAttribute('alt');
        if (!alt) continue;
        texts ??= overrideTexts ?? this._usernameTextCandidates(pressable);
        const username = this._matchTextsAgainstAlt(texts, alt);
        if (username) return { row: el, username };
      }
      el = el.parentElement;
    }
    return null;
  },

  /**
   * Username-shaped text nodes inside the pressable. Candidates only —
   * display names may match the shape too; the alt cross-check decides.
   */
  _usernameTextCandidates(pressable) {
    const walker = document.createTreeWalker(pressable, NodeFilter.SHOW_TEXT);
    const texts = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text && USERNAME_TEXT_PATTERN.test(text)) texts.push(text);
    }
    return texts;
  },

  /**
   * Pick the username among candidate texts: it must appear verbatim in the
   * avatar alt with character boundaries. Longest match wins, so a display
   * name that is a substring of the username never shadows it.
   */
  _matchTextsAgainstAlt(texts, alt) {
    let best = null;
    for (const text of texts) {
      const boundary = new RegExp(`(^|[^a-zA-Z0-9_.])${escapeRegex(text)}([^a-zA-Z0-9_.]|$)`);
      if (!boundary.test(alt)) continue;
      if (!best || text.length > best.length) best = text;
    }
    return best;
  },

  /**
   * Get the element to observe for mutations.
   */
  getObserveTarget() {
    return document.body;
  },

  /**
   * MutationObserver config.
   */
  observeConfig: {
    childList: true,
    subtree: true,
  },

  /**
   * Check if the given pathname is in the supported (whitelisted) page set.
   * Pages outside this list (e.g. /insights, /messages, /settings)
   * should hide all extension UI.
   */
  isSupportedPath(pathname) {
    return SUPPORTED_PATH_PATTERNS.some((re) => re.test(pathname));
  },

  /**
   * Check if the given pathname is the media lightbox view.
   * On media view we hide UI to avoid covering the image.
   */
  isMediaPath(pathname) {
    return MEDIA_VIEW_PATTERN.test(pathname);
  },

  /**
   * Should extension UI (FAB / block mode card) be visible on this URL?
   * True only when path is in the whitelist AND not a media lightbox.
   */
  isUIVisibleOnUrl(url = location.href) {
    const pathname = new URL(url, location.origin).pathname;
    return this.isSupportedPath(pathname) && !this.isMediaPath(pathname);
  },

  /**
   * Detect current theme.
   */
  getTheme() {
    const bgColor = getComputedStyle(document.body).backgroundColor;
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luminance < 0.5 ? 'dark' : 'light';
  },
};

/**
 * Get the site rule for the current page.
 * Returns null if no matching rule found.
 */
export function getSiteRule() {
  if (threadsSiteRule.match.test(location.href)) {
    return threadsSiteRule;
  }
  return null;
}
