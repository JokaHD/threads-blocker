import { BlockState, QueueFlag } from '../shared/constants.js';

export class QueueManager {
  constructor() {
    /** @type {Map<string, object>} */
    this._items = new Map();
    this._paused = false;
    this._listeners = [];
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _notify() {
    for (const listener of this._listeners) {
      listener(this.getAll());
    }
  }

  _setItemState(userId, state) {
    const item = this._items.get(userId);
    if (!item) return;
    item.state = state;
    this._notify();
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  enqueue({ userId, username }) {
    if (this._items.has(userId)) return;
    this._items.set(userId, {
      userId,
      username,
      state: BlockState.QUEUED,
      flags: [],
      error: null,
      errorType: null,
      retries: 0,
      _unblockInFlight: false,
    });
    this._notify();
  }

  enqueueBatch(users) {
    for (const user of users) {
      this.enqueue(user);
    }
  }

  // ── Task dispatching ──────────────────────────────────────────────────────

  getNextTask() {
    if (this._paused) return null;

    // Only one active task at a time: check for in-progress BLOCKING
    for (const item of this._items.values()) {
      if (item.state === BlockState.BLOCKING) return null;
    }

    // First, look for a QUEUED item
    for (const item of this._items.values()) {
      if (item.state === BlockState.QUEUED) {
        item.state = BlockState.BLOCKING;
        this._notify();
        return item;
      }
    }

    // Then, look for an UNBLOCKING item not already in-flight
    for (const item of this._items.values()) {
      if (item.state === BlockState.UNBLOCKING && !item._unblockInFlight) {
        item._unblockInFlight = true;
        this._notify();
        return item;
      }
    }

    return null;
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  cancel(userId) {
    const item = this._items.get(userId);
    if (!item) return;

    if (item.state === BlockState.QUEUED) {
      // QUEUED → IDLE: remove entirely
      this._items.delete(userId);
      this._notify();
    } else if (item.state === BlockState.BLOCKING) {
      // BLOCKING: set flag, let onTaskComplete handle it
      if (!item.flags.includes(QueueFlag.PENDING_CANCEL)) {
        item.flags.push(QueueFlag.PENDING_CANCEL);
      }
      this._notify();
    }
  }

  // ── Task completion ───────────────────────────────────────────────────────

  /**
   * @param {string} userId
   * @param {boolean} success
   * @param {string|null} [error]
   * @returns {boolean} true if the item was cancelled and is now UNBLOCKING
   */
  onTaskComplete(userId, success, error = null) {
    const item = this._items.get(userId);
    if (!item) return false;

    const hasPendingCancel = item.flags.includes(QueueFlag.PENDING_CANCEL);

    if (success && hasPendingCancel) {
      // Was cancelled while blocking; now unblock
      item.flags = item.flags.filter((f) => f !== QueueFlag.PENDING_CANCEL);
      item.state = BlockState.UNBLOCKING;
      this._notify();
      return true;
    }

    if (success) {
      item.state = BlockState.BLOCKED;
    } else {
      item.state = BlockState.FAILED;
      item.error = error;
      item.retries = (item.retries || 0) + 1;
    }

    this._notify();
    return false;
  }

  // ── Unblock ───────────────────────────────────────────────────────────────

  requestUnblock(userId) {
    const item = this._items.get(userId);
    if (!item || item.state !== BlockState.BLOCKED) {
      throw new Error(`Cannot unblock user ${userId}: not in BLOCKED state`);
    }
    item.state = BlockState.UNBLOCKING;
    this._notify();
  }

  onUnblockComplete(userId, success) {
    const item = this._items.get(userId);
    if (!item) return;

    if (success) {
      // UNBLOCKING → IDLE: remove entirely
      this._items.delete(userId);
    } else {
      // UNBLOCKING → BLOCKED: revert
      item.state = BlockState.BLOCKED;
      item._unblockInFlight = false;
    }

    this._notify();
  }

  // ── Retry ─────────────────────────────────────────────────────────────────

  retry(userId) {
    const item = this._items.get(userId);
    if (!item || item.state !== BlockState.FAILED) return;
    item.state = BlockState.QUEUED;
    item.error = null;
    this._notify();
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────

  pause() { this._paused = true; }
  resume() { this._paused = false; }
  isPaused() { return this._paused; }

  // ── Queries ───────────────────────────────────────────────────────────────

  getItem(userId) {
    return this._items.get(userId);
  }

  getAll() {
    return Array.from(this._items.values());
  }

  getQueueStatus() {
    const counts = {};
    for (const item of this._items.values()) {
      counts[item.state] = (counts[item.state] || 0) + 1;
    }
    return counts;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toJSON() {
    return this.getAll().map((item) => ({ ...item }));
  }

  loadFrom(items) {
    this._items.clear();
    for (const raw of items) {
      const item = { ...raw };
      // Revert transient states on load
      if (item.state === BlockState.BLOCKING) {
        item.state = BlockState.QUEUED;
      } else if (item.state === BlockState.UNBLOCKING) {
        item.state = BlockState.BLOCKED;
      }
      item._unblockInFlight = false;
      this._items.set(item.userId, item);
    }
    this._notify();
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  onChange(listener) {
    this._listeners.push(listener);
  }
}
