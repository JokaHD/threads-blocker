import { BlockState, UIState, Timing } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { DOMObserver } from '../dom-observer.js';

export class InlineControls {
  /**
   * @param {import('../selection-manager.js').SelectionManager} selectionManager
   * @param {import('../id-resolver.js').IDResolver} idResolver
   */
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    // Map<username, { state: string, element: HTMLElement, confirmTimer: number|null }>
    this._uiStates = new Map();
  }

  /**
   * Inject checkbox + block button next to a comment.
   * @param {{ username: string, element: HTMLElement, linkElement: HTMLElement }} comment
   */
  inject(comment) {
    const { username, element, linkElement } = comment;

    DOMObserver.markProcessed(element);
    this._selection.recordSeen(username);

    // Initialize UI state entry if not already present
    if (!this._uiStates.has(username)) {
      this._uiStates.set(username, { state: BlockState.IDLE, confirmTimer: null });
    }

    // ── Checkbox ─────────────────────────────────────────────────────────────
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tb-checkbox';
    checkbox.checked = this._selection.isSelected(username);
    checkbox.title = `選取 @${username}`;

    checkbox.addEventListener('click', (e) => {
      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
    });

    // ── Block button ──────────────────────────────────────────────────────────
    const button = document.createElement('button');
    button.className = 'tb-block-btn';

    const entry = this._uiStates.get(username);
    this._renderButton(button, username, entry.state);

    button.addEventListener('click', () => this._handleBlockClick(button, username, element));

    // ── Container ─────────────────────────────────────────────────────────────
    const wrapper = document.createElement('span');
    wrapper.className = 'tb-inline-controls';
    wrapper.appendChild(checkbox);
    wrapper.appendChild(button);

    // Insert after the link element
    linkElement.insertAdjacentElement('afterend', wrapper);

    // Keep checkbox in sync with selection changes
    this._selection.onChange(() => {
      checkbox.checked = this._selection.isSelected(username);
    });
  }

  /**
   * Update button appearance for a username across all DOM instances.
   * @param {string} username
   * @param {string} state  - BlockState or UIState value
   */
  updateState(username, state) {
    const entry = this._uiStates.get(username);
    if (!entry) return;

    // Clear any pending confirm_unblock timer if transitioning away
    if (entry.confirmTimer !== null && state !== UIState.CONFIRM_UNBLOCK) {
      clearTimeout(entry.confirmTimer);
      entry.confirmTimer = null;
    }

    entry.state = state;

    // Update every button in the DOM for this username
    const buttons = document.querySelectorAll(`.tb-block-btn[data-username="${CSS.escape(username)}"]`);
    for (const btn of buttons) {
      this._renderButton(btn, username, state);
    }
  }

  /**
   * Refresh all checkbox visuals from selection manager state.
   */
  updateCheckboxes() {
    const checkboxes = document.querySelectorAll('.tb-checkbox');
    for (const cb of checkboxes) {
      const username = cb.dataset.username;
      if (username) {
        cb.checked = this._selection.isSelected(username);
      }
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _handleBlockClick(button, username, element) {
    const entry = this._uiStates.get(username);
    if (!entry) return;

    const state = entry.state;

    if (state === BlockState.BLOCKING || state === BlockState.UNBLOCKING) {
      // Disabled states — do nothing
      return;
    }

    if (state === BlockState.IDLE || state === BlockState.FAILED) {
      // Resolve user ID and enqueue block
      const userId = await this._idResolver.resolve(username, element);
      chrome.runtime.sendMessage({
        type: state === BlockState.FAILED ? MessageType.RETRY_FAILED : MessageType.ENQUEUE_BLOCK,
        username,
        userId,
      });
      return;
    }

    if (state === BlockState.QUEUED) {
      chrome.runtime.sendMessage({ type: MessageType.CANCEL_QUEUED, username });
      return;
    }

    if (state === BlockState.BLOCKED) {
      // Enter confirm_unblock UI state with auto-revert
      this.updateState(username, UIState.CONFIRM_UNBLOCK);
      const entry = this._uiStates.get(username);
      entry.confirmTimer = setTimeout(() => {
        entry.confirmTimer = null;
        this.updateState(username, BlockState.BLOCKED);
      }, Timing.CONFIRM_UNBLOCK_TIMEOUT);
      return;
    }

    if (state === UIState.CONFIRM_UNBLOCK) {
      chrome.runtime.sendMessage({ type: MessageType.REQUEST_UNBLOCK, username });
      return;
    }
  }

  /**
   * Render a button element based on the given state.
   * @param {HTMLButtonElement} button
   * @param {string} username
   * @param {string} state
   */
  _renderButton(button, username, state) {
    // Store username as data attribute so querySelectorAll can find it
    button.dataset.username = username;
    button.disabled = false;
    button.className = 'tb-block-btn';

    switch (state) {
      case BlockState.IDLE:
        button.className += ' tb-block-btn--idle';
        button.innerHTML = `${Icons.ban}<span>封鎖</span>`;
        break;

      case BlockState.QUEUED:
        button.className += ' tb-block-btn--queued';
        button.innerHTML = `<span>排隊中</span>${Icons.x}`;
        break;

      case BlockState.BLOCKING:
        button.className += ' tb-block-btn--blocking';
        button.disabled = true;
        button.innerHTML = `${Icons.loader}<span>封鎖中...</span>`;
        break;

      case BlockState.BLOCKED:
        button.className += ' tb-block-btn--blocked';
        button.innerHTML = `${Icons.check}<span>已封鎖</span>`;
        break;

      case UIState.CONFIRM_UNBLOCK:
        button.className += ' tb-block-btn--confirm-unblock';
        button.innerHTML = `<span>確定解除？</span>`;
        break;

      case BlockState.UNBLOCKING:
        button.className += ' tb-block-btn--unblocking';
        button.disabled = true;
        button.innerHTML = `${Icons.loader}<span>解除中...</span>`;
        break;

      case BlockState.FAILED:
        button.className += ' tb-block-btn--failed';
        button.innerHTML = `${Icons.alertTriangle}<span>失敗</span>${Icons.refreshCw}`;
        break;

      default:
        button.innerHTML = `${Icons.ban}<span>封鎖</span>`;
        break;
    }
  }
}
