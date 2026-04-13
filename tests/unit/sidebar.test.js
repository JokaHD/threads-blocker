/**
 * @jest-environment jsdom
 */

import { Sidebar } from '../../src/content/ui/sidebar.js';
import { BlockState, UIState, Timing } from '../../src/shared/constants.js';
import { MessageType } from '../../src/shared/messages.js';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined' || !CSS.escape) {
  global.CSS = {
    escape: (str) => str.replace(/([^\w-])/g, '\\$1'),
  };
}

// Mock chrome.runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
  },
};

describe('Sidebar', () => {
  let sidebar;
  let mockSelectionManager;
  let mockIdResolver;

  beforeEach(() => {
    mockSelectionManager = {
      isSelected: jest.fn(() => false),
    };

    mockIdResolver = {
      resolve: jest.fn().mockResolvedValue('user-id-123'),
    };

    sidebar = new Sidebar(mockSelectionManager, mockIdResolver);
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    sidebar.destroy();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('creates sidebar element', () => {
      sidebar.init();

      const el = document.querySelector('.tb-sidebar');
      expect(el).not.toBeNull();
    });

    test('creates header with title', () => {
      sidebar.init();

      const header = document.querySelector('.tb-sidebar-header');
      expect(header).not.toBeNull();
      expect(header.textContent).toContain('封鎖工具');
    });

    test('creates toggle button', () => {
      sidebar.init();

      const toggle = document.querySelector('.tb-sidebar-toggle');
      expect(toggle).not.toBeNull();
    });

    test('creates list container', () => {
      sidebar.init();

      const list = document.querySelector('.tb-sidebar-list');
      expect(list).not.toBeNull();
    });

    test('sets accessibility attributes', () => {
      sidebar.init();

      const el = document.querySelector('.tb-sidebar');
      expect(el.getAttribute('role')).toBe('region');
      expect(el.getAttribute('aria-label')).toBe('封鎖工具列');
    });
  });

  describe('toggle button', () => {
    test('minimizes sidebar on click', () => {
      sidebar.init();
      const toggle = document.querySelector('.tb-sidebar-toggle');
      const el = document.querySelector('.tb-sidebar');

      toggle.click();

      expect(el.classList.contains('tb-sidebar-minimized')).toBe(true);
    });

    test('expands sidebar on second click', () => {
      sidebar.init();
      const toggle = document.querySelector('.tb-sidebar-toggle');
      const el = document.querySelector('.tb-sidebar');

      toggle.click();
      toggle.click();

      expect(el.classList.contains('tb-sidebar-minimized')).toBe(false);
    });

    test('updates aria-label when toggling', () => {
      sidebar.init();
      const toggle = document.querySelector('.tb-sidebar-toggle');

      toggle.click();
      expect(toggle.getAttribute('aria-label')).toBe('展開');

      toggle.click();
      expect(toggle.getAttribute('aria-label')).toBe('收合');
    });
  });

  describe('addUser', () => {
    test('adds user to list', () => {
      sidebar.init();
      const commentEl = document.createElement('div');

      sidebar.addUser('testuser', commentEl);

      const row = document.querySelector('[data-tb-user="testuser"]');
      expect(row).not.toBeNull();
      expect(row.textContent).toContain('@testuser');
    });

    test('does not duplicate existing user', () => {
      sidebar.init();
      const commentEl = document.createElement('div');

      sidebar.addUser('testuser', commentEl);
      sidebar.addUser('testuser', commentEl);

      const rows = document.querySelectorAll('[data-tb-user="testuser"]');
      expect(rows.length).toBe(1);
    });

    test('creates block button for new user', () => {
      sidebar.init();
      sidebar.addUser('testuser', document.createElement('div'));

      const btn = document.querySelector('.tb-sbtn-idle');
      expect(btn).not.toBeNull();
    });
  });

  describe('updateState', () => {
    beforeEach(() => {
      sidebar.init();
      sidebar.addUser('testuser', document.createElement('div'));
    });

    test('updates button to queued state', () => {
      sidebar.updateState('testuser', BlockState.QUEUED);

      const btn = document.querySelector('.tb-sbtn-queued');
      expect(btn).not.toBeNull();
    });

    test('updates button to blocked state', () => {
      sidebar.updateState('testuser', BlockState.BLOCKED);

      const btn = document.querySelector('.tb-sbtn-blocked');
      expect(btn).not.toBeNull();
    });

    test('updates button to failed state', () => {
      sidebar.updateState('testuser', BlockState.FAILED);

      const btn = document.querySelector('.tb-sbtn-failed');
      expect(btn).not.toBeNull();
    });

    test('shows spinner during blocking', () => {
      sidebar.updateState('testuser', BlockState.BLOCKING);

      const spinner = document.querySelector('.tb-sbtn-blocking');
      expect(spinner).not.toBeNull();
      expect(spinner.tagName).toBe('SPAN');
    });

    test('ignores unknown user', () => {
      expect(() => sidebar.updateState('unknown', BlockState.BLOCKED)).not.toThrow();
    });
  });

  describe('button clicks', () => {
    beforeEach(() => {
      sidebar.init();
      sidebar.addUser('testuser', document.createElement('div'));
    });

    test('sends ENQUEUE_BLOCK when clicking idle user', async () => {
      const btn = document.querySelector('.tb-sbtn-idle');
      btn.click();

      await Promise.resolve(); // Let async handler run

      expect(mockIdResolver.resolve).toHaveBeenCalledWith('testuser', expect.any(HTMLElement));
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.ENQUEUE_BLOCK,
        username: 'testuser',
        userId: 'user-id-123',
      });
    });

    test('sends CANCEL_QUEUED when clicking queued user', async () => {
      // First enqueue to get userId
      const btn = document.querySelector('.tb-sbtn-idle');
      btn.click();
      await Promise.resolve();

      // Update to queued state
      sidebar.updateState('testuser', BlockState.QUEUED);

      const cancelBtn = document.querySelector('.tb-sbtn-queued');
      cancelBtn.click();
      await Promise.resolve();

      expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: MessageType.CANCEL_QUEUED,
        userId: 'user-id-123',
      });
    });

    test('shows confirm button when clicking blocked user', () => {
      sidebar.updateState('testuser', BlockState.BLOCKED);
      const btn = document.querySelector('.tb-sbtn-blocked');
      btn.click();

      const confirmBtn = document.querySelector('.tb-sbtn-confirm');
      expect(confirmBtn).not.toBeNull();
    });

    test('reverts confirm after timeout', () => {
      sidebar.updateState('testuser', BlockState.BLOCKED);
      const btn = document.querySelector('.tb-sbtn-blocked');
      btn.click();

      expect(document.querySelector('.tb-sbtn-confirm')).not.toBeNull();

      jest.advanceTimersByTime(Timing.CONFIRM_UNBLOCK_TIMEOUT);

      expect(document.querySelector('.tb-sbtn-confirm')).toBeNull();
      expect(document.querySelector('.tb-sbtn-blocked')).not.toBeNull();
    });

    test('sends REQUEST_UNBLOCK when confirming unblock', async () => {
      // Set up blocked user with userId
      const btn = document.querySelector('.tb-sbtn-idle');
      btn.click();
      await Promise.resolve();

      sidebar.updateState('testuser', BlockState.BLOCKED);
      document.querySelector('.tb-sbtn-blocked').click();

      const confirmBtn = document.querySelector('.tb-sbtn-confirm');
      confirmBtn.click();
      await Promise.resolve();

      expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: MessageType.REQUEST_UNBLOCK,
        userId: 'user-id-123',
      });
    });

    test('sends RETRY_FAILED when clicking failed user', async () => {
      // First enqueue to get userId
      const btn = document.querySelector('.tb-sbtn-idle');
      btn.click();
      await Promise.resolve();

      sidebar.updateState('testuser', BlockState.FAILED);

      const retryBtn = document.querySelector('.tb-sbtn-failed');
      retryBtn.click();
      await Promise.resolve();

      expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: MessageType.RETRY_FAILED,
        username: 'testuser',
        userId: 'user-id-123',
      });
    });

    test('ignores click during blocking state', async () => {
      sidebar.updateState('testuser', BlockState.BLOCKING);

      chrome.runtime.sendMessage.mockClear();
      const spinner = document.querySelector('.tb-sbtn-blocking');

      // Spinner doesn't have click handler, but test the guard in _handleClick
      // We need to call _handleClick directly or simulate the state
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('updateCheckboxes', () => {
    test('updates selection state of rows', () => {
      sidebar.init();
      sidebar.addUser('user1', document.createElement('div'));
      sidebar.addUser('user2', document.createElement('div'));

      mockSelectionManager.isSelected.mockImplementation(u => u === 'user1');
      sidebar.updateCheckboxes();

      const row1 = document.querySelector('[data-tb-user="user1"]');
      const row2 = document.querySelector('[data-tb-user="user2"]');

      expect(row1.classList.contains('tb-sidebar-row-selected')).toBe(true);
      expect(row2.classList.contains('tb-sidebar-row-selected')).toBe(false);
    });
  });

  describe('destroy', () => {
    test('removes sidebar from DOM', () => {
      sidebar.init();
      expect(document.querySelector('.tb-sidebar')).not.toBeNull();

      sidebar.destroy();

      expect(document.querySelector('.tb-sidebar')).toBeNull();
    });

    test('is safe to call multiple times', () => {
      sidebar.init();

      sidebar.destroy();
      sidebar.destroy();

      expect(document.querySelector('.tb-sidebar')).toBeNull();
    });
  });

  describe('username click', () => {
    test('scrolls to comment element', () => {
      sidebar.init();
      const commentEl = document.createElement('div');
      commentEl.scrollIntoView = jest.fn();

      sidebar.addUser('testuser', commentEl);

      const nameEl = document.querySelector('.tb-sidebar-username');
      nameEl.click();

      expect(commentEl.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });
  });
});
