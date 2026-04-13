/**
 * Tests for service-worker message handling.
 * We test the handleMessage logic by simulating messages.
 */

import { setupChromeMocks, resetChromeMocks, mockStorage, mockAlarms, mockRuntime } from '../setup.js';
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
      await new Promise(resolve => messageHandler({ type: MessageType.CLEAR_QUEUE }, testSender, resolve));
    }
  });

  // Helper to send a message and get the response
  async function sendMessage(message, sender = { tab: { id: 1 }, url: 'https://www.threads.com/' }) {
    return new Promise((resolve) => {
      messageHandler(message, sender, resolve);
    });
  }

  describe('REGISTER_EXECUTOR', () => {
    test('registers executor tab', async () => {
      const response = await sendMessage({
        type: MessageType.REGISTER_EXECUTOR,
      }, { tab: { id: 42 }, url: 'https://www.threads.com/' });

      expect(response).toEqual({ ok: true, executorTabId: 42 });
    });

    test('handles missing tab', async () => {
      const response = await sendMessage({
        type: MessageType.REGISTER_EXECUTOR,
      }, { url: 'https://www.threads.com/' });

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
        retryCount: 0,
      });

      expect(response.ok).toBe(true);
      expect(response.retryDelay).toBeDefined();
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
    test('marks task as failed after max retries for non-rate-limit error', async () => {
      await sendMessage({
        type: MessageType.ENQUEUE_BLOCK,
        userId: 'user123',
        username: 'testuser',
      });
      await sendMessage({ type: MessageType.GET_NEXT_TASK });

      // Send failure with high retry count (exceeds max)
      const response = await sendMessage({
        type: MessageType.TASK_RESULT,
        userId: 'user123',
        success: false,
        error: { status: 500, message: 'Server error' },
        retryCount: 10,
      });

      expect(response.ok).toBe(true);
      // No retryDelay means permanent failure
      expect(response.retryDelay).toBeUndefined();
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
      await new Promise(r => setTimeout(r, 10));

      // Verify cooldown is cleared
      status = await sendMessage({ type: MessageType.GET_QUEUE_STATUS });
      expect(status.status.cooldownEnd).toBeNull();
      expect(status.status.paused).toBe(false);
    });
  });
});
