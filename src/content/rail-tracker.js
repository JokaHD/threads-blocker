/**
 * Right rail tracker — one cached view of the right context rail
 * (threadsSiteRule.findRightRail) shared by scanning, block-mode event
 * handling and stack placement, so the layout probe runs once per refresh
 * instead of once per caller.
 *
 * Refreshed by DOMObserver at the start of every scan (riding its mutation
 * stream — no extra body observer), on window resize, and when the rail
 * element itself resizes (a narrow window widened without any mutation).
 * Emits `tb-rail-change` when the rail element or its box changes.
 */

import { threadsSiteRule } from './site-adapter.js';

export const RAIL_CHANGE_EVENT = 'tb-rail-change';

export class RailTracker {
  constructor(siteRule = threadsSiteRule) {
    this._siteRule = siteRule;
    this._rail = null;
    this._box = null;
    this._resizeObserver = null;
    this._frame = null;
    this._onResize = () => {
      if (this._frame !== null) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = null;
        this.refresh();
      });
    };
  }

  init() {
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(() => this.refresh());
    }
    this.refresh();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  /** Cached rail element, or null. */
  get() {
    return this._rail;
  }

  /** Is `el` inside the rail? Cheap: reads the cache only. */
  contains(el) {
    return !!this._rail && !!el && this._rail.contains(el);
  }

  /**
   * Re-probe the rail; emits RAIL_CHANGE_EVENT when the element or its box
   * changed.
   * @returns {Element|null}
   */
  refresh() {
    const rail = this._siteRule.findRightRail();
    const r = rail?.getBoundingClientRect();
    const box = r ? `${Math.round(r.left)},${Math.round(r.width)}` : null;
    if (rail === this._rail && box === this._box) return rail;

    if (rail !== this._rail && this._resizeObserver) {
      if (this._rail) this._resizeObserver.unobserve(this._rail);
      if (rail) this._resizeObserver.observe(rail);
    }
    this._rail = rail;
    this._box = box;
    window.dispatchEvent(new CustomEvent(RAIL_CHANGE_EVENT, { detail: { rail } }));
    return rail;
  }
}

export const railTracker = new RailTracker();
