import { MessageType } from '../shared/messages.js';
import { Timing } from '../shared/constants.js';

export class APIExecutor {
  constructor(tokenProvider, apiFunctions) {
    this._tokenProvider = tokenProvider;
    this._api = apiFunctions;
    this._running = false;
    this._paused = false;
  }

  async processTask(task) {
    const { userId, username, action } = task;
    try {
      const token = await this._tokenProvider.getToken();
      const fn = action === 'block' ? this._api.blockUser : this._api.unblockUser;
      let result;
      try {
        result = await fn(userId, token);
      } catch (err) {
        if (err.status === 401) {
          this._tokenProvider.invalidate();
          const newToken = await this._tokenProvider.refreshToken();
          result = await fn(userId, newToken);
        } else {
          throw err;
        }
      }
      await chrome.runtime.sendMessage({
        type: MessageType.TASK_RESULT,
        userId,
        success: true,
      });
    } catch (err) {
      await chrome.runtime.sendMessage({
        type: MessageType.TASK_RESULT,
        userId,
        success: false,
        error: {
          status: err.status || 0,
          message: err.message,
          isNetworkError: !err.status,
        },
      });
    }
  }

  async startPolling() {
    if (this._running) return;
    this._running = true;
    while (this._running) {
      if (this._paused) { await this._sleep(1000); continue; }
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_NEXT_TASK });
      if (response?.task) {
        await this.processTask(response.task);
        await this._sleep(Timing.BLOCK_INTERVAL);
      } else if (response?.cooldownEnd) {
        this._running = false;
        break;
      } else {
        this._running = false;
        break;
      }
    }
  }

  stopPolling() { this._running = false; }
  pause() { this._paused = true; }
  resume() { this._paused = false; }
  _sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
