/**
 * Stack placement — keeps the FAB / card / panel stack out of the right
 * context rail (threads.com 2026-11 layout).
 *
 * Rail present: the stack sits in the gap between the center column and the
 * rail, shrunk to fit. Gap too narrow, or no rail (narrow window collapses
 * it): the stack falls back to its default bottom-right spot.
 *
 * Applied through CSS custom properties on the stack container, so the
 * stylesheet keeps the defaults and nothing is positioned when this module
 * never runs.
 */

import { threadsSiteRule } from '../site-adapter.js';
import { COMMENT_ID_ATTR } from '../dom-observer.js';

export const StackLayout = {
  DEFAULT_RIGHT: 24,
  DEFAULT_WIDTH: 280,
  MIN_WIDTH: 200,
  GAP: 16,
  UPDATE_THROTTLE_MS: 250,
};

/**
 * Pure placement math.
 *
 * @param {object} input
 * @param {number} input.viewportWidth
 * @param {{left: number, width: number}|null} input.railRect
 * @param {number|null} input.contentRight - right edge of the center column,
 *   null when unknown (no marked post to measure)
 * @returns {{mode: string, right: number, width: number}}
 */
export function computeStackPlacement({ viewportWidth, railRect, contentRight }) {
  const { DEFAULT_RIGHT, DEFAULT_WIDTH, MIN_WIDTH, GAP } = StackLayout;
  const fallback = (mode) => ({ mode, right: DEFAULT_RIGHT, width: DEFAULT_WIDTH });

  if (!railRect || railRect.width <= 0) return fallback('default');

  const right = Math.round(viewportWidth - railRect.left + GAP);
  // Without a measured center column, assume the full default width fits
  const available =
    contentRight == null ? DEFAULT_WIDTH : Math.floor(railRect.left - contentRight - 2 * GAP);
  if (available < MIN_WIDTH) return fallback('overlay-fallback');

  return { mode: 'beside-rail', right, width: Math.min(DEFAULT_WIDTH, available) };
}

export class StackPlacement {
  /**
   * @param {HTMLElement} stackEl - the .tb-stack container
   */
  constructor(stackEl) {
    this._stack = stackEl;
    this._timer = null;
    this._mutationObserver = null;
    this._resizeObserver = null;
    this._observedRail = null;
    this._onResize = () => this.scheduleUpdate();
    this._last = null;
  }

  init() {
    if (!this._stack) return;

    window.addEventListener('resize', this._onResize);
    window.addEventListener('tb-route-change', this._onResize);

    // Rail mounts late and re-renders on navigation; only schedules here
    this._mutationObserver = new MutationObserver(() => this.scheduleUpdate());
    this._mutationObserver.observe(document.body, { childList: true, subtree: true });

    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
    }

    this.update();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('tb-route-change', this._onResize);
    this._mutationObserver?.disconnect();
    this._resizeObserver?.disconnect();
    clearTimeout(this._timer);
    this._timer = null;
  }

  /** Trailing throttle: at most one layout read per UPDATE_THROTTLE_MS. */
  scheduleUpdate() {
    if (this._timer !== null) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.update();
    }, StackLayout.UPDATE_THROTTLE_MS);
  }

  update() {
    const rail = threadsSiteRule.findRightRail();
    this._watchRail(rail);

    const railRect = rail?.getBoundingClientRect() ?? null;
    const contentRight = rail ? this._measureContentRight(rail) : null;
    const placement = computeStackPlacement({
      viewportWidth: window.innerWidth,
      railRect,
      contentRight,
    });

    this._stack.style.setProperty('--tb-stack-right', `${placement.right}px`);
    this._stack.style.setProperty('--tb-stack-width', `${placement.width}px`);

    this._last = {
      ...placement,
      railFound: !!rail,
      railRect: railRect && { left: Math.round(railRect.left), width: Math.round(railRect.width) },
      contentRight,
    };
    return this._last;
  }

  /** Last applied placement, for window.__TB_DEBUG__(). */
  getState() {
    return this._last;
  }

  /**
   * Right edge of the center column, measured from marked posts outside
   * the rail. Null when none is laid out yet.
   */
  _measureContentRight(rail) {
    const railLeft = rail.getBoundingClientRect().left;
    let max = null;
    for (const el of document.querySelectorAll(`[${COMMENT_ID_ATTR}]`)) {
      if (rail.contains(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.right > railLeft) continue;
      if (max === null || rect.right > max) max = Math.round(rect.right);
    }
    return max;
  }

  _watchRail(rail) {
    if (!this._resizeObserver || rail === this._observedRail) return;
    if (this._observedRail) this._resizeObserver.unobserve(this._observedRail);
    if (rail) this._resizeObserver.observe(rail);
    this._observedRail = rail;
  }
}
