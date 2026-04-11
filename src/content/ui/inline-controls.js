import { BlockState, UIState, Timing } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { DOMObserver } from '../dom-observer.js';

/**
 * Manages per-comment UI:
 * - Block icon below avatar (always visible)
 * - Checkbox below avatar (only in multi-select mode)
 */
export class InlineControls {
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._users = new Map(); // username -> { state, confirmTimer, userId, elements }
    this._multiSelectMode = false;

    this._selection.onChange(() => this._updateAllCheckboxes());
  }

  get multiSelectMode() { return this._multiSelectMode; }

  setMultiSelectMode(enabled) {
    this._multiSelectMode = enabled;
    // Show/hide all checkboxes
    document.querySelectorAll('.tb-avatar-checkbox').forEach(cb => {
      cb.style.display = enabled ? '' : 'none';
    });
    // Hide block icons in multi-select mode, show checkboxes instead
    document.querySelectorAll('.tb-avatar-block-icon').forEach(icon => {
      icon.style.display = enabled ? 'none' : '';
    });
  }

  /**
   * Inject block icon (and hidden checkbox) below a comment's avatar.
   */
  inject(comment) {
    const { username, element, avatarLink } = comment;
    if (!avatarLink) return;

    DOMObserver.markProcessed(element);
    this._selection.recordSeen(username);

    if (!this._users.has(username)) {
      this._users.set(username, {
        state: BlockState.IDLE,
        confirmTimer: null,
        userId: null,
        commentElement: element,
      });
    }

    // Find the avatar's parent container to append below it
    const avatarParent = avatarLink.parentElement;
    if (!avatarParent) return;

    // ── Block icon (below avatar) ────────────────────────────────────────
    const blockIcon = document.createElement('div');
    blockIcon.className = 'tb-avatar-block-icon';
    blockIcon.dataset.username = username;
    blockIcon.title = `封鎖 @${username}`;
    blockIcon.setAttribute('role', 'button');
    blockIcon.setAttribute('aria-label', `封鎖 @${username}`);
    blockIcon.setAttribute('tabindex', '0');
    this._renderBlockIcon(blockIcon, username, BlockState.IDLE);

    blockIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleBlockClick(username, element);
    });
    blockIcon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this._handleBlockClick(username, element);
      }
    });

    // ── Checkbox (below avatar, hidden by default) ──────────────────────
    const checkbox = document.createElement('div');
    checkbox.className = 'tb-avatar-checkbox';
    checkbox.dataset.username = username;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', 'false');
    checkbox.setAttribute('aria-label', `選取 @${username}`);
    checkbox.setAttribute('tabindex', '0');
    checkbox.style.display = 'none'; // hidden until multi-select mode

    checkbox.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
    });

    // Find the best link to attach below (prefer avatar = square-ish link).
    // Use requestAnimationFrame to ensure layout is computed.
    requestAnimationFrame(() => {
      let targetLink = avatarLink;
      // Check all /@username links in the container; pick the square one
      const allLinks = element.querySelectorAll(`a[href="/@${username}"]`);
      for (const link of allLinks) {
        const r = link.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && Math.abs(r.width - r.height) < 15 && r.width <= 80) {
          targetLink = link;
          break;
        }
      }
      targetLink.after(blockIcon);
      blockIcon.after(checkbox);
    });
  }

  updateState(username, state) {
    const user = this._users.get(username);
    if (!user) return;

    if (user.confirmTimer !== null && state !== UIState.CONFIRM_UNBLOCK) {
      clearTimeout(user.confirmTimer);
      user.confirmTimer = null;
    }
    user.state = state;

    // Update all block icons for this username
    document.querySelectorAll(`.tb-avatar-block-icon[data-username="${CSS.escape(username)}"]`).forEach(icon => {
      this._renderBlockIcon(icon, username, state);
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _handleBlockClick(username, element) {
    const user = this._users.get(username);
    if (!user) return;
    const state = user.state;

    if (state === BlockState.BLOCKING || state === BlockState.UNBLOCKING) return;

    if (state === BlockState.IDLE || state === BlockState.FAILED) {
      if (!user.userId) {
        user.userId = await this._idResolver.resolve(username, element);
      }
      chrome.runtime.sendMessage({
        type: state === BlockState.FAILED ? MessageType.RETRY_FAILED : MessageType.ENQUEUE_BLOCK,
        username,
        userId: user.userId,
      });
      return;
    }

    if (state === BlockState.QUEUED) {
      chrome.runtime.sendMessage({ type: MessageType.CANCEL_QUEUED, userId: user.userId });
      return;
    }

    if (state === BlockState.BLOCKED) {
      this.updateState(username, UIState.CONFIRM_UNBLOCK);
      user.confirmTimer = setTimeout(() => {
        user.confirmTimer = null;
        this.updateState(username, BlockState.BLOCKED);
      }, Timing.CONFIRM_UNBLOCK_TIMEOUT);
      return;
    }

    if (state === UIState.CONFIRM_UNBLOCK) {
      chrome.runtime.sendMessage({ type: MessageType.REQUEST_UNBLOCK, userId: user.userId });
      return;
    }
  }

  _renderBlockIcon(el, username, state) {
    el.className = 'tb-avatar-block-icon';

    switch (state) {
      case BlockState.IDLE:
        el.innerHTML = Icons.ban;
        el.classList.add('tb-icon-idle');
        el.title = `封鎖 @${username}`;
        break;
      case BlockState.QUEUED:
        el.innerHTML = Icons.x;
        el.classList.add('tb-icon-queued');
        el.title = `取消排隊 @${username}`;
        break;
      case BlockState.BLOCKING:
        el.innerHTML = Icons.loader;
        el.classList.add('tb-icon-blocking');
        el.title = `封鎖中 @${username}`;
        break;
      case BlockState.BLOCKED:
        el.innerHTML = Icons.check;
        el.classList.add('tb-icon-blocked');
        el.title = `已封鎖 @${username}`;
        break;
      case UIState.CONFIRM_UNBLOCK:
        el.innerHTML = Icons.undo;
        el.classList.add('tb-icon-confirm');
        el.title = `確定解除封鎖 @${username}？`;
        break;
      case BlockState.UNBLOCKING:
        el.innerHTML = Icons.loader;
        el.classList.add('tb-icon-blocking');
        el.title = `解除中 @${username}`;
        break;
      case BlockState.FAILED:
        el.innerHTML = Icons.refreshCw;
        el.classList.add('tb-icon-failed');
        el.title = `封鎖失敗，點擊重試`;
        break;
    }
  }

  _updateAllCheckboxes() {
    document.querySelectorAll('.tb-avatar-checkbox').forEach(cb => {
      const username = cb.dataset.username;
      if (!username) return;
      const checked = this._selection.isSelected(username);
      cb.setAttribute('aria-checked', String(checked));
      cb.classList.toggle('tb-checked', checked);
    });
  }

  updateCheckboxes() {
    this._updateAllCheckboxes();
  }
}
