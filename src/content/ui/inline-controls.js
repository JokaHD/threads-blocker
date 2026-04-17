/**
 * Inline Controls - FAB and Block Mode.
 * Block mode uses CSS pointer-events + document click handler.
 * No overlay, no DOM modification on comments.
 */

import { BlockState } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { getUIContainer } from './shadow-host.js';
import { COMMENT_ID_ATTR } from '../dom-observer.js';

export class InlineControls {
  constructor(selectionManager, idResolver, container = null) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._container = container;
    this._users = new Map(); // username -> { state, container }
    this._blockMode = false;
    this._fab = null;
    this._card = null;
    this._cardCount = null;
    this._cardActions = null;
    this._clickHandler = null;
    this._hoverHandler = null;
    this._lastHovered = null;
    this._confirmDialog = null;
  }

  init() {
    const container = this._container ?? getUIContainer();
    if (!container) {
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
    container.appendChild(this._fab);

    // Create Card (shown when in block mode)
    this._createCard(container);

    // Document-level click handler (always active, checks block mode)
    this._clickHandler = (e) => {
      if (!this._blockMode) return;

      const comment = e.target.closest(`[${COMMENT_ID_ATTR}]`);
      if (!comment) return;

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

    // Listen for selection changes to update card
    this._selection.onChange(() => this._updateCard());

    // Create confirmation dialog
    this._createConfirmDialog(container);
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
    card.appendChild(actions);
    card.appendChild(exitOnly);

    container.appendChild(card);

    this._card = card;
    this._cardCountNum = countNum;
    this._cardActions = actions;
    this._cardExitOnly = exitOnly;
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
   */
  async _resolveUsersAsync(usernames) {
    for (const username of usernames) {
      const userId = await this._idResolver.resolve(username);
      if (userId) {
        console.log(`[ThreadBlocker] Resolved @${username} -> ${userId}`);
      } else {
        console.warn(`[ThreadBlocker] Failed to resolve @${username}`);
      }

      chrome.runtime
        .sendMessage({
          type: MessageType.UPDATE_RESOLVED_USER,
          username,
          userId,
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
    title.textContent = '確定要離開？';

    const message = document.createElement('div');
    message.className = 'tb-confirm-message';
    message.textContent = '你有已選取的項目尚未處理，離開後選取將被清除。';

    const actions = document.createElement('div');
    actions.className = 'tb-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tb-confirm-btn tb-confirm-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => this._hideConfirmDialog());

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'tb-confirm-btn tb-confirm-btn-confirm';
    confirmBtn.textContent = '離開';
    confirmBtn.addEventListener('click', () => {
      this._hideConfirmDialog();
      this._exitBlockMode();
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
  }

  _showConfirmDialog() {
    if (!this._confirmDialog) return;
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

    if (this._users.has(username)) return;

    this._users.set(username, {
      state: BlockState.IDLE,
      container,
    });

    this._selection.recordSeen(username);
  }

  updateState(username, state) {
    const user = this._users.get(username);
    if (user) {
      user.state = state;
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
    this._selection.clearSelection();
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
