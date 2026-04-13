import { MessageType } from '../shared/messages.js';
import { Timing } from '../shared/constants.js';

export class APIExecutor {
  constructor(tokenProvider, apiFunctions) {
    this._tokenProvider = tokenProvider;
    this._api = apiFunctions;
    this._running = false;
    this._paused = false;
    this._pollingPromise = null;
  }

  async processTask(task) {
    const { userId, action } = task;

    try {
      const fn = action === 'block' ? this._api.blockUser : this._api.unblockUser;

      let result = await fn(userId);

      // Handle 401 - refresh tokens and retry
      if (!result.success && result.status === 401) {
        console.log('[ThreadBlocker] Got 401, refreshing tokens...');
        this._tokenProvider.invalidate();
        await this._tokenProvider.refreshTokens();
        result = await fn(userId);
      }

      if (result.success) {
        await chrome.runtime.sendMessage({
          type: MessageType.TASK_RESULT,
          userId,
          success: true,
        });
      } else {
        await chrome.runtime.sendMessage({
          type: MessageType.TASK_RESULT,
          userId,
          success: false,
          error: {
            status: result.status || 0,
            message: result.error || 'Unknown error',
            isNetworkError: !result.status,
          },
        });
      }
    } catch (err) {
      console.error('[ThreadBlocker] Task error:', err);
      await chrome.runtime.sendMessage({
        type: MessageType.TASK_RESULT,
        userId,
        success: false,
        error: {
          status: 0,
          message: err.message,
          isNetworkError: true,
        },
      });
    }
  }

  startPolling() {
    // Return existing promise if already polling
    if (this._pollingPromise) return this._pollingPromise;

    this._running = true;
    this._pollingPromise = this._pollLoop().finally(() => {
      this._pollingPromise = null;
      this._running = false;
    });

    return this._pollingPromise;
  }

  async _pollLoop() {
    console.log('[ThreadBlocker] Starting task polling...');

    while (this._running) {
      if (this._paused) {
        await this._sleep(1000);
        continue;
      }

      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_NEXT_TASK });

      if (response?.task) {
        console.log('[ThreadBlocker] Processing task:', response.task);
        await this.processTask(response.task);
        await this._sleep(Timing.BLOCK_INTERVAL);
      } else if (response?.cooldownEnd) {
        console.log('[ThreadBlocker] Queue is in cooldown');
        break;
      } else {
        console.log('[ThreadBlocker] No more tasks');
        break;
      }
    }
  }

  stopPolling() {
    this._running = false;
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
