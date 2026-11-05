/**
 * Stack placement — keeps the FAB / card / panel stack out of the right
 * context rail (threads.com 2026-11 layout).
 *
 * Rail present: the stack sits in the gap between the center column and the
 * rail, against the rail. When it does not fit (the expanded card on a
 * narrow window), it starts at the center column's right edge and extends
 * RIGHT over the rail — never left over the posts. No rail (narrow windows
 * collapse it): default bottom-right spot.
 *
 * Applied through CSS custom properties on the stack container, so the
 * stylesheet keeps the defaults and nothing is positioned when this module
 * never runs.
 */

import { threadsSiteRule } from '../site-adapter.js';
import { COMMENT_ID_ATTR } from '../dom-observer.js';

export const StackLayout = {
  DEFAULT_RIGHT: 24,
  // Block mode card (expanded) / FAB launcher (collapsed, see .tb-fab CSS)
  EXPANDED_WIDTH: 280,
  COLLAPSED_WIDTH: 56,
  // Closest the stack may get to the viewport edge when extending right
  MIN_EDGE: 8,
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
 * @param {boolean} input.expanded - block mode card open (vs. FAB only)
 * @returns {{mode: 'default'|'in-gap'|'extend-right', right: number, width: number}}
 */
export function computeStackPlacement({ viewportWidth, railRect, contentRight, expanded }) {
  const { DEFAULT_RIGHT, EXPANDED_WIDTH, COLLAPSED_WIDTH, MIN_EDGE, GAP } = StackLayout;
  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  if (!railRect || railRect.width <= 0) return { mode: 'default', right: DEFAULT_RIGHT, width };

  const gapRight = railRect.left - GAP;
  // Unknown center column: trust the gap until a post can be measured
  const gapLeft = contentRight == null ? -Infinity : contentRight + GAP;

  if (gapRight - gapLeft >= width) {
    return { mode: 'in-gap', right: Math.round(viewportWidth - gapRight), width };
  }

  // Anchor at the posts' edge and grow right; only the right side may shrink
  const right = Math.max(MIN_EDGE, Math.round(viewportWidth - (gapLeft + width)));
  return {
    mode: 'extend-right',
    right,
    width: Math.round(Math.min(width, viewportWidth - right - gapLeft)),
  };
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
    this._onBlockModeChange = (e) => {
      this._expanded = e.detail?.active === true;
      // Immediate: the card must open in place, not jump after a throttle
      this.update();
    };
    this._expanded = false;
    this._last = null;
  }

  init() {
    if (!this._stack) return;

    window.addEventListener('resize', this._onResize);
    window.addEventListener('tb-route-change', this._onResize);
    window.addEventListener('tb-blockmode-change', this._onBlockModeChange);

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
    window.removeEventListener('tb-blockmode-change', this._onBlockModeChange);
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
      expanded: this._expanded,
    });

    this._stack.style.setProperty('--tb-stack-right', `${placement.right}px`);
    this._stack.style.setProperty('--tb-stack-width', `${placement.width}px`);

    this._last = {
      ...placement,
      expanded: this._expanded,
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
