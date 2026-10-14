/**
 * Inline Controls - FAB and Block Mode.
 * Block mode uses CSS pointer-events + document click handler.
 * No overlay, no DOM modification on comments.
 */

import { MessageType } from '../../shared/messages.js';
import { Limits } from '../../shared/constants.js';
import { Icons } from './icons.js';
import { getUIContainer, getStackContainer } from './shadow-host.js';
import { COMMENT_ID_ATTR } from '../dom-observer.js';
import { threadsSiteRule } from '../site-adapter.js';

const EXIT_CONFIRM = {
  title: '確定要離開？',
  message: '你有已選取的項目尚未處理，離開後選取將被清除。',
  confirmLabel: '離開',
};

export class InlineControls {
  constructor(selectionManager, idResolver, container = null) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._container = container;
    this._blockMode = false;
    this._fab = null;
    this._card = null;
    this._cardCount = null;
    this._cardActions = null;
    this._clickHandler = null;
    this._hoverHandler = null;
    this._lastHovered = null;
    this._confirmDialog = null;
    this._selectAllBtn = null;
    this._selectAllTimer = null;
    this._domScanHandler = null;
  }

  init() {
    const stackContainer = this._container ?? getStackContainer();
    const uiContainer = this._container ?? getUIContainer();
    if (!stackContainer || !uiContainer) {
      console.error('[ThreadBlocker] Failed to get UI container');
      return;
    }

    // Create FAB (shown when not in block mode)
    this._fab = document.createElement('button');
    this._fab.className = 'tb-fab';
    this._fab.innerHTML = `${Icons.shield}<span>Block Mode</span>`;
    this._fab.title = 'Enter block mode: click comments to select';
    this._fab.setAttribute('aria-label', 'Enter block mode');
    this._fab.addEventListener('click', () => this._enterBlockMode());
    stackContainer.appendChild(this._fab);

    // Create Card (shown when in block mode)
    this._createCard(stackContainer);

    // Document-level click handler (always active, checks block mode)
    this._clickHandler = (e) => {
      if (!this._blockMode) return;

      // Entering / leaving a Sub-List may only toggle visibility, which the
      // childList observer behind tb-dom-scan doesn't see — re-check after
      // the host page has reacted to the click.
      this._scheduleSelectAllRefresh();

      const comment = e.target.closest(`[${COMMENT_ID_ATTR}]`);
      if (!comment) {
        // Unmarked comment (heuristic miss): don't let it navigate away —
        // the route change would exit block mode and drop the selection.
        if (threadsSiteRule.isBlockModeNavigationTrigger(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          console.debug('[ThreadBlocker] Block mode: swallowed navigation click on', e.target);
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const username = comment.getAttribute(COMMENT_ID_ATTR);
      if (!username) return;

      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
      this._updateHighlights();
    };

    // Document-level hover handler
    this._hoverHandler = (e) => {
      if (!this._blockMode) return;

      const comment = e.target.closest(`[${COMMENT_ID_ATTR}]`);

      // Remove hover from previous
      if (this._lastHovered && this._lastHovered !== comment) {
        this._lastHovered.classList.remove('tb-hover');
      }

      if (comment) {
        comment.classList.add('tb-hover');
        this._lastHovered = comment;
      }
    };

    // Attach at capture phase to intercept before Threads
    document.addEventListener('click', this._clickHandler, true);
    document.addEventListener('mouseover', this._hoverHandler, true);

    // Listen for exit block mode event (from toolbar after blocking)
    window.addEventListener('tb-exit-block-mode', () => this._exitBlockMode());

    // Listen for route changes to hide UI on media view
    window.addEventListener('tb-route-change', () => this._handleRouteChange());

    // Listen for selection changes to update card
    this._selection.onChange(() => {
      this._updateCard();
      this._updateHighlights();
      this._refreshSelectAll();
    });

    // dom-observer finished a scan: dialog rows may have appeared / gone
    this._domScanHandler = () => this._refreshSelectAll();
    window.addEventListener('tb-dom-scan', this._domScanHandler);

    // Create confirmation dialog (in UI container, not stack)
    this._createConfirmDialog(uiContainer);

    // Check initial URL
    this._handleRouteChange();
  }

  /**
   * Check if current URL is a media lightbox view.
   */
  _isMediaView() {
    return threadsSiteRule.isMediaPath(window.location.pathname);
  }

  /**
   * Handle route change - hide UI on media view or on pages outside the
   * whitelist (e.g. /insights, /messages, /settings).
   */
  _handleRouteChange() {
    const visible = threadsSiteRule.isUIVisibleOnUrl(window.location.href);
    const hidden = !visible;

    if (this._fab) {
      this._fab.classList.toggle('tb-fab-route-hidden', hidden);
    }
    if (this._card) {
      this._card.classList.toggle('tb-card-route-hidden', hidden);
    }

    // 選取不跨越導航:route change 一律退出 block mode(並清空選取),
    // 否則導航後高亮全滅、選取集合殘留,Block 會打到看不見的帳號
    if (this._blockMode) {
      this._exitBlockMode();
    }
  }

  _createCard(container) {
    const card = document.createElement('div');
    card.className = 'tb-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Block mode controls');

    // Count display (big number)
    const countArea = document.createElement('div');
    countArea.className = 'tb-card-count-area';

    const countNum = document.createElement('span');
    countNum.className = 'tb-card-count-num';
    countNum.textContent = '0';

    const countLabel = document.createElement('span');
    countLabel.className = 'tb-card-count-label';
    countLabel.textContent = 'selected';

    countArea.appendChild(countNum);
    countArea.appendChild(countLabel);

    // Select all (activity dialog Sub-List only, see docs/adr/0001)
    const selectAllRow = document.createElement('div');
    selectAllRow.className = 'tb-card-selectall-row';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'tb-card-selectall';
    selectAllBtn.addEventListener('click', () => this._handleSelectAll());

    const selectAllInfo = document.createElement('span');
    selectAllInfo.className = 'tb-card-selectall-info';
    selectAllInfo.textContent = 'ⓘ';
    selectAllInfo.title =
      '按讚／轉發不等於認同，封鎖前請先確認名單。\n' +
      '只涵蓋目前已載入的帳號（網頁版每份名單約只載入前 200 人）。';
    selectAllInfo.setAttribute('aria-label', selectAllInfo.title);

    selectAllRow.appendChild(selectAllBtn);
    selectAllRow.appendChild(selectAllInfo);

    // Actions area (Block button + links)
    const actions = document.createElement('div');
    actions.className = 'tb-card-actions';

    const blockBtn = document.createElement('button');
    blockBtn.className = 'tb-card-block-btn';
    blockBtn.textContent = 'Block';
    blockBtn.addEventListener('click', () => this._handleBlockAll());

    const links = document.createElement('div');
    links.className = 'tb-card-links';

    const clearLink = document.createElement('button');
    clearLink.className = 'tb-card-link';
    clearLink.textContent = 'Clear';
    clearLink.addEventListener('click', () => this._selection.clearSelection());

    const exitLink = document.createElement('button');
    exitLink.className = 'tb-card-link';
    exitLink.textContent = 'Exit →';
    exitLink.addEventListener('click', () => this._tryExit());

    links.appendChild(clearLink);
    links.appendChild(exitLink);

    actions.appendChild(blockBtn);
    actions.appendChild(links);

    // Exit-only link (shown when 0 selected)
    const exitOnly = document.createElement('button');
    exitOnly.className = 'tb-card-exit-only';
    exitOnly.textContent = 'Exit →';
    exitOnly.addEventListener('click', () => this._exitBlockMode());

    card.appendChild(countArea);
    card.appendChild(selectAllRow);
    card.appendChild(actions);
    card.appendChild(exitOnly);

    container.appendChild(card);

    this._card = card;
    this._cardCountNum = countNum;
    this._cardActions = actions;
    this._cardExitOnly = exitOnly;
    this._selectAllBtn = selectAllBtn;
  }

  /**
   * Show "Select all (N loaded)" while an activity-dialog Sub-List is on
   * screen in block mode; hide it otherwise.
   */
  _refreshSelectAll() {
    if (!this._selectAllBtn) return;
    const candidates = this._blockMode
      ? threadsSiteRule.getSelectAllCandidates(COMMENT_ID_ATTR)
      : null;
    const visible = !!candidates && candidates.length > 0;
    this._selectAllBtn.classList.toggle('tb-card-selectall-visible', visible);
    if (!visible) return;

    const allSelected = candidates.every((u) => this._selection.isSelected(u));
    this._selectAllBtn.disabled = allSelected;
    this._selectAllBtn.textContent = allSelected
      ? `All ${candidates.length} selected`
      : `Select all (${candidates.length} loaded)`;
  }

  _scheduleSelectAllRefresh() {
    clearTimeout(this._selectAllTimer);
    this._selectAllTimer = setTimeout(() => this._refreshSelectAll(), 350);
  }

  /**
   * One-shot snapshot: whatever the Active Sub-List shows at click time.
   */
  _handleSelectAll() {
    const candidates = threadsSiteRule.getSelectAllCandidates(COMMENT_ID_ATTR);
    if (!candidates || candidates.length === 0) return;
    this._selection.selectMany(candidates);
  }

  _updateCard() {
    if (!this._card) return;

    const count = this._selection.count();
    this._cardCountNum.textContent = String(count);

    // Toggle between actions and exit-only based on selection count
    if (count > 0) {
      this._cardActions.classList.add('tb-card-actions-visible');
      this._cardExitOnly.classList.remove('tb-card-exit-only-visible');
    } else {
      this._cardActions.classList.remove('tb-card-actions-visible');
      this._cardExitOnly.classList.add('tb-card-exit-only-visible');
    }
  }

  _tryExit() {
    if (this._selection.count() > 0) {
      this._showConfirmDialog();
    } else {
      this._exitBlockMode();
    }
  }

  /**
   * Handle block all selected users.
   */
  _handleBlockAll() {
    const selected = this._selection.getSelected();
    if (selected.length === 0) return;

    // Large batches (typically from select-all) get a second look first
    if (selected.length >= Limits.BLOCK_CONFIRM_THRESHOLD) {
      this._showConfirmDialog({
        title: `確定要封鎖 ${selected.length} 個帳號？`,
        message: '封鎖會在背景依序執行。請確認名單中沒有誤選的人。',
        confirmLabel: '封鎖',
        onConfirm: () => this._blockSelected(),
      });
      return;
    }
    this._blockSelected();
  }

  _blockSelected() {
    const selected = this._selection.getSelected();
    if (selected.length === 0) return;

    console.log(`[ThreadBlocker] Enqueueing ${selected.length} users (resolving IDs async)...`);

    const entries = selected.map((username) => ({ username, userId: null }));

    chrome.runtime
      .sendMessage({
        type: MessageType.ENQUEUE_BLOCK_BATCH,
        entries,
      })
      .catch((e) => console.error('[ThreadBlocker] Enqueue batch failed:', e.message));

    this._selection.clearSelection();
    this._exitBlockMode();

    this._resolveUsersAsync(selected);
  }

  /**
   * Resolve userIds for a list of usernames and update the queue.
   *
   * Transient failures (network offline / 5xx / 429) retry with exponential
   * backoff. Permanent failures (404 / pattern not found) fall through and
   * the item is deleted via `UPDATE_RESOLVED_USER: null`. If retries are
   * exhausted while still transient, the item is left in RESOLVING so the
   * user can retry manually via the panel — beats silently losing the
   * selection during a brief offline blip.
   */
  async _resolveUsersAsync(usernames) {
    for (const username of usernames) {
      let result = { userId: null, transient: true };
      for (let attempt = 0; attempt < 5; attempt++) {
        result = await this._idResolver.resolve(username);
        if (result.userId || !result.transient) break;
        const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
        console.log(
          `[ThreadBlocker] Transient resolve failure for @${username}, retry in ${delay}ms (${attempt + 1}/5)`
        );
        await new Promise((r) => setTimeout(r, delay));
      }

      if (result.userId) {
        console.log(`[ThreadBlocker] Resolved @${username} -> ${result.userId}`);
      } else if (result.transient) {
        // 用光 retry 預算後仍 transient 失敗 — 不發 UPDATE_RESOLVED_USER,
        // item 留在 RESOLVING (Panel 可手動 cancel)
        console.warn(`[ThreadBlocker] Giving up on @${username} after retries (still transient)`);
        continue;
      } else {
        console.warn(`[ThreadBlocker] Failed to resolve @${username} (permanent)`);
      }

      chrome.runtime
        .sendMessage({
          type: MessageType.UPDATE_RESOLVED_USER,
          username,
          userId: result.userId,
        })
        .catch((e) => console.warn('[ThreadBlocker] Update resolved user failed:', e.message));
    }
  }

  _createConfirmDialog(container) {
    const backdrop = document.createElement('div');
    backdrop.className = 'tb-confirm-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'tb-confirm-title');

    const dialog = document.createElement('div');
    dialog.className = 'tb-confirm-dialog';

    const title = document.createElement('div');
    title.className = 'tb-confirm-title';
    title.id = 'tb-confirm-title';
    title.textContent = EXIT_CONFIRM.title;

    const message = document.createElement('div');
    message.className = 'tb-confirm-message';
    message.textContent = EXIT_CONFIRM.message;

    const actions = document.createElement('div');
    actions.className = 'tb-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tb-confirm-btn tb-confirm-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => this._hideConfirmDialog());

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'tb-confirm-btn tb-confirm-btn-confirm';
    confirmBtn.textContent = EXIT_CONFIRM.confirmLabel;
    confirmBtn.addEventListener('click', () => {
      const onConfirm = this._confirmAction;
      this._hideConfirmDialog();
      onConfirm?.();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this._hideConfirmDialog();
      }
    });

    // Close on Escape key
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._hideConfirmDialog();
      }
    });

    container.appendChild(backdrop);
    this._confirmDialog = backdrop;
    this._confirmTitle = title;
    this._confirmMessage = message;
    this._confirmBtn = confirmBtn;
  }

  /**
   * @param {{title: string, message: string, confirmLabel: string,
   *   onConfirm: function}} [options] - defaults to the exit confirmation
   */
  _showConfirmDialog(options = { ...EXIT_CONFIRM, onConfirm: () => this._exitBlockMode() }) {
    if (!this._confirmDialog) return;
    this._confirmTitle.textContent = options.title;
    this._confirmMessage.textContent = options.message;
    this._confirmBtn.textContent = options.confirmLabel;
    this._confirmAction = options.onConfirm;
    this._confirmDialog.classList.add('tb-confirm-visible');
    // Focus confirm button for keyboard users
    const confirmBtn = this._confirmDialog.querySelector('.tb-confirm-btn-confirm');
    if (confirmBtn) confirmBtn.focus();
  }

  _hideConfirmDialog() {
    if (!this._confirmDialog) return;
    this._confirmDialog.classList.remove('tb-confirm-visible');
    // Return focus to FAB
    if (this._fab) this._fab.focus();
  }

  inject(comment) {
    const { username, container } = comment;

    this._selection.recordSeen(username);

    // Virtual scroll 會回收 DOM 節點:容器每次被重新標記時,
    // 已選取的 username 必須重新套上高亮,否則選取變成不可見
    if (this._blockMode && this._selection.isSelected(username)) {
      container.classList.add('tb-selected');
    }
  }

  get multiSelectMode() {
    return this._blockMode;
  }

  setMultiSelectMode(enabled) {
    if (enabled) {
      this._enterBlockMode();
    } else {
      this._exitBlockMode();
    }
  }

  _toggleBlockMode() {
    if (this._blockMode) {
      this._tryExit();
    } else {
      this._enterBlockMode();
    }
  }

  _enterBlockMode() {
    this._blockMode = true;

    // Hide FAB, show card
    if (this._fab) {
      this._fab.classList.add('tb-fab-hidden');
    }
    if (this._card) {
      this._card.classList.add('tb-card-visible');
      this._updateCard();
    }

    // Add body class - this triggers CSS that disables pointer-events on links
    document.body.classList.add('tb-blockmode');
    this._refreshSelectAll();
  }

  _exitBlockMode() {
    this._blockMode = false;

    // Show FAB, hide card
    if (this._fab) {
      this._fab.classList.remove('tb-fab-hidden');
    }
    if (this._card) {
      this._card.classList.remove('tb-card-visible');
    }

    // Remove body class
    document.body.classList.remove('tb-blockmode');

    // Remove all visual states
    document.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach((el) => {
      el.classList.remove('tb-hover', 'tb-selected');
    });

    this._lastHovered = null;
    clearTimeout(this._selectAllTimer);
    this._selection.clearSelection();
    this._refreshSelectAll();
  }

  _updateHighlights() {
    document.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach((el) => {
      const username = el.getAttribute(COMMENT_ID_ATTR);
      const isSelected = this._selection.isSelected(username);
      el.classList.toggle('tb-selected', isSelected);
    });
  }

  updateCheckboxes() {
    this._updateHighlights();
  }

  destroy() {
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler, true);
    }
    if (this._hoverHandler) {
      document.removeEventListener('mouseover', this._hoverHandler, true);
    }
    if (this._domScanHandler) {
      window.removeEventListener('tb-dom-scan', this._domScanHandler);
    }
    if (this._fab) {
      this._fab.remove();
      this._fab = null;
    }
    if (this._card) {
      this._card.remove();
      this._card = null;
    }
    if (this._confirmDialog) {
      this._confirmDialog.remove();
      this._confirmDialog = null;
    }
    this._exitBlockMode();
  }
}
