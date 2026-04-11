import { QueueManager } from './queue-manager.js';
import { RateLimitHandler } from './rate-limit-handler.js';
import {
  saveQueue,
  loadQueue,
  saveCooldownEnd,
  loadCooldownEnd,
  clearCooldown,
} from './persistence.js';
import { MessageType, } from '../shared/messages.js';
import { ErrorType, Timing } from '../shared/constants.js';

// ── State ─────────────────────────────────────────────────────────────────────

const queue = new QueueManager();
const rateLimitHandler = new RateLimitHandler();

/** Tab ID of the content script currently acting as executor */
let executorTabId = null;

// ── Queue persistence & notification ─────────────────────────────────────────

queue.onChange(async (items) => {
  await saveQueue(items);
  // Notify content scripts via storage (chrome.runtime.sendMessage doesn't reach them)
  await chrome.storage.local.set({ queueNotify: { ts: Date.now(), items } });
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
      rateLimitHandler._inCooldown = true;
      rateLimitHandler._cooldownEnd = cooldownEnd;
      queue.pause();
    } else {
      // Cooldown has expired while SW was inactive
      await clearCooldown();
    }
  }
}

init();

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case MessageType.REGISTER_EXECUTOR: {
      executorTabId = sender.tab?.id ?? null;
      return { ok: true, executorTabId };
    }

    case MessageType.ENQUEUE_BLOCK: {
      queue.enqueue(payload);
      return { ok: true };
    }

    case MessageType.ENQUEUE_BLOCK_BATCH: {
      queue.enqueueBatch(payload);
      return { ok: true };
    }

    case MessageType.GET_NEXT_TASK: {
      if (rateLimitHandler.isInCooldown()) {
        return { task: null, cooldownEnd: rateLimitHandler.getCooldownEnd() };
      }
      const task = queue.getNextTask();
      return { task };
    }

    case MessageType.TASK_RESULT: {
      const { userId, success, error: errPayload, retryCount } = payload;

      if (success) {
        const item = queue.getItem(userId);
        const wasUnblocking = item?.state === 'unblocking';
        if (wasUnblocking) {
          queue.onUnblockComplete(userId, true);
        } else {
          queue.onTaskComplete(userId, true);
        }
        return { ok: true };
      }

      // Failure path
      const errorType = rateLimitHandler.classifyError(errPayload ?? {});
      const currentRetries = retryCount ?? (queue.getItem(userId)?.retries ?? 0);
      const retryDelay = rateLimitHandler.getRetryDelay(errorType, currentRetries);

      if (errorType === ErrorType.RATE_LIMIT && retryDelay === null) {
        // Exceeded retries for rate limit → enter cooldown
        rateLimitHandler.startCooldown();
        await saveCooldownEnd(rateLimitHandler.getCooldownEnd());
        queue.pause();
        // Revert item back to QUEUED so it will be retried after cooldown
        const item = queue.getItem(userId);
        if (item) {
          item.state = 'queued';
          item.retries = 0;
        }
        queue._notify();
        return { ok: true, cooldown: true };
      }

      if (retryDelay !== null) {
        const item = queue.getItem(userId);
        if (item) {
          item.retries = currentRetries + 1;
        }
        return { ok: true, retryDelay };
      }

      // No more retries → mark as permanently failed
      queue.onTaskComplete(userId, false, { type: errorType, message: errPayload?.message });
      return { ok: true };
    }

    case MessageType.CANCEL_QUEUED: {
      queue.cancel(payload.userId);
      return { ok: true };
    }

    case MessageType.REQUEST_UNBLOCK: {
      queue.requestUnblock(payload.userId);
      return { ok: true };
    }

    case MessageType.RETRY_FAILED: {
      queue.retry(payload.userId);
      return { ok: true };
    }

    case MessageType.PAUSE_QUEUE: {
      queue.pause();
      return { ok: true };
    }

    case MessageType.RESUME_QUEUE: {
      queue.resume();
      if (rateLimitHandler.isInCooldown()) {
        rateLimitHandler.clearCooldown();
        await clearCooldown();
        await chrome.storage.local.set({ queueNotify: { ts: Date.now(), items: queue.getAll() } });
      }
      return { ok: true };
    }

    case MessageType.GET_ALL_STATES: {
      return { states: queue.getAll() };
    }

    case MessageType.GET_QUEUE_STATUS: {
      return { status: queue.getQueueStatus() };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RateLimitHandler.ALARM_NAME) {
    rateLimitHandler.clearCooldown();
    await clearCooldown();
    queue.resume();
    await chrome.storage.local.set({ queueNotify: { ts: Date.now(), items: queue.getAll() } });
  }
});
