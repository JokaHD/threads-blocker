import { BlockState, UIState, Timing } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { DOMObserver } from '../dom-observer.js';

/**
 * Overlay-based inline controls.
 *
 * Creates a fixed overlay layer on top of the page. For each detected comment,
 * renders a block button in the right margin area, aligned vertically with
 * the comment. This avoids Threads' overflow:hidden clipping entirely.
 */
export class InlineControls {
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._users = new Map(); // username -> { state, confirmTimer, userId, commentEl, row }
    this._multiSelectMode = false;

    this._overlay = null;
    this._rafId = null;
    this._visible = new Set(); // usernames currently in viewport

    this._selection.onChange(() => this._updateAllCheckboxes());
  }

  init() {
    // Create a fixed overlay that covers the viewport but doesn't block clicks
    this._overlay = document.createElement('div');
    this._overlay.className = 'tb-overlay';
    document.body.appendChild(this._overlay);

    // Reposition all visible buttons on scroll
    const onScroll = () => {
      if (this._rafId) return;
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        this._repositionAll();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Also handle resize
    window.addEventListener('resize', onScroll, { passive: true });
  }

  get multiSelectMode() { return this._multiSelectMode; }

  setMultiSelectMode(enabled) {
    this._multiSelectMode = enabled;
    for (const [, user] of this._users) {
      if (user.row) {
        const cb = user.row.querySelector('.tb-ol-checkbox');
        const btn = user.row.querySelector('.tb-ol-block');
        if (cb) cb.style.display = enabled ? '' : 'none';
        if (btn) btn.style.display = enabled ? 'none' : '';
      }
    }
  }

  inject(comment) {
    const { username, element, avatarLink, textLink } = comment;
    DOMObserver.markProcessed(element);
    this._selection.recordSeen(username);

    if (this._users.has(username)) return;

    // Use the text username link for positioning (more reliable size/position).
    // Fall back to avatarLink, then element.
    const anchorEl = textLink || avatarLink || element;

    this._users.set(username, {
      state: BlockState.IDLE,
      confirmTimer: null,
      userId: null,
      commentEl: element,
      anchorEl,
      row: null,
    });

    // Create overlay row for this user
    const row = document.createElement('div');
    row.className = 'tb-ol-row';
    row.dataset.username = username;

    // Block button
    const btn = document.createElement('button');
    btn.className = 'tb-ol-block tb-ol-idle';
    btn.innerHTML = Icons.ban;
    btn.title = `封鎖 @${username}`;
    btn.setAttribute('aria-label', `封鎖 @${username}`);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleBlockClick(username, element);
    });

    // Checkbox (hidden by default)
    const cb = document.createElement('div');
    cb.className = 'tb-ol-checkbox';
    cb.setAttribute('role', 'checkbox');
    cb.setAttribute('aria-checked', 'false');
    cb.setAttribute('aria-label', `選取 @${username}`);
    cb.style.display = 'none';
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
    });

    row.appendChild(btn);
    row.appendChild(cb);
    this._overlay.appendChild(row);

    const user = this._users.get(username);
    user.row = row;

    // Always visible — position:fixed rows outside viewport are naturally hidden.
    // Just reposition on every scroll frame.
    this._visible.add(username);
    this._positionRow(username);
  }

  updateState(username, state) {
    const user = this._users.get(username);
    if (!user) return;

    if (user.confirmTimer !== null && state !== UIState.CONFIRM_UNBLOCK) {
      clearTimeout(user.confirmTimer);
      user.confirmTimer = null;
    }
    user.state = state;

    const btn = user.row?.querySelector('.tb-ol-block');
    if (btn) this._renderButton(btn, username, state);
  }

  _positionRow(username) {
    const user = this._users.get(username);
    if (!user || !user.row || !user.anchorEl) return;

    const rect = user.anchorEl.getBoundingClientRect();
    const row = user.row;

    // Hide if anchor element is not in viewport or has no size
    if (rect.height === 0 || rect.bottom < -50 || rect.top > window.innerHeight + 50) {
      row.style.display = 'none';
      return;
    }
    row.style.display = '';

    // Align vertically with the anchor (username text), place in right margin.
    // Use a fixed right position (e.g. 60px from right edge) so all buttons line up.
    const rightPos = 60;

    row.style.top = `${rect.top + rect.height / 2 - 22}px`; // center vertically on anchor
    row.style.right = `${rightPos}px`;
    row.style.left = 'auto';
  }

  _repositionAll() {
    for (const [username] of this._users) {
      this._positionRow(username);
    }
  }

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

  _renderButton(btn, username, state) {
    // Reset classes
    btn.className = 'tb-ol-block';
    btn.disabled = false;

    switch (state) {
      case BlockState.IDLE:
        btn.classList.add('tb-ol-idle');
        btn.innerHTML = Icons.ban;
        btn.title = `封鎖 @${username}`;
        break;
      case BlockState.QUEUED:
        btn.classList.add('tb-ol-queued');
        btn.innerHTML = Icons.x;
        btn.title = `取消排隊 @${username}`;
        break;
      case BlockState.BLOCKING:
        btn.classList.add('tb-ol-blocking');
        btn.innerHTML = Icons.loader;
        btn.disabled = true;
        btn.title = `封鎖中...`;
        break;
      case BlockState.BLOCKED:
        btn.classList.add('tb-ol-blocked');
        btn.innerHTML = Icons.check;
        btn.title = `已封鎖 @${username}`;
        break;
      case UIState.CONFIRM_UNBLOCK:
        btn.classList.add('tb-ol-confirm');
        btn.innerHTML = Icons.undo;
        btn.title = `確定解除封鎖？`;
        break;
      case BlockState.UNBLOCKING:
        btn.classList.add('tb-ol-blocking');
        btn.innerHTML = Icons.loader;
        btn.disabled = true;
        btn.title = `解除中...`;
        break;
      case BlockState.FAILED:
        btn.classList.add('tb-ol-failed');
        btn.innerHTML = Icons.refreshCw;
        btn.title = `封鎖失敗，點擊重試`;
        break;
    }
  }

  _updateAllCheckboxes() {
    for (const [username, user] of this._users) {
      const cb = user.row?.querySelector('.tb-ol-checkbox');
      if (!cb) continue;
      const checked = this._selection.isSelected(username);
      cb.setAttribute('aria-checked', String(checked));
      cb.classList.toggle('tb-ol-checked', checked);
    }
  }

  updateCheckboxes() {
    this._updateAllCheckboxes();
  }
}
