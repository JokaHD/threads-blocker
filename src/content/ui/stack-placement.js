/**
 * Stack placement — keeps the FAB / card / panel stack out of the right
 * context rail (threads.com 2026-11 layout).
 *
 * Rail present: the stack hugs the center column — its left edge sits just
 * right of the posts, for the FAB and the card alike, so opening the card
 * only grows it rightward (over the rail when the gap is narrow), never left
 * over the posts. Before any post is laid out, it waits against the rail.
 * No rail (narrow windows collapse it): default bottom-right spot.
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
 *   null when unknown (no post laid out yet)
 * @param {boolean} input.expanded - block mode card open (vs. FAB only)
 * @returns {{mode: 'default'|'beside-content'|'beside-rail', right: number, width: number}}
 */
export function computeStackPlacement({ viewportWidth, railRect, contentRight, expanded }) {
  const { DEFAULT_RIGHT, EXPANDED_WIDTH, COLLAPSED_WIDTH, MIN_EDGE, GAP } = StackLayout;
  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  if (!railRect || railRect.width <= 0) return { mode: 'default', right: DEFAULT_RIGHT, width };

  // Unknown center column: wait against the rail until a post is measured
  if (contentRight == null) {
    return { mode: 'beside-rail', right: Math.round(viewportWidth - railRect.left + GAP), width };
  }

  // Anchor at the posts' edge and grow right; only the right side may shrink
  const left = contentRight + GAP;
  const right = Math.max(MIN_EDGE, Math.round(viewportWidth - (left + width)));
  return {
    mode: 'beside-content',
    right,
    width: Math.round(Math.min(width, viewportWidth - right - left)),
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
