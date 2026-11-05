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
import { railTracker, RAIL_CHANGE_EVENT } from '../rail-tracker.js';

export const StackLayout = {
  DEFAULT_RIGHT: 24,
  // Block mode card (expanded) / FAB launcher (collapsed, see .tb-fab CSS)
  EXPANDED_WIDTH: 280,
  COLLAPSED_WIDTH: 56,
  // Closest the stack may get to the viewport edge when extending right
  MIN_EDGE: 8,
  GAP: 16,
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
   * @param {import('../rail-tracker.js').RailTracker} [tracker]
   */
  constructor(stackEl, tracker = railTracker) {
    this._stack = stackEl;
    this._tracker = tracker;
    this._expanded = false;
    this._frame = null;
    this._last = null;
    this._onRailChange = () => this.update();
    this._onBlockModeChange = (e) => {
      this._expanded = e.detail?.active === true;
      // Immediate: the card must open in place, not jump a frame later
      this.update();
    };
    // Viewport width moves `right` even when the rail box stays put
    this._onResize = () => {
      if (this._frame !== null) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = null;
        this.update();
      });
    };
  }

  init() {
    if (!this._stack) return;
    window.addEventListener(RAIL_CHANGE_EVENT, this._onRailChange);
    window.addEventListener('tb-blockmode-change', this._onBlockModeChange);
    window.addEventListener('resize', this._onResize);
    this.update();
  }

  destroy() {
    window.removeEventListener(RAIL_CHANGE_EVENT, this._onRailChange);
    window.removeEventListener('tb-blockmode-change', this._onBlockModeChange);
    window.removeEventListener('resize', this._onResize);
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
  }

  update() {
    const rail = this._tracker.get();
    const railRect = rail?.getBoundingClientRect() ?? null;
    // Measured fresh on every open, so posts that loaded after the rail count
    const contentRight = rail ? threadsSiteRule.getContentRight(rail) : null;
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
}
