import { jest } from '@jest/globals';
import { setupChromeMocks, resetChromeMocks } from '../setup.js';
import { BlockState, QueueFlag } from '../../src/shared/constants.js';

setupChromeMocks();

let QueueManager;
beforeAll(async () => {
  ({ QueueManager } = await import('../../src/background/queue-manager.js'));
});

let qm;
beforeEach(() => {
  resetChromeMocks();
  setupChromeMocks();
  qm = new QueueManager();
});

// ── enqueue ─────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('adds an item with QUEUED state', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    const item = qm.getItem('1');
    expect(item).toBeDefined();
    expect(item.userId).toBe('1');
    expect(item.username).toBe('alice');
    expect(item.state).toBe(BlockState.QUEUED);
  });

  it('does not add duplicate userIds', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.enqueue({ userId: '1', username: 'alice' });
    expect(qm.getAll().length).toBe(1);
  });

  it('notifies onChange listener', () => {
    const listener = jest.fn();
    qm.onChange(listener);
    qm.enqueue({ userId: '1', username: 'alice' });
    expect(listener).toHaveBeenCalled();
  });
});

// ── enqueueBatch ─────────────────────────────────────────────────────────────

describe('enqueueBatch', () => {
  it('adds multiple users at once', () => {
    qm.enqueueBatch([
      { userId: '1', username: 'alice' },
      { userId: '2', username: 'bob' },
    ]);
    expect(qm.getAll().length).toBe(2);
  });

  it('skips duplicates in the batch', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.enqueueBatch([
      { userId: '1', username: 'alice' },
      { userId: '2', username: 'bob' },
    ]);
    expect(qm.getAll().length).toBe(2);
  });
});

// ── getNextTask ──────────────────────────────────────────────────────────────

describe('getNextTask', () => {
  it('returns null when queue is empty', () => {
    expect(qm.getNextTask()).toBeNull();
  });

  it('returns null when paused', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.pause();
    expect(qm.getNextTask()).toBeNull();
  });

  it('returns first QUEUED item and transitions it to BLOCKING', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    const task = qm.getNextTask();
    expect(task).toBeDefined();
    expect(task.userId).toBe('1');
    expect(task.action).toBe('block');
    expect(qm.getItem('1').state).toBe(BlockState.BLOCKING);
  });

  it('returns null when there is already a BLOCKING item (one active task at a time)', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.enqueue({ userId: '2', username: 'bob' });
    // Transition '1' to BLOCKING
    qm.getNextTask();
    // A BLOCKING item is already active; should not dispatch another
    const task = qm.getNextTask();
    expect(task).toBeNull();
  });

  it('returns an UNBLOCKING item (with _unblockInFlight guard)', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    qm.onTaskComplete('1', true); // → BLOCKED
    qm.requestUnblock('1'); // → UNBLOCKING
    // Now getNextTask should pick up UNBLOCKING
    const task = qm.getNextTask();
    expect(task).toBeDefined();
    expect(task.action).toBe('unblock');
    // Guard flag set
    expect(qm.getItem('1')._unblockInFlight).toBe(true);
    // Second call should skip it (in-flight)
    const task2 = qm.getNextTask();
    expect(task2).toBeNull();
  });
});

// ── cancel ───────────────────────────────────────────────────────────────────

describe('cancel', () => {
  it('transitions QUEUED item to IDLE (removed from active tracking)', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.cancel('1');
    const item = qm.getItem('1');
    expect(item).toBeUndefined();
  });

  it('sets PENDING_CANCEL flag when item is BLOCKING', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    qm.cancel('1');
    const item = qm.getItem('1');
    expect(item.state).toBe(BlockState.BLOCKING);
    expect(item.flags).toContain(QueueFlag.PENDING_CANCEL);
  });
});

// ── onTaskComplete ───────────────────────────────────────────────────────────

describe('onTaskComplete', () => {
  it('transitions BLOCKING → BLOCKED on success', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    qm.onTaskComplete('1', true);
    expect(qm.getItem('1').state).toBe(BlockState.BLOCKED);
  });

  it('transitions BLOCKING → FAILED on failure', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    qm.onTaskComplete('1', false, 'some error');
    const item = qm.getItem('1');
    expect(item.state).toBe(BlockState.FAILED);
    expect(item.error).toBe('some error');
  });

  it('transitions BLOCKING+PENDING_CANCEL → UNBLOCKING and returns true', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    qm.cancel('1'); // sets PENDING_CANCEL
    const shouldUnblock = qm.onTaskComplete('1', true);
    expect(shouldUnblock).toBe(true);
    expect(qm.getItem('1').state).toBe(BlockState.UNBLOCKING);
  });
});

// ── requestUnblock ───────────────────────────────────────────────────────────

describe('requestUnblock', () => {
  it('transitions BLOCKED → UNBLOCKING', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask();
    qm.onTaskComplete('1', true); // → BLOCKED
    qm.requestUnblock('1');
    expect(qm.getItem('1').state).toBe(BlockState.UNBLOCKING);
  });

  it('throws if item is not BLOCKED', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    expect(() => qm.requestUnblock('1')).toThrow();
  });
});

// ── onUnblockComplete ────────────────────────────────────────────────────────

describe('onUnblockComplete', () => {
  it('transitions UNBLOCKING → IDLE (item removed) on success', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask();
    qm.onTaskComplete('1', true);
    qm.requestUnblock('1');
    qm.getNextTask(); // pick up unblocking task
    qm.onUnblockComplete('1', true);
    expect(qm.getItem('1')).toBeUndefined();
  });

  it('transitions UNBLOCKING → BLOCKED on failure', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask();
    qm.onTaskComplete('1', true);
    qm.requestUnblock('1');
    qm.getNextTask(); // pick up unblocking task
    qm.onUnblockComplete('1', false);
    expect(qm.getItem('1').state).toBe(BlockState.BLOCKED);
  });
});

// ── retry ────────────────────────────────────────────────────────────────────

describe('retry', () => {
  it('transitions FAILED → QUEUED', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask();
    qm.onTaskComplete('1', false, 'err');
    qm.retry('1');
    expect(qm.getItem('1').state).toBe(BlockState.QUEUED);
  });
});

// ── pause/resume/isPaused ────────────────────────────────────────────────────

describe('pause/resume/isPaused', () => {
  it('starts unpaused', () => {
    expect(qm.isPaused()).toBe(false);
  });

  it('pause sets paused state', () => {
    qm.pause();
    expect(qm.isPaused()).toBe(true);
  });

  it('resume clears paused state', () => {
    qm.pause();
    qm.resume();
    expect(qm.isPaused()).toBe(false);
  });
});

// ── getQueueStatus ───────────────────────────────────────────────────────────

describe('getQueueStatus', () => {
  it('returns counts by state', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.enqueue({ userId: '2', username: 'bob' });
    qm.getNextTask(); // '1' → BLOCKING
    const status = qm.getQueueStatus();
    expect(status[BlockState.QUEUED]).toBe(1);
    expect(status[BlockState.BLOCKING]).toBe(1);
  });
});

// ── serialization ────────────────────────────────────────────────────────────

describe('toJSON / loadFrom', () => {
  it('serializes and rehydrates queue', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.enqueue({ userId: '2', username: 'bob' });
    const json = qm.toJSON();
    const qm2 = new QueueManager();
    qm2.loadFrom(json);
    expect(qm2.getAll().length).toBe(2);
  });

  it('reverts BLOCKING → QUEUED on load', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask(); // → BLOCKING
    const json = qm.toJSON();
    const qm2 = new QueueManager();
    qm2.loadFrom(json);
    expect(qm2.getItem('1').state).toBe(BlockState.QUEUED);
  });

  it('reverts UNBLOCKING → BLOCKED on load', () => {
    qm.enqueue({ userId: '1', username: 'alice' });
    qm.getNextTask();
    qm.onTaskComplete('1', true); // → BLOCKED
    qm.requestUnblock('1'); // → UNBLOCKING
    const json = qm.toJSON();
    const qm2 = new QueueManager();
    qm2.loadFrom(json);
    expect(qm2.getItem('1').state).toBe(BlockState.BLOCKED);
  });
});

// ── onChange ─────────────────────────────────────────────────────────────────

describe('onChange', () => {
  it('calls registered listener on state change', () => {
    const listener = jest.fn();
    qm.onChange(listener);
    qm.enqueue({ userId: '1', username: 'alice' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple listeners', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    qm.onChange(l1);
    qm.onChange(l2);
    qm.enqueue({ userId: '1', username: 'alice' });
    expect(l1).toHaveBeenCalled();
    expect(l2).toHaveBeenCalled();
  });
});
