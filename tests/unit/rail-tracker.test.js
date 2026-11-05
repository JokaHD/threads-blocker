/** @jest-environment jsdom */

import { RailTracker, RAIL_CHANGE_EVENT } from '../../src/content/rail-tracker.js';

describe('RailTracker', () => {
  let rail;
  let found;
  let tracker;
  let events;
  const onChange = (e) => events.push(e.detail.rail);

  beforeEach(() => {
    rail = document.createElement('div');
    rail.innerHTML = '<a class="inside" href="/@x">x</a>';
    rail.getBoundingClientRect = () => ({ left: 1412, width: 320 });
    document.body.appendChild(rail);
    found = rail;
    tracker = new RailTracker({ findRightRail: () => found });
    events = [];
    window.addEventListener(RAIL_CHANGE_EVENT, onChange);
  });

  afterEach(() => {
    window.removeEventListener(RAIL_CHANGE_EVENT, onChange);
    tracker.destroy();
    document.body.innerHTML = '';
  });

  it('caches the rail and answers contains() from the cache', () => {
    tracker.init();
    expect(tracker.get()).toBe(rail);
    expect(tracker.contains(rail.querySelector('.inside'))).toBe(true);
    expect(tracker.contains(document.body)).toBe(false);
    expect(tracker.contains(null)).toBe(false);
  });

  it('emits only when the rail element or its box changes', () => {
    tracker.init();
    tracker.refresh();
    expect(events).toEqual([rail]);

    rail.getBoundingClientRect = () => ({ left: 1300, width: 320 });
    tracker.refresh();
    expect(events).toEqual([rail, rail]);

    found = null;
    tracker.refresh();
    expect(events).toEqual([rail, rail, null]);
    expect(tracker.contains(rail.querySelector('.inside'))).toBe(false);
  });

  it('current() reuses a connected rail and re-probes a detached one', () => {
    tracker.init();
    const probe = jest.fn(() => found);
    tracker._siteRule = { findRightRail: probe };

    expect(tracker.current()).toBe(rail);
    expect(probe).not.toHaveBeenCalled();

    rail.remove(); // React swapped the rail out
    found = null;
    expect(tracker.current()).toBeNull();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('current() re-probes a rail hidden by SPA navigation', () => {
    tracker.init();
    // Threads keeps the previous route in the DOM, hidden: still connected
    rail.getBoundingClientRect = () => ({ left: 0, width: 0 });
    const next = document.createElement('div');
    next.getBoundingClientRect = () => ({ left: 1412, width: 320 });
    document.body.appendChild(next);
    found = next;

    expect(tracker.current()).toBe(next);
    expect(tracker.contains(rail.querySelector('.inside'))).toBe(false);
  });

  it('re-probes on window resize (rail laid out without a mutation)', () => {
    found = null;
    tracker.init();
    found = rail;

    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb();
      return 1;
    });
    window.dispatchEvent(new Event('resize'));
    raf.mockRestore();

    expect(tracker.get()).toBe(rail);
    expect(events).toEqual([rail]);
  });
});
