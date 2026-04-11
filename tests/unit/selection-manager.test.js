import { jest } from '@jest/globals';
import { Limits } from '../../src/shared/constants.js';

let SelectionManager;
beforeAll(async () => {
  ({ SelectionManager } = await import('../../src/content/selection-manager.js'));
});

let sm;
beforeEach(() => {
  sm = new SelectionManager();
});

// ── toggle ───────────────────────────────────────────────────────────────────

describe('toggle', () => {
  it('selects a username that was not selected', () => {
    sm.toggle('alice');
    expect(sm.isSelected('alice')).toBe(true);
  });

  it('deselects a username that was already selected', () => {
    sm.toggle('alice');
    sm.toggle('alice');
    expect(sm.isSelected('alice')).toBe(false);
  });

  it('notifies onChange listeners', () => {
    const listener = jest.fn();
    sm.onChange(listener);
    sm.toggle('alice');
    expect(listener).toHaveBeenCalled();
  });
});

// ── getSelected ───────────────────────────────────────────────────────────────

describe('getSelected', () => {
  it('returns an array of selected usernames', () => {
    sm.toggle('alice');
    sm.toggle('bob');
    const selected = sm.getSelected();
    expect(selected).toContain('alice');
    expect(selected).toContain('bob');
    expect(selected.length).toBe(2);
  });

  it('returns empty array when nothing is selected', () => {
    expect(sm.getSelected()).toEqual([]);
  });
});

// ── clearSelection ────────────────────────────────────────────────────────────

describe('clearSelection', () => {
  it('clears all selections', () => {
    sm.toggle('alice');
    sm.toggle('bob');
    sm.clearSelection();
    expect(sm.getSelected()).toEqual([]);
    expect(sm.count()).toBe(0);
  });

  it('notifies onChange listeners', () => {
    sm.toggle('alice');
    const listener = jest.fn();
    sm.onChange(listener);
    sm.clearSelection();
    expect(listener).toHaveBeenCalled();
  });
});

// ── count ─────────────────────────────────────────────────────────────────────

describe('count', () => {
  it('returns correct number of selected usernames', () => {
    expect(sm.count()).toBe(0);
    sm.toggle('alice');
    expect(sm.count()).toBe(1);
    sm.toggle('bob');
    expect(sm.count()).toBe(2);
    sm.toggle('alice');
    expect(sm.count()).toBe(1);
  });
});

// ── onClick ───────────────────────────────────────────────────────────────────

describe('onClick', () => {
  it('sets anchor on non-shift click', () => {
    sm.onClick('alice', false);
    expect(sm.getAnchor()).toBe('alice');
  });

  it('adds username to selection on non-shift click', () => {
    sm.onClick('alice', false);
    expect(sm.isSelected('alice')).toBe(true);
  });

  it('clears seenList on non-shift click', () => {
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.onClick('alice', false);
    // After non-shift click, seenList is reset; range select from alice to bob
    // would find nothing since seenList is empty except for what's recorded after
    sm.recordSeen('alice');
    sm.recordSeen('bob');
    sm.onClick('bob', true);
    // alice and bob should be selected (range from alice to bob)
    expect(sm.isSelected('alice')).toBe(true);
    expect(sm.isSelected('bob')).toBe(true);
  });

  it('Shift+Click selects range from anchor to clicked username', () => {
    // Record 5 users in order
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.recordSeen('user3');
    sm.recordSeen('user4');
    sm.recordSeen('user5');

    // Click user2 (no shift) — sets anchor to user2, clears seenList
    sm.onClick('user2', false);

    // Re-record seen list after the click (simulating virtual scroll)
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.recordSeen('user3');
    sm.recordSeen('user4');
    sm.recordSeen('user5');

    // Shift+click user4 — should select user2 through user4
    sm.onClick('user4', true);

    expect(sm.isSelected('user2')).toBe(true);
    expect(sm.isSelected('user3')).toBe(true);
    expect(sm.isSelected('user4')).toBe(true);
    // user1 and user5 should NOT be selected
    expect(sm.isSelected('user1')).toBe(false);
    expect(sm.isSelected('user5')).toBe(false);
  });

  it('Shift+Click without anchor falls back to normal click behaviour', () => {
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.onClick('user2', true); // no anchor set yet
    expect(sm.isSelected('user2')).toBe(true);
    expect(sm.getAnchor()).toBe('user2');
  });

  it('non-shift click resets anchor and seenList', () => {
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.onClick('user1', false); // sets anchor to user1, clears seenList

    // seenList is now empty; only record user3, user4
    sm.recordSeen('user3');
    sm.recordSeen('user4');

    // Shift+click user4; anchor is user1 but user1 is not in seenList
    // so range select falls back gracefully (selects user4 only or does nothing)
    sm.onClick('user4', true);

    // user3 should not be auto-selected since anchor (user1) is not in new seenList
    // In this case _selectRange can't find anchor, so no range is applied
    // but user4 should still be added individually as fallback
    // (implementation detail: if anchor not found, select target only)
    expect(sm.isSelected('user4')).toBe(true);
  });
});

// ── setAnchor ─────────────────────────────────────────────────────────────────

describe('setAnchor', () => {
  it('sets anchor without clearing selection', () => {
    sm.toggle('alice');
    sm.setAnchor('bob');
    expect(sm.getAnchor()).toBe('bob');
    expect(sm.isSelected('alice')).toBe(true); // selection preserved
  });
});

// ── getAnchor ─────────────────────────────────────────────────────────────────

describe('getAnchor', () => {
  it('returns null when no anchor is set', () => {
    expect(sm.getAnchor()).toBeNull();
  });

  it('returns null after anchor expires (ANCHOR_TIMEOUT)', () => {
    jest.useFakeTimers();
    sm.onClick('alice', false);
    expect(sm.getAnchor()).toBe('alice');
    // Advance time past 5 minutes
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(sm.getAnchor()).toBeNull();
    jest.useRealTimers();
  });
});

// ── recordSeen / scroll record cap ───────────────────────────────────────────

describe('recordSeen', () => {
  it('records usernames for range selection', () => {
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    // After recording, range select should work
    sm.onClick('user1', false);
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.onClick('user2', true);
    expect(sm.isSelected('user1')).toBe(true);
    expect(sm.isSelected('user2')).toBe(true);
  });

  it('does not add duplicates to seenList', () => {
    sm.recordSeen('user1');
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    // seenList should be [user1, user2]
    sm.onClick('user1', false);
    sm.recordSeen('user1');
    sm.recordSeen('user1');
    sm.recordSeen('user2');
    sm.onClick('user2', true);
    // Range should only include user1 and user2 (no duplicate effect)
    expect(sm.isSelected('user1')).toBe(true);
    expect(sm.isSelected('user2')).toBe(true);
    expect(sm.count()).toBe(2);
  });

  it('caps seenList at MAX_SCROLL_RECORD by dropping oldest entries', () => {
    // Fill up to MAX_SCROLL_RECORD + 10
    for (let i = 0; i < Limits.MAX_SCROLL_RECORD + 10; i++) {
      sm.recordSeen(`user${i}`);
    }
    // The internal list should not exceed MAX_SCROLL_RECORD
    // We verify indirectly: try to range-select from user0 (dropped) to user10 (also dropped)
    // The anchor user0 won't be in seenList so range won't work — but count stays bounded.
    // Direct verification: record a fresh anchor that IS in the list
    sm.onClick(`user${Limits.MAX_SCROLL_RECORD + 9}`, false);
    // Re-record only last entry (it will be first after clearing seenList)
    for (let i = 10; i < Limits.MAX_SCROLL_RECORD + 10; i++) {
      sm.recordSeen(`user${i}`);
    }
    sm.onClick(`user${Limits.MAX_SCROLL_RECORD + 9}`, true);
    // The range should include entries from user10..user(MAX+9)
    expect(sm.isSelected(`user${Limits.MAX_SCROLL_RECORD + 9}`)).toBe(true);
  });

  it('MAX_SCROLL_RECORD is 500', () => {
    expect(Limits.MAX_SCROLL_RECORD).toBe(500);
  });
});

// ── onChange ──────────────────────────────────────────────────────────────────

describe('onChange', () => {
  it('supports multiple listeners', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    sm.onChange(l1);
    sm.onChange(l2);
    sm.toggle('alice');
    expect(l1).toHaveBeenCalled();
    expect(l2).toHaveBeenCalled();
  });
});
