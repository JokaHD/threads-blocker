/**
 * Keyword highlighter — marks keyword occurrences in post bodies with the
 * CSS Custom Highlight API (Ranges in CSS.highlights; Threads' React DOM is
 * never touched) and reports which posts contained which keywords to the
 * service worker for stats.
 *
 * Matching always runs against every keyword so stats keep counting while
 * highlighting is off; the global and per-keyword switches only decide which
 * Ranges are painted.
 */

import { MessageType } from '../shared/messages.js';
import { COMMENT_ID_ATTR } from '../shared/constants.js';
import { KeywordStorageKey, KEYWORD_HIGHLIGHT_NAME, findMatches } from '../shared/keywords.js';

const FLUSH_INTERVAL_MS = 2000;

export class KeywordHighlighter {
  /**
   * @param {object} options
   * @param {object} options.siteRule - getBodyTextNodes, getPostKey, getTheme
   * @param {object} [options.highlights] - CSS.highlights registry
   * @param {typeof Highlight} [options.HighlightClass]
   * @param {(message: object) => Promise<unknown>} [options.sendMessage]
   * @param {number} [options.flushIntervalMs]
   */
  constructor({
    siteRule,
    highlights = globalThis.CSS?.highlights,
    HighlightClass = globalThis.Highlight,
    sendMessage = (message) => chrome.runtime.sendMessage(message),
    flushIntervalMs = FLUSH_INTERVAL_MS,
  }) {
    this._siteRule = siteRule;
    this._highlights = highlights && HighlightClass ? highlights : null;
    this._HighlightClass = HighlightClass;
    this._send = sendMessage;
    this._flushIntervalMs = flushIntervalMs;

    this._keywords = [];
    this._enabled = true;
    // container -> { username, postKey, text, segments, matches }
    this._entries = new Map();
    // postKey -> Set<keywordId> already queued for the service worker
    this._reported = new Map();
    // postKey -> { postKey, username, keywordIds } waiting for the next flush
    this._pending = new Map();
    this._enabledListeners = [];
    this._flushTimer = null;
    this._stopped = false;
    this._rangeCount = 0;
    this._noBodySeen = new WeakSet();
    this._counters = { noBodyText: 0, fallbackKeys: 0 };

    this._onStorageChange = (changes, area) => this._handleStorageChange(changes, area);
    this._onPageHide = () => this.flush();
    this._onVisibility = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };

    if (!this._highlights) {
      console.warn(
        '[ThreadBlocker] CSS Custom Highlight API unavailable: keywords are not highlighted (stats still collected)'
      );
    }
  }

  async init() {
    chrome.storage.onChanged.addListener(this._onStorageChange);
    window.addEventListener('pagehide', this._onPageHide);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._flushTimer = setInterval(() => this.flush(), this._flushIntervalMs);
    this._applyTheme();

    const data = await chrome.storage.local.get([
      KeywordStorageKey.ENABLED,
      KeywordStorageKey.KEYWORDS,
    ]);
    this._keywords = data[KeywordStorageKey.KEYWORDS] ?? [];
    this._reanalyzeAll();
    this._setEnabled(data[KeywordStorageKey.ENABLED] !== false);
  }

  destroy() {
    chrome.storage.onChanged.removeListener(this._onStorageChange);
    window.removeEventListener('pagehide', this._onPageHide);
    document.removeEventListener('visibilitychange', this._onVisibility);
    clearInterval(this._flushTimer);
    this._flushTimer = null;
    this._highlights?.delete(KEYWORD_HIGHLIGHT_NAME);
  }

  /** @param {(on: boolean) => void} callback */
  onEnabledChange(callback) {
    this._enabledListeners.push(callback);
  }

  /**
   * A newly detected post (content.js processComments).
   * @param {Element} container
   * @param {string} username
   */
  process(container, username) {
    // Tracked even while the body is empty: it may render later, and only
    // refresh() can see that
    const entry = this._analyze(container, username) ?? emptyEntry(username);
    this._entries.set(container, entry);
    this._report(entry);
    this._paint();
  }

  /**
   * After every DOM scan tick: drop posts that left the page or lost their
   * mark (route change), and re-read bodies React re-rendered in place
   * (e.g. "more" expanded) — a marked container is never reported again by
   * the DOM observer, so this is the only place that sees those changes.
   */
  refresh() {
    let changed = false;
    for (const [container, entry] of this._entries) {
      if (!container.isConnected || container.getAttribute(COMMENT_ID_ATTR) !== entry.username) {
        this._entries.delete(container);
        changed = true;
        continue;
      }
      const next = this._analyze(container, entry.username) ?? emptyEntry(entry.username);
      // Same container, same post: keep its first key so a fallback hash
      // key doesn't change (and count the post twice) when "more" expands
      if (entry.postKey) next.postKey = entry.postKey;
      if (!sameBody(entry, next)) {
        this._entries.set(container, next);
        this._report(next);
        changed = true;
      }
    }
    if (changed) this._paint();
    this._applyTheme();
  }

  /** Send queued hits to the service worker */
  async flush() {
    if (this._stopped || this._pending.size === 0) return;
    const hits = [...this._pending.values()];
    this._pending.clear();
    try {
      await this._send({ type: MessageType.KEYWORD_HITS, hits });
    } catch (err) {
      if (!chrome.runtime?.id) {
        // Extension reloaded or removed: this content script is orphaned
        this._stopped = true;
        return;
      }
      for (const hit of hits) this._queue(hit.postKey, hit.username, hit.keywordIds);
      console.warn('[ThreadBlocker] Keyword hits not sent, retrying later:', err.message);
    }
  }

  getDebugState() {
    return {
      supported: !!this._highlights,
      enabled: this._enabled,
      keywords: this._keywords.length,
      posts: this._entries.size,
      ranges: this._rangeCount,
      pendingHits: this._pending.size,
      ...this._counters,
    };
  }

  _analyze(container, username) {
    const nodes = this._siteRule.getBodyTextNodes(container);
    if (nodes.length === 0) {
      if (!this._noBodySeen.has(container)) {
        this._noBodySeen.add(container);
        this._counters.noBodyText += 1;
      }
      return null;
    }
    const segments = [];
    let text = '';
    for (const node of nodes) {
      segments.push({ node, start: text.length, length: node.data.length });
      text += node.data;
    }
    return {
      username,
      postKey: this._siteRule.getPostKey(container, username, text),
      text,
      segments,
      matches: findMatches(text, this._keywords),
    };
  }

  _report(entry) {
    const ids = [...new Set(entry.matches.map((m) => m.keywordId))];
    if (ids.length === 0) return;
    const isNewPost = !this._reported.has(entry.postKey);
    const reported = this._reported.get(entry.postKey) ?? new Set();
    const fresh = ids.filter((id) => !reported.has(id));
    if (fresh.length === 0) return;
    // Permalink keys start with "/@"; anything else is the hash fallback
    if (isNewPost && !entry.postKey.startsWith('/')) this._counters.fallbackKeys += 1;
    fresh.forEach((id) => reported.add(id));
    this._reported.set(entry.postKey, reported);
    this._queue(entry.postKey, entry.username, fresh);
  }

  _queue(postKey, username, keywordIds) {
    const pending = this._pending.get(postKey);
    if (pending) {
      for (const id of keywordIds)
        if (!pending.keywordIds.includes(id)) pending.keywordIds.push(id);
    } else {
      this._pending.set(postKey, { postKey, username, keywordIds: [...keywordIds] });
    }
  }

  _paint() {
    if (!this._highlights) return;
    if (!this._enabled) {
      this._highlights.delete(KEYWORD_HIGHLIGHT_NAME);
      this._rangeCount = 0;
      return;
    }
    const active = new Set(this._keywords.filter((k) => k.enabled).map((k) => k.id));
    const highlight = new this._HighlightClass();
    for (const entry of this._entries.values()) {
      for (const match of entry.matches) {
        if (!active.has(match.keywordId)) continue;
        const range = toRange(entry.segments, match.start, match.end);
        if (range) highlight.add(range);
      }
    }
    this._highlights.set(KEYWORD_HIGHLIGHT_NAME, highlight);
    this._rangeCount = highlight.size;
  }

  _handleStorageChange(changes, area) {
    if (area !== 'local') return;
    const keywords = changes[KeywordStorageKey.KEYWORDS];
    const enabled = changes[KeywordStorageKey.ENABLED];
    if (keywords) {
      this._keywords = keywords.newValue ?? [];
      this._reanalyzeAll();
    }
    if (enabled) this._setEnabled(enabled.newValue !== false);
  }

  _setEnabled(on) {
    this._enabled = on;
    this._paint();
    this._enabledListeners.forEach((callback) => callback(on));
  }

  _reanalyzeAll() {
    for (const entry of this._entries.values()) {
      entry.matches = findMatches(entry.text, this._keywords);
      this._report(entry);
    }
    this._paint();
  }

  _applyTheme() {
    const theme = this._siteRule.getTheme?.();
    if (theme) document.documentElement.dataset.tbTheme = theme;
  }
}

/** A tracked post whose body hasn't rendered (or is mid re-render) */
function emptyEntry(username) {
  return { username, postKey: null, text: '', segments: [], matches: [] };
}

function sameBody(a, b) {
  return (
    a.text === b.text &&
    a.segments.length === b.segments.length &&
    a.segments.every((seg, i) => seg.node === b.segments[i].node)
  );
}

/** Map a [start, end) offset of the concatenated body text onto its nodes */
function toRange(segments, start, end) {
  const from = locate(segments, start, false);
  const to = locate(segments, end, true);
  if (!from || !to) return null;
  try {
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  } catch {
    // A node changed length since it was read; refresh() rebuilds it
    return null;
  }
}

function locate(segments, pos, isEnd) {
  for (const { node, start, length } of segments) {
    const end = start + length;
    if (isEnd ? pos <= end : pos < end) return { node, offset: pos - start };
  }
  return null;
}
