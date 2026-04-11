import { BlockState, UIState, Timing } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';

/**
 * Right-side fixed sidebar listing all detected commenters with block buttons.
 * Avoids overflow/clipping issues by living outside the Threads DOM entirely.
 */
export class Sidebar {
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._element = null;
    this._listEl = null;
    this._users = new Map(); // username -> { userId, element (comment container), state, confirmTimer }
    this._minimized = false;
  }

  init() {
    this._element = document.createElement('div');
    this._element.className = 'tb-sidebar';
    this._element.setAttribute('role', 'region');
    this._element.setAttribute('aria-label', '封鎖工具列');
    this._element.innerHTML = `
      <div class="tb-sidebar-header">
        <span class="tb-sidebar-title">${Icons.shield} 封鎖工具</span>
        <button class="tb-sidebar-toggle" aria-label="收合">${Icons.minus}</button>
      </div>
      <div class="tb-sidebar-body">
        <div class="tb-sidebar-list"></div>
      </div>
    `;

    this._listEl = this._element.querySelector('.tb-sidebar-list');

    this._element.querySelector('.tb-sidebar-toggle').addEventListener('click', () => {
      this._minimized = !this._minimized;
      this._element.classList.toggle('tb-sidebar-minimized', this._minimized);
      const btn = this._element.querySelector('.tb-sidebar-toggle');
      btn.innerHTML = this._minimized ? Icons.play : Icons.minus;
      btn.setAttribute('aria-label', this._minimized ? '展開' : '收合');
    });

    document.body.appendChild(this._element);
  }

  /**
   * Add a user to the sidebar (called when a comment is detected).
   */
  addUser(username, commentElement) {
    if (this._users.has(username)) return;

    this._users.set(username, {
      userId: null,
      element: commentElement,
      state: BlockState.IDLE,
      confirmTimer: null,
    });

    this._renderUser(username);
  }

  /**
   * Update block state for a user.
   */
  updateState(username, state) {
    const user = this._users.get(username);
    if (!user) return;

    if (user.confirmTimer !== null && state !== UIState.CONFIRM_UNBLOCK) {
      clearTimeout(user.confirmTimer);
      user.confirmTimer = null;
    }

    user.state = state;
    this._renderUser(username);
  }

  _renderUser(username) {
    if (!this._listEl) return;
    const user = this._users.get(username);
    if (!user) return;

    let row = this._listEl.querySelector(`[data-tb-user="${CSS.escape(username)}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'tb-sidebar-row';
      row.dataset.tbUser = username;
      this._listEl.appendChild(row);
    }

    const isSelected = this._selection.isSelected(username);
    row.classList.toggle('tb-sidebar-row-selected', isSelected);

    const buttonHtml = this._renderButtonHtml(username, user.state);
    row.innerHTML = `
      <span class="tb-sidebar-username" title="@${username}">@${username}</span>
      ${buttonHtml}
    `;

    // Bind button click
    const btn = row.querySelector('.tb-sidebar-btn');
    if (btn) {
      btn.addEventListener('click', () => this._handleClick(username));
    }

    // Click on username to scroll to their comment
    const nameEl = row.querySelector('.tb-sidebar-username');
    nameEl.addEventListener('click', () => {
      user.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  _renderButtonHtml(username, state) {
    const base = 'tb-sidebar-btn';
    switch (state) {
      case BlockState.IDLE:
        return `<button class="${base} tb-sbtn-idle" aria-label="封鎖 @${username}">${Icons.ban}</button>`;
      case BlockState.QUEUED:
        return `<button class="${base} tb-sbtn-queued" aria-label="取消排隊 @${username}">${Icons.x}</button>`;
      case BlockState.BLOCKING:
        return `<span class="${base} tb-sbtn-blocking">${Icons.loader}</span>`;
      case BlockState.BLOCKED:
        return `<button class="${base} tb-sbtn-blocked" aria-label="已封鎖 @${username}，點擊解除">${Icons.check}</button>`;
      case UIState.CONFIRM_UNBLOCK:
        return `<button class="${base} tb-sbtn-confirm" aria-label="確定解除？">↩</button>`;
      case BlockState.UNBLOCKING:
        return `<span class="${base} tb-sbtn-blocking">${Icons.loader}</span>`;
      case BlockState.FAILED:
        return `<button class="${base} tb-sbtn-failed" aria-label="重試">${Icons.refreshCw}</button>`;
      default:
        return `<button class="${base} tb-sbtn-idle" aria-label="封鎖 @${username}">${Icons.ban}</button>`;
    }
  }

  async _handleClick(username) {
    const user = this._users.get(username);
    if (!user) return;
    const state = user.state;

    if (state === BlockState.BLOCKING || state === BlockState.UNBLOCKING) return;

    if (state === BlockState.IDLE || state === BlockState.FAILED) {
      if (!user.userId) {
        user.userId = await this._idResolver.resolve(username, user.element);
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

  updateCheckboxes() {
    if (!this._listEl) return;
    for (const [username] of this._users) {
      const row = this._listEl.querySelector(`[data-tb-user="${CSS.escape(username)}"]`);
      if (row) {
        row.classList.toggle('tb-sidebar-row-selected', this._selection.isSelected(username));
      }
    }
  }

  destroy() {
    if (this._element) {
      this._element.remove();
      this._element = null;
    }
  }
}
