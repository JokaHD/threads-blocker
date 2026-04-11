import { Limits, Timing } from '../shared/constants.js';

export class SelectionManager {
  constructor() {
    /** @type {Set<string>} */
    this._selected = new Set();
    /** @type {string|null} */
    this._anchor = null;
    /** @type {number|null} timestamp when anchor was set */
    this._anchorSetAt = null;
    /** @type {string[]} ordered list of seen usernames (virtual scroll tracking) */
    this._seenList = [];
    /** @type {Function[]} */
    this._listeners = [];
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _notify() {
    for (const listener of this._listeners) {
      listener(this.getSelected());
    }
  }

  /**
   * Select every username between `from` and `to` in seenList, inclusive.
   * If either is not found, selects `to` only.
   */
  _selectRange(from, to) {
    const fromIdx = this._seenList.indexOf(from);
    const toIdx = this._seenList.indexOf(to);

    if (fromIdx === -1 || toIdx === -1) {
      // Fallback: just select the target
      this._selected.add(to);
      return;
    }

    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    for (let i = start; i <= end; i++) {
      this._selected.add(this._seenList[i]);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Toggle individual selection for a username.
   */
  toggle(username) {
    if (this._selected.has(username)) {
      this._selected.delete(username);
    } else {
      this._selected.add(username);
    }
    this._notify();
  }

  /**
   * Handle a checkbox click.
   * - If shift is held and an anchor exists: range-select from anchor to username.
   * - Otherwise: add username to selection, set anchor, clear seenList.
   */
  onClick(username, isShiftKey) {
    const anchor = this.getAnchor(); // respects timeout
    if (isShiftKey && anchor !== null) {
      this._selectRange(anchor, username);
    } else {
      this._selected.add(username);
      this._anchor = username;
      this._anchorSetAt = Date.now();
      this._seenList = [];
    }
    this._notify();
  }

  /**
   * Set anchor for Shift+Click without clearing selection.
   */
  setAnchor(username) {
    this._anchor = username;
    this._anchorSetAt = Date.now();
  }

  /**
   * Check if a username is selected.
   */
  isSelected(username) {
    return this._selected.has(username);
  }

  /**
   * Return array of selected usernames.
   */
  getSelected() {
    return Array.from(this._selected);
  }

  /**
   * Return current anchor, or null if none / expired.
   */
  getAnchor() {
    if (this._anchor === null) return null;
    if (Date.now() - this._anchorSetAt > Timing.ANCHOR_TIMEOUT) {
      this._anchor = null;
      this._anchorSetAt = null;
      return null;
    }
    return this._anchor;
  }

  /**
   * Return count of selected usernames.
   */
  count() {
    return this._selected.size;
  }

  /**
   * Clear all selections.
   */
  clearSelection() {
    this._selected.clear();
    this._notify();
  }

  /**
   * Record a username to the ordered seenList for virtual scroll tracking.
   * Caps at MAX_SCROLL_RECORD; drops oldest when exceeded. No duplicates.
   */
  recordSeen(username) {
    if (this._seenList.includes(username)) return;
    this._seenList.push(username);
    if (this._seenList.length > Limits.MAX_SCROLL_RECORD) {
      this._seenList.shift(); // drop oldest
    }
  }

  /**
   * Register a listener called with the current selected array on any change.
   */
  onChange(listener) {
    this._listeners.push(listener);
  }
}
