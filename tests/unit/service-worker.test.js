/**
 * Tests for service-worker message handling.
 * We test the handleMessage logic by simulating messages.
 */

import { jest } from '@jest/globals';
import {
  setupChromeMocks,
  resetChromeMocks,
  mockStorage,
  mockAlarms,
  mockRuntime,
} from '../setup.js';
import { RateLimitHandler } from '../../src/background/rate-limit-handler.js';
import { MessageType } from '../../src/shared/messages.js';

// Setup mocks before importing service-worker
setupChromeMocks();

// The service-worker runs init() on import, so we need mocks ready
// We'll test message handling by sending messages through mockRuntime

describe('Service Worker', () => {
  let messageHandler;

  beforeAll(async () => {
    // Import service-worker - this registers the message listener
    await import('../../src/background/service-worker.js');

    // Get the registered message handler
    messageHandler = mockRuntime.onMessage.addListener.mock.calls[0]?.[0];
  });

  beforeEach(async () => {
    resetChromeMocks();
    // Clear queue state between tests
    if (messageHandler) {
      const testSender = { url: 'https://www.threads.com/' };
      await new Promise((resolve) =>
        messageHandler({ type: MessageType.CLEAR_QUEUE }, testSender, resolve)
      );
    }
  });

  // Helper to send a message and get the response
  async function sendMessage(
    message,
    sender = { tab: { id: 1 }, url: 'https://www.threads.com/' }
  ) {
    return new Promise((resolve) => {
      messageHandler(message, sender, resolve);
    });
  }

  describe('REGISTER_EXECUTOR', () => {
    test('registers executor tab', async () => {
      const response = await sendMessage(
        {
          type: MessageType.REGISTER_EXECUTOR,
        },
        { tab: { id: 42 }, url: 'https://www.threads.com/' }
      );

      expect(response).toEqual({ ok: true, executorTabId: 42 });
    });

    test('handles missing tab', async () => {
      const response = await sendMessage(
        {
          type: MessageType.REGISTER_EXECUTOR,
        },
        { url: 'https://www.threads.com/' }
      );

      expect(response).toEqual({ ok: true, executorTabId: null });
    });
  });

  describe('ENQUEUE_BLOCK', () => {
    test('enqueues single user', async () => {
      const response = await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('ENQUEUE_BLOCK_BATCH', () => {
    test('enqueues multiple users', async () => {
      const response = await sendMessage({
        type: MessageType.ENQUEUE_BLOCK_BATCH,
        entries: [
          { userId: 'user1', username: 'test1' },
          { userId: 'user2', username: 'test2' },
        ],
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('GET_NEXT_TASK', () => {
    test('returns null task when queue empty', async () => {
      const response = await sendMessage({
        type: MessageType.GET_NEXT_TASK,
      });

      expect(response).toHaveProperty('task');
    });

    test('returns task after enqueue', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      const response = await sendMessage({
        type: MessageType.GET_NEXT_TASK,
      });

      expect(response.task).not.toBeNull();
      expect(response.task.userId).toBe('user123');
    });
  });

  describe('TASK_RESULT', () => {
    test('handles successful task', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      // Get task to mark it as in-progress
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      const response = await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: true,
      });

      expect(response).toEqual({ ok: true });
    });

    test('handles failed task with retry', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      const response = await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: false,
        error: { message: 'Network error' },
      });

      expect(response.ok).toBe(true);
      // 新契約:retry 由 SW 排程,item revert 到 QUEUED 帶 nextAttemptAt
      const { items } = await sendMessage({ type: MessageType.GET_ALL_STATES });
      const item = items.find((i) => i.userId === 'user123');
      expect(item.state).toBe('queued');
      expect(item.retries).toBe(1);
      expect(item.nextAttemptAt).toBeGreaterThan(Date.now());
    });
  });

  describe('CANCEL_QUEUED', () => {
    test('cancels queued user', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      const response = await sendMessage({
        type: MessageType.CANCEL_QUEUED,
        userId: 'user123',
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('PAUSE_QUEUE and RESUME_QUEUE', () => {
    test('pauses queue', async () => {
      const response = await sendMessage({
        type: MessageType.PAUSE_QUEUE,
      });

      expect(response).toEqual({ ok: true });
    });

    test('resumes queue', async () => {
      const response = await sendMessage({
        type: MessageType.RESUME_QUEUE,
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('GET_ALL_STATES', () => {
    test('returns queue items', async () => {
      const response = await sendMessage({
        type: MessageType.GET_ALL_STATES,
      });

      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
    });
  });

  describe('GET_QUEUE_STATUS', () => {
    test('returns queue status with basic properties', async () => {
      const response = await sendMessage({
        type: MessageType.GET_QUEUE_STATUS,
      });

      expect(response).toHaveProperty('status');
      expect(response.status).toHaveProperty('paused');
      expect(response.status).toHaveProperty('cooldownEnd');
    });

    test('includes state counts when items in queue', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      const response = await sendMessage({
        type: MessageType.GET_QUEUE_STATUS,
      });

      expect(response.status.queued).toBe(1);
    });
  });

  describe('CLEAR_QUEUE', () => {
    test('clears all queue data', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      const response = await sendMessage({
        type: MessageType.CLEAR_QUEUE,
      });

      expect(response).toEqual({ ok: true });
      expect(mockStorage.remove).toHaveBeenCalled();
    });
  });

  describe('CLEAR_COMPLETED', () => {
    test('clears completed items', async () => {
      const response = await sendMessage({
        type: MessageType.CLEAR_COMPLETED,
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('Unknown message type', () => {
    test('returns error for unknown type', async () => {
      const response = await sendMessage({
        type: 'UNKNOWN_TYPE',
      });

      expect(response.error).toContain('Unknown message type');
    });
  });

  describe('REQUEST_UNBLOCK', () => {
    test('requests unblock for a blocked user', async () => {
      // First block a user completely
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: true,
      });

      // Now request unblock
      const response = await sendMessage({
        type: MessageType.REQUEST_UNBLOCK,
        userId: 'user123',
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('RETRY_FAILED', () => {
    test('retries a failed task', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });

      const response = await sendMessage({
        type: MessageType.RETRY_FAILED,
        userId: 'user123',
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('Rate limit scenarios', () => {
    test('returns cooldownEnd when in cooldown', async () => {
      // Enqueue and get task
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      // Simulate multiple rate limit failures to trigger cooldown
      for (let i = 0; i < 5; i++) {
        await sendMessage({
          type: MessageType.TASK_RESULT,
          userId: 'user123',
          success: false,
          error: { status: 429 },
          retryCount: i,
        });
      }

      // Now GET_NEXT_TASK should return cooldown
      const response = await sendMessage({
        type: MessageType.GET_NEXT_TASK,
      });

      expect(response.task).toBeNull();
      expect(response.cooldownEnd).toBeDefined();
    });

    test('RESUME_QUEUE clears cooldown', async () => {
      // Trigger cooldown first
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      for (let i = 0; i < 5; i++) {
        await sendMessage({
          type: MessageType.TASK_RESULT,
          userId: 'user123',
          success: false,
          error: { status: 429 },
          retryCount: i,
        });
      }

      // Resume should clear cooldown
      const response = await sendMessage({
        type: MessageType.RESUME_QUEUE,
      });

      expect(response).toEqual({ ok: true });

      // Verify cooldown is cleared
      const status = await sendMessage({
        type: MessageType.GET_QUEUE_STATUS,
      });
      expect(status.status.cooldownEnd).toBeNull();
    });
  });

  describe('Unblock flow', () => {
    test('handles successful unblock completion', async () => {
      // Enqueue, block, then request unblock
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: true,
      });

      // Request unblock
      await sendMessage({
        type: MessageType.REQUEST_UNBLOCK,
        userId: 'user123',
      });

      // Get the unblock task
      const taskResponse = await sendMessage({ type: MessageType.GET_NEXT_TASK });
      expect(taskResponse.task).not.toBeNull();

      // Complete the unblock
      const response = await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: true,
      });

      expect(response).toEqual({ ok: true });
    });
  });

  describe('Permanent failure', () => {
    test('permanent error (403) fails immediately without retry', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      const response = await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: false,
        error: { status: 403, message: 'Forbidden' },
      });

      expect(response.ok).toBe(true);
      const { items } = await sendMessage({ type: MessageType.GET_ALL_STATES });
      expect(items.find((i) => i.userId === 'user123').state).toBe('failed');
    });
  });

  describe('TASK_RESULT retry scheduling', () => {
    test('transient failure reverts item to QUEUED with retry scheduled', async () => {
      await sendMessage({ type: MessageType.ENQUEUE_BLOCK, userId: '9', username: 'zoe' });
      await sendMessage({ type: MessageType.GET_NEXT_TASK }); // → BLOCKING
      await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: '9',
        success: false,
        error: { status: 500, message: 'boom' },
      });

      const { items } = await sendMessage({ type: MessageType.GET_ALL_STATES });
      const item = items.find((i) => i.userId === '9');
      expect(item.state).toBe('queued');
      expect(item.retries).toBe(1);
      expect(item.nextAttemptAt).toBeGreaterThan(Date.now());

      // 未到期 → 不派發,但回報 retryAfter 讓 executor 知道要等多久
      const next = await sendMessage({ type: MessageType.GET_NEXT_TASK });
      expect(next.task).toBeNull();
      expect(next.retryAfter).toBeGreaterThan(0);
    });

    test('failures become FAILED after retry budget is exhausted', async () => {
      const realNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

      await sendMessage({ type: MessageType.ENQUEUE_BLOCK, userId: '9', username: 'zoe' });
      const fail = () =>
        sendMessage({
          type: MessageType.TASK_RESULT,
          userId: '9',
          success: false,
          error: { status: 500, message: 'boom' },
        });

      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await fail(); // retries 0→1, delay 3000
      nowSpy.mockReturnValue(realNow + 4000);
      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await fail(); // retries 1→2, delay 5000
      nowSpy.mockReturnValue(realNow + 10000);
      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await fail(); // retries=2 → getRetryDelay null → FAILED

      const { items } = await sendMessage({ type: MessageType.GET_ALL_STATES });
      expect(items.find((i) => i.userId === '9').state).toBe('failed');

      nowSpy.mockRestore();
    });

    test('unblock failure reverts to BLOCKED without retry', async () => {
      await sendMessage({ type: MessageType.ENQUEUE_BLOCK, userId: '9', username: 'zoe' });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });
      await sendMessage({ type: MessageType.TASK_RESULT, userId: '9', success: true }); // → BLOCKED
      await sendMessage({ type: MessageType.REQUEST_UNBLOCK, userId: '9' }); // → UNBLOCKING
      await sendMessage({ type: MessageType.GET_NEXT_TASK }); // 派發 unblock
      await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: '9',
        success: false,
        error: { status: 500, message: 'boom' },
      });

      const { items } = await sendMessage({ type: MessageType.GET_ALL_STATES });
      expect(items.find((i) => i.userId === '9').state).toBe('blocked');
    });
  });

  describe('Alarm handler', () => {
    test('clears cooldown when alarm fires', async () => {
      // Trigger cooldown
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      for (let i = 0; i < 5; i++) {
        await sendMessage({
          type: MessageType.TASK_RESULT,
          userId: 'user123',
          success: false,
          error: { status: 429 },
          retryCount: i,
        });
      }

      // Verify cooldown is active
      let status = await sendMessage({ type: MessageType.GET_QUEUE_STATUS });
      expect(status.status.cooldownEnd).not.toBeNull();

      // Trigger the alarm
      mockAlarms._trigger({ name: RateLimitHandler.ALARM_NAME });

      // Wait a tick for async handler
      await new Promise((r) => setTimeout(r, 10));

      // Verify cooldown is cleared
      status = await sendMessage({ type: MessageType.GET_QUEUE_STATUS });
      expect(status.status.cooldownEnd).toBeNull();
      expect(status.status.paused).toBe(false);
    });
  });
});
