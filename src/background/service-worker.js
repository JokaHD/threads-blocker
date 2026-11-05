import { QueueManager } from './queue-manager.js';
import { RateLimitHandler } from './rate-limit-handler.js';
import {
  saveQueue,
  loadQueue,
  saveCooldownEnd,
  loadCooldownEnd,
  clearCooldown,
} from './persistence.js';
import { MessageType } from '../shared/messages.js';
import { ErrorType, BlockState, Timing } from '../shared/constants.js';
import { KeywordStats } from './keyword-stats.js';
import { KeywordStorageKey } from '../shared/keywords.js';

// ── State ─────────────────────────────────────────────────────────────────────

const queue = new QueueManager({ dispatchIntervalMs: Timing.BLOCK_INTERVAL });
const rateLimitHandler = new RateLimitHandler();
const keywordStats = new KeywordStats();

// ── Queue persistence & notification ─────────────────────────────────────────

function buildStatus() {
  return {
    ...queue.getQueueStatus(),
    paused: queue.isPaused(),
    cooldownEnd: rateLimitHandler.isInCooldown() ? rateLimitHandler.getCooldownEnd() : null,
  };
}

queue.onChange(async (items) => {
  await saveQueue(items);
  // Notify content scripts via storage (chrome.runtime.sendMessage doesn't reach them)
  await chrome.storage.local.set({ queueNotify: { ts: Date.now(), items, status: buildStatus() } });
});

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  const savedItems = await loadQueue();
  if (savedItems.length > 0) {
    queue.loadFrom(savedItems);
  }

  const cooldownEnd = await loadCooldownEnd();
  if (cooldownEnd !== null) {
    if (Date.now() < cooldownEnd) {
      // Cooldown is still active – restore in-memory state
      await rateLimitHandler.restoreCooldown(cooldownEnd);
      queue.pause();
    } else {
      // Cooldown has expired while SW was inactive
      await clearCooldown();
    }
  }
}

const initPromise = init().catch((err) => {
  // init 失敗時降級為空 queue 繼續服務,不可讓所有後續訊息都拿到 rejected promise
  console.error('[ThreadBlocker] SW init failed:', err);
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  initPromise
    .then(() => handleMessage(message, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(message, sender) {
  // Validate sender - must be from www.threads.com or an extension page.
  // Exact hostname match, not substring: `.includes('threads.com')` would
  // accept `https://evil.com/#threads.com` if a future manifest change ever
  // opened a path for such a sender.
  const url = sender.url || '';
  let isThreads = false;
  try {
    isThreads = new URL(url).hostname === 'www.threads.com';
  } catch {
    // Malformed URL — leave isThreads = false
  }
  const isExtension = url.startsWith('chrome-extension://');
  if (!isThreads && !isExtension) {
    console.warn('[ThreadBlocker] Rejected message from:', url);
    return { error: 'Invalid sender' };
  }

  const { type } = message;
  const tabId = sender.tab?.id ?? null;

  switch (type) {
    case MessageType.REGISTER_EXECUTOR: {
      queue.resetOrphanedTasks(tabId);
      return { ok: true };
    }

    case MessageType.ENQUEUE_BLOCK: {
      const { userId, username } = message;
      queue.enqueue({ userId, username });
      return { ok: true };
    }

    case MessageType.ENQUEUE_BLOCK_BATCH: {
      const { entries } = message;
      queue.enqueueBatch(entries);
      return { ok: true };
    }

    case MessageType.UPDATE_RESOLVED_USER: {
      const { username, userId } = message;
      queue.updateResolvedUser(username, userId);
      return { ok: true };
    }

    case MessageType.GET_NEXT_TASK: {
      if (rateLimitHandler.isInCooldown()) {
        return { task: null, cooldownEnd: rateLimitHandler.getCooldownEnd() };
      }
      const task = queue.getNextTask(tabId);
      if (task) return { task };
      const nextRetryAt = queue.getNextRetryAt();
      if (nextRetryAt !== null) {
        return { task: null, retryAfter: Math.max(0, nextRetryAt - Date.now()) };
      }
      return { task: null };
    }

    case MessageType.TASK_RESULT: {
      const { userId, success, error: errPayload } = message;

      // Only the in-flight task's owner reports on it: a late result from a tab
      // whose stale task was re-dispatched to another tab doesn't count
      if (!queue.acceptsResult(userId, tabId)) return { ok: true };
      const item = queue.getItem(userId);
      if (!item) return { ok: true };

      if (success) {
        if (item.state === BlockState.UNBLOCKING) {
          queue.onUnblockComplete(userId, true);
        } else {
          queue.onTaskComplete(userId, true);
          await keywordStats.onBlocked(item.username);
        }
        return { ok: true };
      }

      // Failure path
      if (item.state === BlockState.UNBLOCKING) {
        // Unblock failures don't retry — revert to BLOCKED so the user can try again
        queue.onUnblockComplete(userId, false);
        return { ok: true };
      }

      const errorType = rateLimitHandler.classifyError(errPayload ?? {});
      const currentRetries = item.retries ?? 0;
      const retryDelay = rateLimitHandler.getRetryDelay(errorType, currentRetries);

      if (errorType === ErrorType.RATE_LIMIT && retryDelay === null) {
        // Exceeded retries for rate limit → enter cooldown
        rateLimitHandler.startCooldown();
        await saveCooldownEnd(rateLimitHandler.getCooldownEnd());
        queue.pause();
        // Revert item back to QUEUED so it will be retried after cooldown
        queue.requeueForCooldown(userId);
        return { ok: true, cooldown: true };
      }

      if (retryDelay !== null) {
        // SW owns the retry schedule; executor just polls again after retryAfter
        queue.scheduleRetry(userId, retryDelay);
        return { ok: true };
      }

      // No more retries → mark as permanently failed
      queue.onTaskComplete(userId, false, { type: errorType, message: errPayload?.message });
      return { ok: true };
    }

    case MessageType.CANCEL_RESOLVING: {
      queue.cancelResolving(message.username);
      return { ok: true };
    }

    case MessageType.CANCEL_QUEUED: {
      queue.cancel(message.userId);
      return { ok: true };
    }

    case MessageType.REQUEST_UNBLOCK: {
      queue.requestUnblock(message.userId);
      return { ok: true };
    }

    case MessageType.RETRY_FAILED: {
      queue.retry(message.userId);
      return { ok: true };
    }

    case MessageType.RETRY_ALL_FAILED: {
      // Paused / in cooldown → items just wait as QUEUED until the queue resumes
      const count = queue.retryAllFailed();
      return { ok: true, count };
    }

    case MessageType.PAUSE_QUEUE: {
      queue.pause();
      return { ok: true };
    }

    case MessageType.RESUME_QUEUE: {
      if (rateLimitHandler.isInCooldown()) {
        rateLimitHandler.clearCooldown();
        await clearCooldown();
      }
      queue.resume();
      await chrome.storage.local.set({
        queueNotify: { ts: Date.now(), items: queue.getAll(), status: buildStatus() },
      });
      return { ok: true };
    }

    case MessageType.GET_ALL_STATES: {
      return { items: queue.getAll() };
    }

    case MessageType.GET_QUEUE_STATUS: {
      return { status: buildStatus() };
    }

    case MessageType.CLEAR_QUEUE: {
      // Clear all queue data
      queue.clearAll();
      await chrome.storage.local.remove(['blockQueue', 'queueNotify', 'cooldownEnd']);
      rateLimitHandler._inCooldown = false;
      rateLimitHandler._cooldownEnd = null;
      console.log('[ThreadBlocker] Queue cleared (all)');
      return { ok: true };
    }

    case MessageType.CLEAR_COMPLETED: {
      // Clear only completed (BLOCKED) items
      queue.clearCompleted();
      console.log('[ThreadBlocker] Queue cleared (completed only)');
      return { ok: true };
    }

    case MessageType.KEYWORD_HITS: {
      await keywordStats.recordHits(message.hits ?? []);
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await initPromise;
  if (alarm.name === RateLimitHandler.ALARM_NAME) {
    rateLimitHandler.clearCooldown();
    await clearCooldown();
    queue.resume();
    await chrome.storage.local.set({
      queueNotify: { ts: Date.now(), items: queue.getAll(), status: buildStatus() },
    });
  }
});

// ── Keyword highlight ─────────────────────────────────────────────────────────

// Keywords are edited in the in-page manager; deleted ones take their stats along
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[KeywordStorageKey.KEYWORDS];
  if (area !== 'local' || !change) return;
  const remaining = new Set((change.newValue ?? []).map((k) => k.id));
  const removed = (change.oldValue ?? []).map((k) => k.id).filter((id) => !remaining.has(id));
  if (removed.length > 0) keywordStats.removeKeywords(removed);
});
