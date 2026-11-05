/** @jest-environment jsdom */

import {
  computeStackPlacement,
  StackPlacement,
  StackLayout,
} from '../../src/content/ui/stack-placement.js';
import { COMMENT_ID_ATTR } from '../../src/content/dom-observer.js';

const VW = 1745;
const VH = 828;

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function rectOf({ left, width, top = 0, height }) {
  return () => ({ left, width, top, height, right: left + width, bottom: top + height });
}

/** Rail as observed 2026-11-05: sticky 320px child of #barcelona-page-layout. */
function mountLayout({ railLeft = 1412, postRight = 1157 } = {}) {
  document.body.innerHTML = `
    <div id="barcelona-page-layout">
      <div class="center"><div class="post"></div></div>
      <div class="rail" style="position: sticky"><div class="rail-item"></div></div>
    </div>`;
  const rail = document.querySelector('.rail');
  rail.getBoundingClientRect = rectOf({ left: railLeft, width: 320, height: VH });
  const post = document.querySelector('.post');
  post.setAttribute(COMMENT_ID_ATTR, 'alice');
  post.getBoundingClientRect = rectOf({ left: postRight - 638, width: 638, height: 300 });
  return { rail, post };
}

describe('computeStackPlacement', () => {
  // Debug-observed layout (2026-11-05): vw 1745, rail at 1412, posts end at 1157
  const observed = { viewportWidth: VW, railRect: { left: 1412, width: 320 }, contentRight: 1157 };

  it('keeps the default spot when there is no rail', () => {
    const p = computeStackPlacement({ ...observed, railRect: null, expanded: false });
    expect(p).toEqual({
      mode: 'default',
      right: StackLayout.DEFAULT_RIGHT,
      width: StackLayout.COLLAPSED_WIDTH,
    });
  });

  it('treats a collapsed (zero-width) rail as absent', () => {
    const p = computeStackPlacement({
      ...observed,
      railRect: { left: VW, width: 0 },
      expanded: true,
    });
    expect(p).toEqual({
      mode: 'default',
      right: StackLayout.DEFAULT_RIGHT,
      width: StackLayout.EXPANDED_WIDTH,
    });
  });

  it('puts the collapsed FAB in the gap, against the rail', () => {
    const p = computeStackPlacement({ ...observed, expanded: false });
    // right = 1745 - (1412 - 16)
    expect(p).toEqual({ mode: 'in-gap', right: 349, width: StackLayout.COLLAPSED_WIDTH });
  });

  it('puts the expanded card in the gap when it fits', () => {
    const p = computeStackPlacement({
      viewportWidth: 2560,
      railRect: { left: 2200, width: 320 },
      contentRight: 1500,
      expanded: true,
    });
    expect(p).toEqual({ mode: 'in-gap', right: 376, width: StackLayout.EXPANDED_WIDTH });
  });

  it('extends the expanded card right over the rail, never left over posts', () => {
    const p = computeStackPlacement({ ...observed, expanded: true });
    // gap is 1173..1396 (223px) < 280 → card spans 1173..1453
    expect(p).toEqual({ mode: 'extend-right', right: 292, width: StackLayout.EXPANDED_WIDTH });
    const left = VW - p.right - p.width;
    expect(left).toBe(1157 + StackLayout.GAP);
  });

  it('shrinks from the right edge only when the viewport runs out', () => {
    const p = computeStackPlacement({
      viewportWidth: 1000,
      railRect: { left: 800, width: 200 },
      contentRight: 780,
      expanded: true,
    });
    expect(p.mode).toBe('extend-right');
    expect(p.right).toBe(StackLayout.MIN_EDGE);
    // left edge stays at the posts' edge + GAP
    expect(1000 - p.right - p.width).toBe(780 + StackLayout.GAP);
  });

  it('trusts the gap when the center column is not measurable yet', () => {
    const p = computeStackPlacement({ ...observed, contentRight: null, expanded: true });
    expect(p).toEqual({ mode: 'in-gap', right: 349, width: StackLayout.EXPANDED_WIDTH });
  });
});

describe('StackPlacement', () => {
  let stack;
  let placement;

  beforeEach(() => {
    jest.useFakeTimers();
    setViewport(VW, VH);
    stack = document.createElement('div');
  });

  afterEach(() => {
    placement?.destroy();
    placement = null;
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('applies the placement through CSS variables', () => {
    mountLayout();
    placement = new StackPlacement(stack);
    placement.init();

    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('349px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('56px');
    expect(placement.getState()).toMatchObject({ mode: 'in-gap', railFound: true });
  });

  it('re-places immediately when block mode opens and closes', () => {
    mountLayout();
    placement = new StackPlacement(stack);
    placement.init();

    window.dispatchEvent(new CustomEvent('tb-blockmode-change', { detail: { active: true } }));
    expect(placement.getState()).toMatchObject({ mode: 'extend-right', expanded: true });
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('280px');

    window.dispatchEvent(new CustomEvent('tb-blockmode-change', { detail: { active: false } }));
    expect(placement.getState()).toMatchObject({ mode: 'in-gap', expanded: false });
  });

  it('ignores marked elements inside the rail when measuring the center column', () => {
    const { rail } = mountLayout();
    const inRail = rail.querySelector('.rail-item');
    inRail.setAttribute(COMMENT_ID_ATTR, 'suggested');
    inRail.getBoundingClientRect = rectOf({ left: 1430, width: 280, height: 60 });

    placement = new StackPlacement(stack);
    placement.init();

    expect(placement.getState().contentRight).toBe(1157);
  });

  it('writes the defaults when no rail is present', () => {
    document.body.innerHTML = '<div id="barcelona-page-layout"><div></div></div>';
    placement = new StackPlacement(stack);
    placement.init();

    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('24px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('56px');
    expect(placement.getState().railFound).toBe(false);
  });

  it('re-places after a late-mounted rail (throttled mutation)', async () => {
    placement = new StackPlacement(stack);
    placement.init();
    expect(placement.getState().mode).toBe('default');

    mountLayout();
    await Promise.resolve(); // flush MutationObserver microtask
    jest.advanceTimersByTime(StackLayout.UPDATE_THROTTLE_MS);

    expect(placement.getState().mode).toBe('in-gap');
  });

  it('re-places on window resize', () => {
    placement = new StackPlacement(stack);
    placement.init();
    placement._mutationObserver.disconnect(); // isolate the resize trigger
    mountLayout();

    window.dispatchEvent(new Event('resize'));
    jest.advanceTimersByTime(StackLayout.UPDATE_THROTTLE_MS);

    expect(placement.getState().mode).toBe('in-gap');
  });

  it('throttles bursts into a single update', () => {
    placement = new StackPlacement(stack);
    placement.init();
    const spy = jest.spyOn(placement, 'update');

    for (let i = 0; i < 10; i++) placement.scheduleUpdate();
    jest.advanceTimersByTime(StackLayout.UPDATE_THROTTLE_MS);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without a stack element', () => {
    placement = new StackPlacement(null);
    expect(() => placement.init()).not.toThrow();
    expect(placement.getState()).toBeNull();
  });
});
