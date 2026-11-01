import { BlockState, QueueFlag, Timing } from '../shared/constants.js';

export class QueueManager {
  /**
   * @param {{dispatchIntervalMs?: number}} [opts] - minimum gap between one
   *   task settling and the next being dispatched. Enforced here rather than
   *   per executor so several threads.com tabs polling at once can't shorten it.
   */
  constructor({ dispatchIntervalMs = 0 } = {}) {
    /** @type {Map<string, object>} */
    this._items = new Map();
    this._paused = false;
    this._listeners = [];
    this._seqCounter = 0;
    this._dispatchIntervalMs = dispatchIntervalMs;
    this._lastSettledAt = -Infinity;
  }

  // Items are rendered and dispatched in `seq` order, not Map insertion order,
  // so that `updateResolvedUser`'s delete+set re-key doesn't shuffle the panel.
  _orderedItems() {
    return Array.from(this._items.values()).sort((a, b) => a.seq - b.seq);
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
    // For RESOLVING items, use username as temporary key
    const key = userId ?? `pending:${username}`;
    if (this._items.has(key)) return;
    this._items.set(key, {
      userId,
      username,
      state: userId ? BlockState.QUEUED : BlockState.RESOLVING,
      seq: this._seqCounter++,
      flags: [],
      error: null,
      errorType: null,
      retries: 0,
      nextAttemptAt: null,
      _unblockInFlight: false,
    });
    this._notify();
  }

  enqueueBatch(users) {
    for (const user of users) {
      this.enqueue(user);
    }
  }

  /**
   * Update a RESOLVING item with its resolved userId.
   * Transitions item from RESOLVING to QUEUED (or removes if resolution failed).
   */
  updateResolvedUser(username, userId) {
    const pendingKey = `pending:${username}`;
    const item = this._items.get(pendingKey);
    if (!item) return;

    if (!userId) {
      // Resolution failed - remove item
      this._items.delete(pendingKey);
      this._notify();
      return;
    }

    // Remove pending entry and add with real userId
    this._items.delete(pendingKey);

    // Skip if already exists with this userId
    if (this._items.has(userId)) {
      this._notify();
      return;
    }

    this._items.set(userId, {
      ...item,
      userId,
      state: BlockState.QUEUED,
    });
    this._notify();
  }

  // ── Task dispatching ──────────────────────────────────────────────────────

  /** Mark the in-flight task as finished; starts the dispatch interval. */
  _settle() {
    this._lastSettledAt = Date.now();
  }

  /**
   * @param {number|null} [ownerTabId] - tab whose executor will run the task;
   *   lets resetOrphanedTasks tell its own reload apart from another tab's.
   */
  getNextTask(ownerTabId = null) {
    if (this._paused) return null;

    // Owner tab closed or navigated away mid-request: free the slot
    if (this._resetTransientStates((item) => this._isStale(item))) this._notify();

    if (Date.now() < this._lastSettledAt + this._dispatchIntervalMs) return null;

    const ordered = this._orderedItems();

    // Only one active task at a time across all tabs: a block or unblock
    // already in flight holds the slot
    if (ordered.some((item) => this._isInFlight(item))) return null;

    // First, look for a QUEUED item whose retry hold-off (if any) has elapsed
    for (const item of ordered) {
      if (item.state === BlockState.QUEUED) {
        if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) continue;
        item.state = BlockState.BLOCKING;
        item.nextAttemptAt = null;
        this._claim(item, ownerTabId);
        this._notify();
        return { userId: item.userId, username: item.username, action: 'block' };
      }
    }

    // Then, look for an UNBLOCKING item not already in-flight
    for (const item of ordered) {
      if (item.state === BlockState.UNBLOCKING && !item._unblockInFlight) {
        item._unblockInFlight = true;
        this._claim(item, ownerTabId);
        this._notify();
        return { userId: item.userId, username: item.username, action: 'unblock' };
      }
    }

    return null;
  }

  _claim(item, ownerTabId) {
    item._ownerTabId = ownerTabId;
    item._dispatchedAt = Date.now();
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

  /**
   * Cancel a RESOLVING item by username.
   */
  cancelResolving(username) {
    const pendingKey = `pending:${username}`;
    if (this._items.has(pendingKey)) {
      this._items.delete(pendingKey);
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
    this._settle();

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
    this._settle();

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

  // Manual retry: back to QUEUED with a fresh retry budget
  _requeueItem(item) {
    item.state = BlockState.QUEUED;
    item.error = null;
    item.retries = 0;
    item.nextAttemptAt = null;
  }

  retry(userId) {
    const item = this._items.get(userId);
    if (!item || item.state !== BlockState.FAILED) return;
    this._requeueItem(item);
    this._notify();
  }

  /**
   * Requeue every FAILED item in one go (one notify, so the panel redraws once).
   * @returns {number} how many items were requeued
   */
  retryAllFailed() {
    let count = 0;
    for (const item of this._items.values()) {
      if (item.state !== BlockState.FAILED) continue;
      this._requeueItem(item);
      count++;
    }
    if (count > 0) this._notify();
    return count;
  }

  /**
   * Revert a failed BLOCKING item to QUEUED with a not-before timestamp.
   * The SW owns retry scheduling; the executor only needs to poll again later.
   */
  scheduleRetry(userId, delayMs) {
    const item = this._items.get(userId);
    if (!item) return;
    this._settle();
    item.state = BlockState.QUEUED;
    item.retries = (item.retries || 0) + 1;
    item.nextAttemptAt = Date.now() + delayMs;
    this._notify();
  }

  /**
   * Earliest future time a waiting task becomes dispatchable (its retry
   * hold-off or the dispatch interval, whichever is later), or when an
   * in-flight task goes stale and frees the slot, or null.
   */
  getNextRetryAt() {
    const now = Date.now();
    const intervalEnd = this._lastSettledAt + this._dispatchIntervalMs;
    let earliest = null;
    for (const item of this._items.values()) {
      let at;
      if (item.state === BlockState.QUEUED) at = Math.max(item.nextAttemptAt ?? 0, intervalEnd);
      else if (item.state === BlockState.UNBLOCKING && !item._unblockInFlight) at = intervalEnd;
      // Keep waiting tabs polling so a closed owner tab's task is reclaimed
      else if (this._isInFlight(item)) at = item._dispatchedAt + Timing.ORPHANED_TASK_TIMEOUT;
      else continue;
      if (at > now && (earliest === null || at < earliest)) earliest = at;
    }
    return earliest;
  }

  // ── Transient state recovery ────────────────────────────────────────────────

  // RESOLVING items are left alone: their resolve loop lives in a content
  // script, which may still be running (e.g. held by a pause) when another
  // tab registers or the SW restarts. Dropping them made that tab's later
  // UPDATE_RESOLVED_USER a silent no-op. A truly orphaned one is picked up
  // again on the next page load (content.js) or cancelled from the panel.
  _resetTransientStates(shouldReset = () => true) {
    let changed = false;
    for (const item of this._items.values()) {
      if (!shouldReset(item)) continue;
      if (item.state === BlockState.BLOCKING) {
        item.state = BlockState.QUEUED;
        changed = true;
      } else if (item.state === BlockState.UNBLOCKING) {
        item.state = BlockState.BLOCKED;
        item._unblockInFlight = false;
        changed = true;
      }
    }
    return changed;
  }

  _isInFlight(item) {
    return (
      item.state === BlockState.BLOCKING ||
      (item.state === BlockState.UNBLOCKING && item._unblockInFlight)
    );
  }

  _isStale(item) {
    return (
      this._isInFlight(item) && !(item._dispatchedAt > Date.now() - Timing.ORPHANED_TASK_TIMEOUT)
    );
  }

  /**
   * A tab (re)registered: reset the tasks it had in flight — its reload killed
   * them — plus ones with no known or live owner. Another tab's in-flight
   * request is left alone, so opening a second tab can't dispatch it twice.
   */
  resetOrphanedTasks(tabId = null) {
    const isOrphan = (item) =>
      this._isInFlight(item) &&
      (item._ownerTabId == null || item._ownerTabId === tabId || this._isStale(item));
    if (this._resetTransientStates(isOrphan)) this._notify();
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────

  pause() {
    this._paused = true;
  }
  resume() {
    this._paused = false;
  }
  isPaused() {
    return this._paused;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getItem(userId) {
    return this._items.get(userId);
  }

  getAll() {
    return this._orderedItems();
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
    this._seqCounter = 0;
    let maxSeq = -1;
    for (let idx = 0; idx < items.length; idx++) {
      const item = { ...items[idx] };
      if (typeof item.seq !== 'number') item.seq = idx;
      if (item.seq > maxSeq) maxSeq = item.seq;
      item._unblockInFlight = false;
      const key = item.userId ?? `pending:${item.username}`;
      this._items.set(key, item);
    }
    this._seqCounter = maxSeq + 1;
    this._resetTransientStates();
    this._notify();
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  onChange(listener) {
    this._listeners.push(listener);
  }

  // ── Bulk clear ────────────────────────────────────────────────────────────

  clearCompleted() {
    for (const [userId, item] of this._items) {
      if (item.state === BlockState.BLOCKED) {
        this._items.delete(userId);
      }
    }
    this._notify();
  }

  clearAll() {
    this._items.clear();
    this._lastSettledAt = -Infinity;
    this._notify();
  }
}
