/**
 * @jest-environment jsdom
 */

import { Toolbar } from '../../src/content/ui/toolbar.js';
import { MessageType } from '../../src/shared/messages.js';

// Mock chrome.runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
  },
};

describe('Toolbar', () => {
  let toolbar;
  let mockSelectionManager;
  let mockIdResolver;
  let container;
  let onChangeCallback;

  beforeEach(() => {
    // Create a container div (injected via constructor)
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock selection manager
    mockSelectionManager = {
      onChange: jest.fn((cb) => {
        onChangeCallback = cb;
      }),
      getSelected: jest.fn(() => []),
      clearSelection: jest.fn(),
    };

    // Mock id resolver
    mockIdResolver = {
      resolve: jest.fn(),
    };

    // Pass container directly - no need to mock getUIContainer
    toolbar = new Toolbar(mockSelectionManager, mockIdResolver, container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    toolbar.destroy();
    container.remove();
  });

  describe('init', () => {
    test('creates toolbar element in container', () => {
      toolbar.init();

      const el = container.querySelector('.tb-toolbar');
      expect(el).not.toBeNull();
      expect(el.getAttribute('role')).toBe('toolbar');
    });

    test('creates count, block, and clear buttons', () => {
      toolbar.init();

      expect(container.querySelector('.tb-toolbar-count')).not.toBeNull();
      expect(container.querySelector('.tb-toolbar-block-btn')).not.toBeNull();
      expect(container.querySelector('.tb-toolbar-clear-btn')).not.toBeNull();
    });

    test('registers onChange callback with selection manager', () => {
      toolbar.init();
      expect(mockSelectionManager.onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('selection changes', () => {
    test('shows toolbar when items selected', () => {
      toolbar.init();

      onChangeCallback(['user1', 'user2']);

      const el = container.querySelector('.tb-toolbar');
      expect(el.classList.contains('tb-toolbar-visible')).toBe(true);
      expect(container.querySelector('.tb-toolbar-count').textContent).toBe('2 selected');
    });

    test('hides toolbar when selection cleared', () => {
      toolbar.init();

      onChangeCallback(['user1']);
      onChangeCallback([]);

      const el = container.querySelector('.tb-toolbar');
      expect(el.classList.contains('tb-toolbar-visible')).toBe(false);
    });
  });

  describe('clear button', () => {
    test('calls clearSelection when clicked', () => {
      toolbar.init();

      const clearBtn = container.querySelector('.tb-toolbar-clear-btn');
      clearBtn.click();

      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();
    });
  });

  describe('block button', () => {
    test('does nothing if no selection', async () => {
      toolbar.init();
      mockSelectionManager.getSelected.mockReturnValue([]);

      const blockBtn = container.querySelector('.tb-toolbar-block-btn');
      blockBtn.click();

      await Promise.resolve();
      expect(mockIdResolver.resolve).not.toHaveBeenCalled();
    });

    test('immediately enqueues batch with null userIds, then resolves async', async () => {
      toolbar.init();
      mockSelectionManager.getSelected.mockReturnValue(['user1', 'user2']);
      mockIdResolver.resolve.mockResolvedValueOnce('id1').mockResolvedValueOnce('id2');

      const blockBtn = container.querySelector('.tb-toolbar-block-btn');
      blockBtn.click();

      // Immediately sends batch with null userIds
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.ENQUEUE_BLOCK_BATCH,
        entries: [
          { username: 'user1', userId: null },
          { username: 'user2', userId: null },
        ],
      });
      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();

      // Wait for async resolution
      await new Promise((r) => setTimeout(r, 10));

      // Then sends UPDATE_RESOLVED_USER for each user
      expect(mockIdResolver.resolve).toHaveBeenCalledTimes(2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.UPDATE_RESOLVED_USER,
        username: 'user1',
        userId: 'id1',
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.UPDATE_RESOLVED_USER,
        username: 'user2',
        userId: 'id2',
      });
    });

    test('sends UPDATE_RESOLVED_USER with null userId when resolution fails', async () => {
      toolbar.init();
      mockSelectionManager.getSelected.mockReturnValue(['user1', 'user2']);
      mockIdResolver.resolve.mockResolvedValueOnce('id1').mockResolvedValueOnce(null);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const blockBtn = container.querySelector('.tb-toolbar-block-btn');
      blockBtn.click();

      await new Promise((r) => setTimeout(r, 10));

      // Batch is sent immediately with all users
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.ENQUEUE_BLOCK_BATCH,
        entries: [
          { username: 'user1', userId: null },
          { username: 'user2', userId: null },
        ],
      });

      // UPDATE_RESOLVED_USER sent for both, even failed one
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.UPDATE_RESOLVED_USER,
        username: 'user1',
        userId: 'id1',
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.UPDATE_RESOLVED_USER,
        username: 'user2',
        userId: null,
      });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('dispatches tb-exit-block-mode event immediately', () => {
      toolbar.init();
      mockSelectionManager.getSelected.mockReturnValue(['user1']);
      mockIdResolver.resolve.mockResolvedValue('id1');

      const eventSpy = jest.fn();
      window.addEventListener('tb-exit-block-mode', eventSpy);

      const blockBtn = container.querySelector('.tb-toolbar-block-btn');
      blockBtn.click();

      // Event is dispatched immediately, not after ID resolution
      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('tb-exit-block-mode', eventSpy);
    });
  });

  describe('destroy', () => {
    test('removes toolbar element', () => {
      toolbar.init();
      expect(container.querySelector('.tb-toolbar')).not.toBeNull();

      toolbar.destroy();
      expect(container.querySelector('.tb-toolbar')).toBeNull();
    });

    test('handles multiple destroy calls', () => {
      toolbar.init();
      toolbar.destroy();
      toolbar.destroy(); // should not throw
    });
  });
});
