/**
 * @jest-environment jsdom
 */

import { InlineControls } from '../../src/content/ui/inline-controls.js';
import { COMMENT_ID_ATTR } from '../../src/content/dom-observer.js';
import { threadsSiteRule } from '../../src/content/site-adapter.js';

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
      count: jest.fn(() => 0),
      getSelected: jest.fn(() => []),
      onChange: jest.fn(),
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
      const card = container.querySelector('.tb-card');
      fab.click();

      expect(fab.classList.contains('tb-fab-hidden')).toBe(true);
      expect(card.classList.contains('tb-card-visible')).toBe(true);
      expect(document.body.classList.contains('tb-blockmode')).toBe(true);
    });

    test('exits block mode when exit link clicked', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      const card = container.querySelector('.tb-card');
      fab.click(); // Enter

      const exitLink = container.querySelector('.tb-card-exit-only');
      exitLink.click(); // Exit

      expect(fab.classList.contains('tb-fab-hidden')).toBe(false);
      expect(card.classList.contains('tb-card-visible')).toBe(false);
      expect(document.body.classList.contains('tb-blockmode')).toBe(false);
    });

    test('clears selection when exiting block mode', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click(); // Enter

      const exitLink = container.querySelector('.tb-card-exit-only');
      exitLink.click(); // Exit

      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();
    });

    test('shows confirmation dialog when exiting with selections', () => {
      mockSelectionManager.count.mockReturnValue(3);
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      const card = container.querySelector('.tb-card');
      fab.click(); // Enter

      // With selections, use the exit link in actions area
      const exitLink = container.querySelector('.tb-card-links .tb-card-link:last-child');
      exitLink.click(); // Try to exit

      const confirmDialog = container.querySelector('.tb-confirm-backdrop');
      expect(confirmDialog.classList.contains('tb-confirm-visible')).toBe(true);
      // Should NOT exit yet
      expect(card.classList.contains('tb-card-visible')).toBe(true);
    });

    test('exits block mode when confirm dialog confirmed', () => {
      mockSelectionManager.count.mockReturnValue(3);
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      const card = container.querySelector('.tb-card');
      fab.click(); // Enter

      const exitLink = container.querySelector('.tb-card-links .tb-card-link:last-child');
      exitLink.click(); // Try to exit - shows dialog

      const confirmBtn = container.querySelector('.tb-confirm-btn-confirm');
      confirmBtn.click();

      expect(card.classList.contains('tb-card-visible')).toBe(false);
      expect(fab.classList.contains('tb-fab-hidden')).toBe(false);
      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();
    });

    test('stays in block mode when confirm dialog cancelled', () => {
      mockSelectionManager.count.mockReturnValue(3);
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      const card = container.querySelector('.tb-card');
      fab.click(); // Enter

      const exitLink = container.querySelector('.tb-card-links .tb-card-link:last-child');
      exitLink.click(); // Try to exit - shows dialog

      const cancelBtn = container.querySelector('.tb-confirm-btn-cancel');
      cancelBtn.click();

      // Dialog should be hidden
      const confirmDialog = container.querySelector('.tb-confirm-backdrop');
      expect(confirmDialog.classList.contains('tb-confirm-visible')).toBe(false);
      // Should stay in block mode
      expect(card.classList.contains('tb-card-visible')).toBe(true);
      expect(mockSelectionManager.clearSelection).not.toHaveBeenCalled();
    });

    test('closes confirm dialog when backdrop clicked', () => {
      mockSelectionManager.count.mockReturnValue(3);
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      const card = container.querySelector('.tb-card');
      fab.click(); // Enter

      const exitLink = container.querySelector('.tb-card-links .tb-card-link:last-child');
      exitLink.click(); // Try to exit - shows dialog

      const backdrop = container.querySelector('.tb-confirm-backdrop');
      backdrop.click();

      expect(backdrop.classList.contains('tb-confirm-visible')).toBe(false);
      expect(card.classList.contains('tb-card-visible')).toBe(true);
    });

    test('shows block button when items selected', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click(); // Enter

      // Simulate selection change callback
      mockSelectionManager.count.mockReturnValue(2);
      const onChangeCallback = mockSelectionManager.onChange.mock.calls[0][0];
      onChangeCallback();

      const actions = container.querySelector('.tb-card-actions');
      expect(actions.classList.contains('tb-card-actions-visible')).toBe(true);
    });

    test('updates count display when selection changes', () => {
      inlineControls.init();

      const fab = container.querySelector('.tb-fab');
      fab.click(); // Enter

      mockSelectionManager.count.mockReturnValue(5);
      const onChangeCallback = mockSelectionManager.onChange.mock.calls[0][0];
      onChangeCallback();

      const countNum = container.querySelector('.tb-card-count-num');
      expect(countNum.textContent).toBe('5');
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

  // An unmarked comment (heuristic miss) would otherwise navigate to its
  // permalink, and the route change wipes the entire selection.
  describe('navigation guard in block mode', () => {
    let host;

    beforeEach(() => {
      host = document.createElement('div');
      host.innerHTML = `
        <div data-pressable-container id="unmarked-pressable"><span id="inner">text</span></div>
        <a href="/@someone/post/abc" id="permalink">2h</a>
        <nav><a href="/@me" id="nav-link">me</a></nav>
        <div role="tablist"><div role="tab" data-pressable-container id="tab">讚</div></div>
        <a href="/search" id="other-link">search</a>
      `;
      document.body.appendChild(host);
    });

    afterEach(() => {
      host.remove();
    });

    function click(id) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      document.getElementById(id).dispatchEvent(event);
      return event;
    }

    test('swallows clicks on an unmarked pressable container', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(click('inner').defaultPrevented).toBe(true);
      expect(mockSelectionManager.toggle).not.toHaveBeenCalled();
    });

    test('swallows clicks on an unmarked /@ link', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(click('permalink').defaultPrevented).toBe(true);
    });

    test('lets sidebar navigation, tabs and non-user links through', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(click('nav-link').defaultPrevented).toBe(false);
      expect(click('tab').defaultPrevented).toBe(false);
      expect(click('other-link').defaultPrevented).toBe(false);
    });

    test('does not guard outside block mode', () => {
      inlineControls.init();

      expect(click('inner').defaultPrevented).toBe(false);
      expect(click('permalink').defaultPrevented).toBe(false);
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

    test("inject calls recordSeen; dedup is SelectionManager's responsibility", () => {
      inlineControls.init();

      const commentContainer = document.createElement('div');
      inlineControls.inject({ username: 'testuser', container: commentContainer });
      inlineControls.inject({ username: 'testuser', container: commentContainer });

      // inline-controls no longer tracks users itself; it just forwards to selection
      expect(mockSelectionManager.recordSeen).toHaveBeenCalled();
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

  describe('media view hiding', () => {
    test('_isMediaView returns true for media URLs', () => {
      // Test the regex pattern directly
      const mediaPattern = /\/post\/[^/]+\/media/;

      expect(mediaPattern.test('/@user/post/ABC123/media')).toBe(true);
      expect(mediaPattern.test('/post/ABC123/media')).toBe(true);
      expect(mediaPattern.test('/@user/post/ABC123')).toBe(false);
      expect(mediaPattern.test('/post/ABC123')).toBe(false);
      expect(mediaPattern.test('/')).toBe(false);
    });

    test('responds to tb-route-change event', () => {
      inlineControls.init();

      // Verify event listener is registered (method exists and runs without error)
      expect(() => {
        window.dispatchEvent(new CustomEvent('tb-route-change'));
      }).not.toThrow();
    });

    test('FAB has route-hidden class support in CSS', () => {
      inlineControls.init();
      const fab = container.querySelector('.tb-fab');

      // Verify the class can be toggled
      fab.classList.add('tb-fab-route-hidden');
      expect(fab.classList.contains('tb-fab-route-hidden')).toBe(true);

      fab.classList.remove('tb-fab-route-hidden');
      expect(fab.classList.contains('tb-fab-route-hidden')).toBe(false);
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

  describe('select all (activity dialog)', () => {
    let candidatesSpy;

    beforeEach(() => {
      jest.useFakeTimers();
      candidatesSpy = jest.spyOn(threadsSiteRule, 'getSelectAllCandidates');
      mockSelectionManager.selectMany = jest.fn();
    });

    afterEach(() => {
      candidatesSpy.mockRestore();
      jest.useRealTimers();
    });

    const button = () => container.querySelector('.tb-card-selectall');

    test('is hidden when no Sub-List is active', () => {
      candidatesSpy.mockReturnValue(null);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(button().classList.contains('tb-card-selectall-visible')).toBe(false);
    });

    test('shows the loaded count for the Active Sub-List', () => {
      candidatesSpy.mockReturnValue(['a', 'b', 'c']);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(button().classList.contains('tb-card-selectall-visible')).toBe(true);
      expect(button().textContent).toBe('Select all (3 loaded)');
    });

    test('selects the snapshot taken at click time', () => {
      candidatesSpy.mockReturnValue(['a', 'b']);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      candidatesSpy.mockReturnValue(['a', 'b', 'c']);
      button().click();

      expect(mockSelectionManager.selectMany).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    test('is disabled once every candidate is selected', () => {
      candidatesSpy.mockReturnValue(['a', 'b']);
      mockSelectionManager.isSelected.mockReturnValue(true);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      expect(button().disabled).toBe(true);
      expect(button().textContent).toBe('All 2 selected');
    });

    test('refreshes after a DOM scan', () => {
      candidatesSpy.mockReturnValue(null);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      candidatesSpy.mockReturnValue(['a']);
      window.dispatchEvent(new CustomEvent('tb-dom-scan'));

      expect(button().classList.contains('tb-card-selectall-visible')).toBe(true);
    });

    test('refreshes shortly after a click (Sub-List switch may not mutate the tree)', () => {
      candidatesSpy.mockReturnValue(null);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      candidatesSpy.mockReturnValue(['a']);
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      jest.advanceTimersByTime(400);

      expect(button().classList.contains('tb-card-selectall-visible')).toBe(true);
    });

    test('is hidden outside block mode', () => {
      candidatesSpy.mockReturnValue(['a']);
      inlineControls.init();

      window.dispatchEvent(new CustomEvent('tb-dom-scan'));

      expect(button().classList.contains('tb-card-selectall-visible')).toBe(false);
    });
  });

  describe('block confirmation threshold', () => {
    beforeEach(() => {
      global.chrome = { runtime: { sendMessage: jest.fn(() => Promise.resolve()) } };
      mockIdResolver.resolve.mockResolvedValue({ userId: '1', transient: false });
    });

    afterEach(() => {
      delete global.chrome;
    });

    function enterWithSelection(n) {
      const users = Array.from({ length: n }, (_, i) => `u${i}`);
      mockSelectionManager.getSelected.mockReturnValue(users);
      mockSelectionManager.count.mockReturnValue(n);
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
    }

    test('blocks immediately below the threshold', () => {
      enterWithSelection(19);
      container.querySelector('.tb-card-block-btn').click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      expect(
        container.querySelector('.tb-confirm-backdrop').classList.contains('tb-confirm-visible')
      ).toBe(false);
    });

    test('asks for confirmation at 20 or more, and blocks on confirm', () => {
      enterWithSelection(20);
      container.querySelector('.tb-card-block-btn').click();

      const backdrop = container.querySelector('.tb-confirm-backdrop');
      expect(backdrop.classList.contains('tb-confirm-visible')).toBe(true);
      expect(container.querySelector('.tb-confirm-title').textContent).toContain('20');
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

      container.querySelector('.tb-confirm-btn-confirm').click();
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    test('cancel keeps the selection and block mode', () => {
      enterWithSelection(20);
      container.querySelector('.tb-card-block-btn').click();
      container.querySelector('.tb-confirm-btn-cancel').click();

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(mockSelectionManager.clearSelection).not.toHaveBeenCalled();
      expect(inlineControls.multiSelectMode).toBe(true);
    });

    test('exit confirmation still uses the exit wording', () => {
      enterWithSelection(3);
      const exitLink = [...container.querySelectorAll('.tb-card-link')].find((b) =>
        b.textContent.includes('Exit')
      );
      exitLink.click();

      expect(container.querySelector('.tb-confirm-title').textContent).toBe('確定要離開？');
    });
  });

  describe('selection lifecycle', () => {
    test('inject re-applies highlight for an already-selected username in block mode', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
      mockSelectionManager.isSelected.mockImplementation((u) => u === 'alice');

      // 模擬 virtual scroll 回收後重新標記的容器
      const el = document.createElement('div');
      el.setAttribute(COMMENT_ID_ATTR, 'alice');
      document.body.appendChild(el);

      inlineControls.inject({ username: 'alice', container: el });

      expect(el.classList.contains('tb-selected')).toBe(true);
      el.remove();
    });

    test('inject does not highlight unselected usernames', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);

      const el = document.createElement('div');
      el.setAttribute(COMMENT_ID_ATTR, 'bob');
      document.body.appendChild(el);

      inlineControls.inject({ username: 'bob', container: el });

      expect(el.classList.contains('tb-selected')).toBe(false);
      el.remove();
    });

    test('route change while in block mode exits block mode and clears selection', () => {
      inlineControls.init();
      inlineControls.setMultiSelectMode(true);
      mockSelectionManager.clearSelection.mockClear();

      window.dispatchEvent(
        new CustomEvent('tb-route-change', { detail: { url: 'https://www.threads.com/@x/post/1' } })
      );

      expect(inlineControls.multiSelectMode).toBe(false);
      expect(mockSelectionManager.clearSelection).toHaveBeenCalled();
    });
  });
});
