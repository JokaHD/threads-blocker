import { setupChromeMocks, resetChromeMocks } from '../setup.js';
import { ErrorType, Timing } from '../../src/shared/constants.js';

setupChromeMocks();

let RateLimitHandler;
beforeAll(async () => {
  ({ RateLimitHandler } = await import('../../src/background/rate-limit-handler.js'));
});

let handler;
beforeEach(() => {
  resetChromeMocks();
  setupChromeMocks();
  handler = new RateLimitHandler();
});

// ── classifyError ─────────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('classifies 429 as RATE_LIMIT', () => {
    expect(handler.classifyError({ status: 429 })).toBe(ErrorType.RATE_LIMIT);
  });

  it('classifies 401 as AUTH_EXPIRED', () => {
    expect(handler.classifyError({ status: 401 })).toBe(ErrorType.AUTH_EXPIRED);
  });

  it('classifies 400 as PERMANENT', () => {
    expect(handler.classifyError({ status: 400 })).toBe(ErrorType.PERMANENT);
  });

  it('classifies 403 as PERMANENT', () => {
    expect(handler.classifyError({ status: 403 })).toBe(ErrorType.PERMANENT);
  });

  it('classifies 500 as TRANSIENT', () => {
    expect(handler.classifyError({ status: 500 })).toBe(ErrorType.TRANSIENT);
  });

  it('classifies network errors as TRANSIENT', () => {
    expect(handler.classifyError({ isNetworkError: true })).toBe(ErrorType.TRANSIENT);
  });

  it('classifies other status codes as TRANSIENT by default', () => {
    expect(handler.classifyError({ status: 503 })).toBe(ErrorType.TRANSIENT);
  });
});

// ── getRetryDelay ─────────────────────────────────────────────────────────────

describe('getRetryDelay', () => {
  it('returns RETRY_1_DELAY for RATE_LIMIT on first retry (retryCount=0)', () => {
    expect(handler.getRetryDelay(ErrorType.RATE_LIMIT, 0)).toBe(Timing.RETRY_1_DELAY);
  });

  it('returns RETRY_2_DELAY for RATE_LIMIT on second retry (retryCount=1)', () => {
    expect(handler.getRetryDelay(ErrorType.RATE_LIMIT, 1)).toBe(Timing.RETRY_2_DELAY);
  });

  it('returns null for RATE_LIMIT when retries exhausted (retryCount=2)', () => {
    expect(handler.getRetryDelay(ErrorType.RATE_LIMIT, 2)).toBeNull();
  });

  it('returns RETRY_1_DELAY for TRANSIENT on first retry', () => {
    expect(handler.getRetryDelay(ErrorType.TRANSIENT, 0)).toBe(Timing.RETRY_1_DELAY);
  });

  it('returns RETRY_2_DELAY for TRANSIENT on second retry', () => {
    expect(handler.getRetryDelay(ErrorType.TRANSIENT, 1)).toBe(Timing.RETRY_2_DELAY);
  });

  it('returns null for TRANSIENT when retries exhausted', () => {
    expect(handler.getRetryDelay(ErrorType.TRANSIENT, 2)).toBeNull();
  });

  it('returns null for PERMANENT (no retry)', () => {
    expect(handler.getRetryDelay(ErrorType.PERMANENT, 0)).toBeNull();
  });

  it('returns 0 delay for AUTH_EXPIRED on first retry', () => {
    expect(handler.getRetryDelay(ErrorType.AUTH_EXPIRED, 0)).toBe(0);
  });

  it('returns null for AUTH_EXPIRED on second retry (no more retries)', () => {
    expect(handler.getRetryDelay(ErrorType.AUTH_EXPIRED, 1)).toBeNull();
  });
});

// ── startCooldown ─────────────────────────────────────────────────────────────

describe('startCooldown', () => {
  it('sets inCooldown to true', () => {
    handler.startCooldown();
    expect(handler.isInCooldown()).toBe(true);
  });

  it('sets cooldownEnd to approximately now + COOLDOWN_MINUTES minutes', () => {
    const before = Date.now();
    handler.startCooldown();
    const after = Date.now();
    const expectedMs = Timing.COOLDOWN_MINUTES * 60 * 1000;
    expect(handler.getCooldownEnd()).toBeGreaterThanOrEqual(before + expectedMs);
    expect(handler.getCooldownEnd()).toBeLessThanOrEqual(after + expectedMs);
  });

  it('creates a chrome alarm with COOLDOWN_MINUTES delay', () => {
    handler.startCooldown();
    expect(chrome.alarms.create).toHaveBeenCalledWith(RateLimitHandler.ALARM_NAME, {
      delayInMinutes: Timing.COOLDOWN_MINUTES,
    });
  });
});

// ── isInCooldown ──────────────────────────────────────────────────────────────

describe('isInCooldown', () => {
  it('returns false initially', () => {
    expect(handler.isInCooldown()).toBe(false);
  });

  it('returns true after startCooldown', () => {
    handler.startCooldown();
    expect(handler.isInCooldown()).toBe(true);
  });
});

// ── clearCooldown ─────────────────────────────────────────────────────────────

describe('clearCooldown', () => {
  it('sets inCooldown to false', () => {
    handler.startCooldown();
    handler.clearCooldown();
    expect(handler.isInCooldown()).toBe(false);
  });

  it('sets cooldownEnd to null', () => {
    handler.startCooldown();
    handler.clearCooldown();
    expect(handler.getCooldownEnd()).toBeNull();
  });

  it('clears the chrome alarm', () => {
    handler.startCooldown();
    handler.clearCooldown();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(RateLimitHandler.ALARM_NAME);
  });
});

// ── static ALARM_NAME ─────────────────────────────────────────────────────────

describe('ALARM_NAME', () => {
  it('exposes a static ALARM_NAME constant', () => {
    expect(typeof RateLimitHandler.ALARM_NAME).toBe('string');
    expect(RateLimitHandler.ALARM_NAME.length).toBeGreaterThan(0);
  });
});
