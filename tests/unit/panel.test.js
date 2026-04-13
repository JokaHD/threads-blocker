/**
 * @jest-environment jsdom
 */

import { Panel } from '../../src/content/ui/panel.js';
import { BlockState } from '../../src/shared/constants.js';
import { MessageType } from '../../src/shared/messages.js';

// Mock chrome.runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
  },
};

describe('Panel', () => {
  let panel;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    panel = new Panel(container);
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    panel.destroy();
    container.remove();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('creates panel element in container', () => {
      panel.init();

      const el = container.querySelector('.tb-panel');
      expect(el).not.toBeNull();
      expect(el.getAttribute('role')).toBe('region');
    });

    test('creates badge, header, progress bar, body, and footer', () => {
      panel.init();

      expect(container.querySelector('.tb-panel-badge')).not.toBeNull();
      expect(container.querySelector('.tb-panel-header')).not.toBeNull();
      expect(container.querySelector('.tb-panel-progress-bar')).not.toBeNull();
      expect(container.querySelector('.tb-panel-body')).not.toBeNull();
      expect(container.querySelector('.tb-panel-footer')).not.toBeNull();
    });

    test('starts minimized', () => {
      panel.init();

      const el = container.querySelector('.tb-panel');
      expect(el.classList.contains('tb-panel-minimized')).toBe(true);
    });
  });

  describe('update', () => {
    test('hides panel when no items', () => {
      panel.init();
      panel.update([], {});

      const el = container.querySelector('.tb-panel');
      expect(el.classList.contains('tb-panel-hidden')).toBe(true);
    });

    test('shows panel when items exist', () => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {});

      const el = container.querySelector('.tb-panel');
      expect(el.classList.contains('tb-panel-hidden')).toBe(false);
    });

    test('updates badge text with progress', () => {
      panel.init();
      panel.update(
        [
          { userId: '1', username: 'user1', state: BlockState.BLOCKED },
          { userId: '2', username: 'user2', state: BlockState.QUEUED },
        ],
        {}
      );

      const badge = container.querySelector('.tb-panel-badge-text');
      expect(badge.textContent).toBe('1/2');
    });

    test('updates progress bar width', () => {
      panel.init();
      panel.update(
        [
          { userId: '1', username: 'user1', state: BlockState.BLOCKED },
          { userId: '2', username: 'user2', state: BlockState.BLOCKED },
          { userId: '3', username: 'user3', state: BlockState.QUEUED },
          { userId: '4', username: 'user4', state: BlockState.QUEUED },
        ],
        {}
      );

      const fill = container.querySelector('.tb-panel-progress-fill');
      expect(fill.style.width).toBe('50%');
    });

    test('renders items in body', () => {
      panel.init();
      panel.update(
        [
          { userId: '1', username: 'user1', state: BlockState.QUEUED },
          { userId: '2', username: 'user2', state: BlockState.BLOCKED },
        ],
        {}
      );

      const items = container.querySelectorAll('.tb-panel-item');
      expect(items.length).toBe(2);
      expect(items[0].querySelector('.tb-panel-item-name').textContent).toBe('@user1');
    });

    test('shows cancel button for queued items', () => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {});

      const cancelBtn = container.querySelector('.tb-panel-item-action');
      expect(cancelBtn).not.toBeNull();

      cancelBtn.click();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.CANCEL_QUEUED,
        userId: '1',
      });
    });

    test('shows retry button for failed items', () => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state: BlockState.FAILED }], {});

      const retryBtn = container.querySelector('.tb-panel-item-action');
      expect(retryBtn).not.toBeNull();

      retryBtn.click();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.RETRY_FAILED,
        userId: '1',
      });
    });

    test('does nothing if not initialized', () => {
      // Don't call init
      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {});
      // Should not throw
    });
  });

  describe('minimize toggle', () => {
    test('toggles minimized state when badge clicked', () => {
      panel.init();

      const badge = container.querySelector('.tb-panel-badge');
      const el = container.querySelector('.tb-panel');

      expect(el.classList.contains('tb-panel-minimized')).toBe(true);

      badge.click();
      expect(el.classList.contains('tb-panel-minimized')).toBe(false);

      badge.click();
      expect(el.classList.contains('tb-panel-minimized')).toBe(true);
    });
  });

  describe('pause toggle', () => {
    test('sends pause message when clicked', () => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {
        paused: false,
      });

      const pauseBtn = container.querySelector('.tb-panel-pause-btn');
      pauseBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.PAUSE_QUEUE,
      });
    });

    test('sends resume message when paused', () => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {
        paused: true,
      });

      const pauseBtn = container.querySelector('.tb-panel-pause-btn');
      pauseBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.RESUME_QUEUE,
      });
    });

    test('updates button text based on pause state', () => {
      panel.init();

      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {
        paused: false,
      });
      let pauseBtn = container.querySelector('.tb-panel-pause-btn');
      expect(pauseBtn.textContent).toContain('Pause');

      panel.update([{ userId: '1', username: 'user1', state: BlockState.QUEUED }], {
        paused: true,
      });
      pauseBtn = container.querySelector('.tb-panel-pause-btn');
      expect(pauseBtn.textContent).toContain('Resume');
    });
  });

  describe('footer actions', () => {
    test('clear completed sends message', () => {
      panel.init();

      const clearCompletedBtn = container.querySelector(
        '.tb-panel-action-btn:not(.tb-panel-action-btn--danger)'
      );
      clearCompletedBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.CLEAR_COMPLETED,
      });
    });

    test('clear all sends message', () => {
      panel.init();

      const clearAllBtn = container.querySelector('.tb-panel-action-btn--danger');
      clearAllBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.CLEAR_QUEUE,
      });
    });
  });

  describe('cooldown', () => {
    test('displays cooldown timer', () => {
      panel.init();

      const cooldownEnd = Date.now() + 60000; // 1 minute
      panel.setCooldownEnd(cooldownEnd);

      const timeSpan = container.querySelector('.tb-panel-cooldown-time');
      expect(timeSpan.textContent).toBe('1:00');
    });

    test('updates countdown every second', () => {
      panel.init();

      const cooldownEnd = Date.now() + 65000;
      panel.setCooldownEnd(cooldownEnd);

      jest.advanceTimersByTime(1000);

      const timeSpan = container.querySelector('.tb-panel-cooldown-time');
      expect(timeSpan.textContent).toBe('1:04');
    });

    test('hides cooldown when expired', () => {
      panel.init();

      const cooldownEnd = Date.now() + 1000;
      panel.setCooldownEnd(cooldownEnd);

      jest.advanceTimersByTime(2000);

      const cooldownBtn = container.querySelector('.tb-panel-cooldown-btn');
      expect(cooldownBtn.style.display).toBe('none');
    });

    test('retry now button sends resume message', () => {
      panel.init();

      const cooldownEnd = Date.now() + 60000;
      panel.setCooldownEnd(cooldownEnd);

      const retryBtn = container.querySelector('.tb-panel-cooldown-retry-btn');
      retryBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.RESUME_QUEUE,
      });
    });
  });

  describe('destroy', () => {
    test('removes panel element', () => {
      panel.init();
      expect(container.querySelector('.tb-panel')).not.toBeNull();

      panel.destroy();
      expect(container.querySelector('.tb-panel')).toBeNull();
    });

    test('clears cooldown interval', () => {
      panel.init();
      panel.setCooldownEnd(Date.now() + 60000);

      panel.destroy();
      // Should not throw or continue interval
    });
  });

  describe('state labels', () => {
    test.each([
      [BlockState.QUEUED, 'Queued'],
      [BlockState.BLOCKING, 'Blocking...'],
      [BlockState.BLOCKED, 'Blocked'],
      [BlockState.UNBLOCKING, 'Unblocking...'],
      [BlockState.FAILED, 'Failed'],
    ])('renders correct label for %s state', (state, expected) => {
      panel.init();
      panel.update([{ userId: '1', username: 'user1', state }], {});

      const status = container.querySelector('.tb-panel-item-status');
      expect(status.textContent).toBe(expected);
    });
  });
});
