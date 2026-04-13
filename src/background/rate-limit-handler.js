import { ErrorType, Timing } from '../shared/constants.js';

const ALARM_NAME = 'rateLimitCooldown';

export class RateLimitHandler {
  constructor() {
    this._inCooldown = false;
    this._cooldownEnd = null;
  }

  classifyError({ status, isNetworkError }) {
    if (status === 429) return ErrorType.RATE_LIMIT;
    if (status === 401) return ErrorType.AUTH_EXPIRED;
    if (status === 400 || status === 403) return ErrorType.PERMANENT;
    if (status >= 500 || isNetworkError) return ErrorType.TRANSIENT;
    return ErrorType.TRANSIENT;
  }

  getRetryDelay(errorType, retryCount) {
    if (errorType === ErrorType.PERMANENT) return null;
    if (errorType === ErrorType.AUTH_EXPIRED) return retryCount === 0 ? 0 : null;
    if (retryCount === 0) return Timing.RETRY_1_DELAY;
    if (retryCount === 1) return Timing.RETRY_2_DELAY;
    return null;
  }

  startCooldown() {
    this._inCooldown = true;
    this._cooldownEnd = Date.now() + Timing.COOLDOWN_MINUTES * 60 * 1000;
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: Timing.COOLDOWN_MINUTES });
  }

  clearCooldown() {
    this._inCooldown = false;
    this._cooldownEnd = null;
    chrome.alarms.clear(ALARM_NAME);
  }

  isInCooldown() {
    return this._inCooldown;
  }
  getCooldownEnd() {
    return this._cooldownEnd;
  }

  static ALARM_NAME = ALARM_NAME;
}
