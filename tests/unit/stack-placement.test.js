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
  it('keeps the default spot when there is no rail', () => {
    expect(
      computeStackPlacement({ viewportWidth: VW, railRect: null, contentRight: 1157 })
    ).toEqual({
      mode: 'default',
      right: StackLayout.DEFAULT_RIGHT,
      width: StackLayout.DEFAULT_WIDTH,
    });
  });

  it('treats a collapsed (zero-width) rail as absent', () => {
    const p = computeStackPlacement({
      viewportWidth: VW,
      railRect: { left: VW, width: 0 },
      contentRight: 1157,
    });
    expect(p.mode).toBe('default');
  });

  it('sits left of the rail, shrunk to the gap (debug-observed layout)', () => {
    const p = computeStackPlacement({
      viewportWidth: VW,
      railRect: { left: 1412, width: 320 },
      contentRight: 1157,
    });
    // right = 1745 - 1412 + 16; width = 1412 - 1157 - 32
    expect(p).toEqual({ mode: 'beside-rail', right: 349, width: 223 });
  });

  it('caps the width at the default on wide gaps', () => {
    const p = computeStackPlacement({
      viewportWidth: 2560,
      railRect: { left: 2200, width: 320 },
      contentRight: 1500,
    });
    expect(p.width).toBe(StackLayout.DEFAULT_WIDTH);
  });

  it('falls back to the default spot when the gap is too narrow', () => {
    const p = computeStackPlacement({
      viewportWidth: 1300,
      railRect: { left: 980, width: 320 },
      contentRight: 900,
    });
    expect(p.mode).toBe('overlay-fallback');
    expect(p.right).toBe(StackLayout.DEFAULT_RIGHT);
  });

  it('uses the default width when the center column is not measurable yet', () => {
    const p = computeStackPlacement({
      viewportWidth: VW,
      railRect: { left: 1412, width: 320 },
      contentRight: null,
    });
    expect(p).toEqual({ mode: 'beside-rail', right: 349, width: StackLayout.DEFAULT_WIDTH });
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

  it('applies the beside-rail placement through CSS variables', () => {
    mountLayout();
    placement = new StackPlacement(stack);
    placement.init();

    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('349px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('223px');
    expect(placement.getState()).toMatchObject({ mode: 'beside-rail', railFound: true });
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
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('280px');
    expect(placement.getState().railFound).toBe(false);
  });

  it('re-places after a late-mounted rail (throttled mutation)', async () => {
    placement = new StackPlacement(stack);
    placement.init();
    expect(placement.getState().mode).toBe('default');

    mountLayout();
    await Promise.resolve(); // flush MutationObserver microtask
    jest.advanceTimersByTime(StackLayout.UPDATE_THROTTLE_MS);

    expect(placement.getState().mode).toBe('beside-rail');
  });

  it('re-places on window resize', () => {
    placement = new StackPlacement(stack);
    placement.init();
    placement._mutationObserver.disconnect(); // isolate the resize trigger
    mountLayout();

    window.dispatchEvent(new Event('resize'));
    jest.advanceTimersByTime(StackLayout.UPDATE_THROTTLE_MS);

    expect(placement.getState().mode).toBe('beside-rail');
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
