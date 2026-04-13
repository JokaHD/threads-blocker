/**
 * @jest-environment jsdom
 */

import { InlineControls } from '../../src/content/ui/inline-controls.js';
import { BlockState } from '../../src/shared/constants.js';
import { COMMENT_ID_ATTR } from '../../src/content/dom-observer.js';

describe('InlineControls', () => {
  let inlineControls;
  let mockSelectionManager;
  let mockIdResolver;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    mockSelectionManager = {
      toggle: jest.fn(),
      onClick: jest.fn(),
      setAnchor: jest.fn(),
      isSelected: jest.fn(() => false),
      clearSelection: jest.fn(),
      recordSeen: jest.fn(),
    };

    mockIdResolver = {
      resolve: jest.fn(),
    };

    inlineControls = new InlineControls(mockSelectionManager, mockIdResolver, container);
  });

  afterEach(() => {
    inlineControls.destroy();
    container.remove();
    document.body.classList.remove('tb-blockmode');
  });

  describe('init', () => {
    test('creates FAB button', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      expect(fab).not.toBeNull();
      expect(fab.textContent).toContain('Block Mode');
    });
  });

  describe('block mode toggle', () => {
    test('enters block mode when FAB clicked', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click();

      expect(fab.classList.contains('tb-fab-active')).toBe(true);
      expect(fab.textContent).toContain('Exit Block Mode');
      expect(document.body.classList.contains('tb-blockmode')).toBe(true);
    });

    test('exits block mode when FAB clicked again', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click(); // Enter
      fab.click(); // Exit

      expect(fab.classList.contains('tb-fab-active')).toBe(false);
      expect(fab.textContent).toContain('Block Mode');
      expect(document.body.classList.contains('tb-blockmode')).toBe(false);
    });

    test('clears selection when exiting block mode', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click(); // Enter
      fab.click(); // Exit

      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();
    });
  });

  describe('multiSelectMode property', () => {
    test('returns false initially', () => {
      inlineControls.init();
      expect(inlineControls.multiSelectMode).toBe(false);
    });

    test('returns true after entering block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
      expect(inlineControls.multiSelectMode).toBe(true);
    });

    test('setMultiSelectMode(false) exits block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
      inlineControls.setMultiSelectMode(false);
      expect(inlineControls.multiSelectMode).toBe(false);
    });
  });

  describe('comment click handling', () => {
    let comment;

    beforeEach(() => {
      comment = document.createElement('div');
      comment.setAttribute(COMMENT_ID_ATTR, 'testuser');
      document.body.appendChild(comment);
    });

    afterEach(() => {
      comment.remove();
    });

    test('does nothing when not in block mode', () => {
      inlineControls.init();

      comment.click();

      expect(mockSelectionManager.toggle).not.toHaveBeenCalled();
    });

    test('toggles selection when comment clicked in block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      comment.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockSelectionManager.toggle).toHaveBeenCalledWith('testuser');
      expect(mockSelectionManager.setAnchor).toHaveBeenCalledWith('testuser');
    });

    test('uses shift-click for range selection', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      comment.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

      expect(mockSelectionManager.onClick).toHaveBeenCalledWith('testuser', true);
    });

    test('prevents default on comment click in block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      comment.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('comment hover', () => {
    let comment;

    beforeEach(() => {
      comment = document.createElement('div');
      comment.setAttribute(COMMENT_ID_ATTR, 'testuser');
      document.body.appendChild(comment);
    });

    afterEach(() => {
      comment.remove();
    });

    test('does nothing when not in block mode', () => {
      inlineControls.init();

      comment.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      expect(comment.classList.contains('tb-hover')).toBe(false);
    });

    test('adds hover class in block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      comment.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      expect(comment.classList.contains('tb-hover')).toBe(true);
    });

    test('removes hover class from previous element', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      const comment2 = document.createElement('div');
      comment2.setAttribute(COMMENT_ID_ATTR, 'user2');
      document.body.appendChild(comment2);

      comment.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      comment2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      expect(comment.classList.contains('tb-hover')).toBe(false);
      expect(comment2.classList.contains('tb-hover')).toBe(true);

      comment2.remove();
    });
  });

  describe('inject', () => {
    test('records user as seen', () => {
      inlineControls.init();

      const commentContainer = document.createElement('div');
      inlineControls.inject({ username: 'testuser', container: commentContainer });

      expect(mockSelectionManager.recordSeen).toHaveBeenCalledWith('testuser');
    });

    test('does not re-inject same user', () => {
      inlineControls.init();

      const commentContainer = document.createElement('div');
      inlineControls.inject({ username: 'testuser', container: commentContainer });
      inlineControls.inject({ username: 'testuser', container: commentContainer });

      expect(mockSelectionManager.recordSeen).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateState', () => {
    test('updates internal user state', () => {
      inlineControls.init();

      const commentContainer = document.createElement('div');
      inlineControls.inject({ username: 'testuser', container: commentContainer });
      inlineControls.updateState('testuser', BlockState.BLOCKED);

      // State is internal, we verify it doesn't throw
    });
  });

  describe('updateCheckboxes', () => {
    test('updates selection highlights', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      const comment = document.createElement('div');
      comment.setAttribute(COMMENT_ID_ATTR, 'testuser');
      document.body.appendChild(comment);

      mockSelectionManager.isSelected.mockReturnValue(true);
      inlineControls.updateCheckboxes();

      expect(comment.classList.contains('tb-selected')).toBe(true);

      comment.remove();
    });
  });

  describe('tb-exit-block-mode event', () => {
    test('exits block mode on event', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      window.dispatchEvent(new CustomEvent('tb-exit-block-mode'));

      expect(inlineControls.multiSelectMode).toBe(false);
    });
  });

  describe('destroy', () => {
    test('removes FAB', () => {
      inlineControls.init();
      expect(container.querySelector('.tb-fab')).not.toBeNull();

      inlineControls.destroy();
      expect(container.querySelector('.tb-fab')).toBeNull();
    });

    test('removes event listeners', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
      inlineControls.destroy();

      // Create comment after destroy
      const comment = document.createElement('div');
      comment.setAttribute(COMMENT_ID_ATTR, 'testuser');
      document.body.appendChild(comment);

      comment.click();
      expect(mockSelectionManager.toggle).not.toHaveBeenCalled();

      comment.remove();
    });
  });
});
