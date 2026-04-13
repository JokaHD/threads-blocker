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

    // Clear existing content
    row.innerHTML = '';

    // Create username element (safe - uses textContent)
    const nameEl = document.createElement('span');
    nameEl.className = 'tb-sidebar-username';
    nameEl.title = `@${username}`;
    nameEl.textContent = `@${username}`;
    nameEl.addEventListener('click', () => {
      user.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    row.appendChild(nameEl);

    // Create button element
    const btn = this._createButton(username, user.state);
    if (btn) {
      btn.addEventListener('click', () => this._handleClick(username));
      row.appendChild(btn);
    }
  }

  _createButton(username, state) {
    const base = 'tb-sidebar-btn';
    let el;
    let className;
    let ariaLabel;
    let iconHtml;

    switch (state) {
      case BlockState.IDLE:
        el = document.createElement('button');
        className = `${base} tb-sbtn-idle`;
        ariaLabel = `封鎖 @${username}`;
        iconHtml = Icons.ban;
        break;
      case BlockState.QUEUED:
        el = document.createElement('button');
        className = `${base} tb-sbtn-queued`;
        ariaLabel = `取消排隊 @${username}`;
        iconHtml = Icons.x;
        break;
      case BlockState.BLOCKING:
      case BlockState.UNBLOCKING:
        el = document.createElement('span');
        className = `${base} tb-sbtn-blocking`;
        iconHtml = Icons.loader;
        break;
      case BlockState.BLOCKED:
        el = document.createElement('button');
        className = `${base} tb-sbtn-blocked`;
        ariaLabel = `已封鎖 @${username}，點擊解除`;
        iconHtml = Icons.check;
        break;
      case UIState.CONFIRM_UNBLOCK:
        el = document.createElement('button');
        className = `${base} tb-sbtn-confirm`;
        ariaLabel = '確定解除？';
        el.textContent = '↩';
        break;
      case BlockState.FAILED:
        el = document.createElement('button');
        className = `${base} tb-sbtn-failed`;
        ariaLabel = '重試';
        iconHtml = Icons.refreshCw;
        break;
      default:
        el = document.createElement('button');
        className = `${base} tb-sbtn-idle`;
        ariaLabel = `封鎖 @${username}`;
        iconHtml = Icons.ban;
    }

    el.className = className;
    if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
    if (iconHtml) el.innerHTML = iconHtml; // Icons are static SVGs from constants

    return el;
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
      }).catch(e => console.warn('[ThreadBlocker] Enqueue failed:', e.message));
      return;
    }

    if (state === BlockState.QUEUED) {
      chrome.runtime.sendMessage({ type: MessageType.CANCEL_QUEUED, userId: user.userId })
        .catch(e => console.warn('[ThreadBlocker] Cancel failed:', e.message));
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
      chrome.runtime.sendMessage({ type: MessageType.REQUEST_UNBLOCK, userId: user.userId })
        .catch(e => console.warn('[ThreadBlocker] Unblock request failed:', e.message));
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
