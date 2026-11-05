/** @jest-environment jsdom */

import {
  computeStackPlacement,
  StackPlacement,
  StackLayout,
} from '../../src/content/ui/stack-placement.js';
import { RailTracker } from '../../src/content/rail-tracker.js';
import { OBSERVED, setViewport, stubRect, mountThreadsLayout } from './helpers/rail-fixture.js';

const { VW, VH } = OBSERVED;

function mountLayout() {
  const { rail, center } = mountThreadsLayout({
    centerHtml: '<div class="post" data-pressable-container="true"></div>',
    railHtml: '<div class="rail-item"></div>',
  });
  const post = stubRect(center.querySelector('.post'), {
    left: OBSERVED.CONTENT_RIGHT - 638,
    width: 638,
    height: 300,
  });
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

  it('puts the collapsed FAB right beside the posts', () => {
    const p = computeStackPlacement({ ...observed, expanded: false });
    // left = 1157 + 16 = 1173; right = 1745 - (1173 + 68)
    expect(p).toEqual({ mode: 'beside-content', right: 504, width: StackLayout.COLLAPSED_WIDTH });
  });

  it('opens the card from the same left edge as the FAB, on wide gaps too', () => {
    const p = computeStackPlacement({
      viewportWidth: 2560,
      railRect: { left: 2200, width: 320 },
      contentRight: 1500,
      expanded: true,
    });
    expect(p).toEqual({ mode: 'beside-content', right: 764, width: StackLayout.EXPANDED_WIDTH });
  });

  it('extends the expanded card right over the rail, never left over posts', () => {
    const p = computeStackPlacement({ ...observed, expanded: true });
    // gap is 1173..1396 (223px) < 280 → card spans 1173..1453
    expect(p).toEqual({ mode: 'beside-content', right: 292, width: StackLayout.EXPANDED_WIDTH });
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
    expect(p.mode).toBe('beside-content');
    expect(p.right).toBe(StackLayout.MIN_EDGE);
    // left edge stays at the posts' edge + GAP
    expect(1000 - p.right - p.width).toBe(780 + StackLayout.GAP);
  });

  it('waits against the rail when the center column is not measurable yet', () => {
    const p = computeStackPlacement({ ...observed, contentRight: null, expanded: true });
    expect(p).toEqual({ mode: 'beside-rail', right: 349, width: StackLayout.EXPANDED_WIDTH });
  });
});

describe('StackPlacement', () => {
  let stack;
  let tracker;
  let placement;

  beforeEach(() => {
    setViewport(VW, VH);
    stack = document.createElement('div');
    tracker = new RailTracker();
  });

  afterEach(() => {
    placement?.destroy();
    placement = null;
    tracker.destroy();
    document.body.innerHTML = '';
  });

  function start() {
    placement = new StackPlacement(stack, tracker);
    placement.init();
    return placement;
  }

  const blockMode = (active) =>
    window.dispatchEvent(new CustomEvent('tb-blockmode-change', { detail: { active } }));

  it('applies the placement through CSS variables', () => {
    mountLayout();
    tracker.refresh();
    start();

    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('504px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('68px');
    expect(placement.getState()).toMatchObject({
      mode: 'beside-content',
      railFound: true,
      contentRight: 1157,
    });
  });

  it('ignores post containers inside the rail when measuring the center column', () => {
    const { rail } = mountLayout();
    const inRail = rail.querySelector('.rail-item');
    inRail.setAttribute('data-pressable-container', 'true');
    stubRect(inRail, { left: 1430, width: 280, height: 60 });
    tracker.refresh();
    start();

    expect(placement.getState().contentRight).toBe(1157);
  });

  it('re-places immediately when block mode opens and closes', () => {
    mountLayout();
    tracker.refresh();
    start();

    blockMode(true);
    expect(placement.getState()).toMatchObject({ mode: 'beside-content', expanded: true });
    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('292px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('280px');

    blockMode(false);
    expect(placement.getState()).toMatchObject({ mode: 'beside-content', expanded: false });
    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('504px');
  });

  it('writes the defaults when no rail is present', () => {
    start();

    expect(stack.style.getPropertyValue('--tb-stack-right')).toBe('24px');
    expect(stack.style.getPropertyValue('--tb-stack-width')).toBe('68px');
    expect(placement.getState().railFound).toBe(false);
  });

  it('re-places when the tracker reports a late-mounted rail', () => {
    start();
    expect(placement.getState().mode).toBe('default');

    mountLayout();
    tracker.refresh(); // emits tb-rail-change

    expect(placement.getState().mode).toBe('beside-content');
  });

  it('re-measures after scans only until the post column is anchored', () => {
    const { post } = mountLayout();
    post.removeAttribute('data-pressable-container'); // posts not laid out yet
    tracker.refresh();
    start();
    expect(placement.getState()).toMatchObject({ mode: 'beside-rail', contentRight: null });

    post.setAttribute('data-pressable-container', 'true');
    placement.updateIfUnanchored();
    expect(placement.getState()).toMatchObject({ mode: 'beside-content', contentRight: 1157 });

    const spy = jest.spyOn(placement, 'update');
    placement.updateIfUnanchored();
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-places on window resize, once per frame', () => {
    start();
    const spy = jest.spyOn(placement, 'update');
    const frames = [];
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    frames.forEach((cb) => cb());
    raf.mockRestore();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without a stack element', () => {
    placement = new StackPlacement(null, tracker);
    expect(() => placement.init()).not.toThrow();
    expect(placement.getState()).toBeNull();
  });
});
