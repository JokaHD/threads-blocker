import { BlockState, UIState, Timing } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { DOMObserver } from '../dom-observer.js';

/**
 * Block mode: user clicks a FAB to enter block mode. In block mode,
 * clicking on any comment selects/deselects it (whole comment highlights).
 * No elements are injected into Threads' DOM — only event interception.
 */
export class InlineControls {
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._users = new Map(); // username -> { state, confirmTimer, userId, commentEl }
    this._blockMode = false;
    this._fab = null;
    this._commentClickHandlers = new Map(); // element -> handler
  }

  init() {
    // FAB button — fixed bottom-right
    this._fab = document.createElement('button');
    this._fab.className = 'tb-fab';
    this._fab.innerHTML = `${Icons.shield}<span class="tb-fab-label">封鎖模式</span>`;
    this._fab.title = '進入封鎖模式：點擊留言即可選取並封鎖';
    this._fab.setAttribute('aria-label', '進入封鎖模式');
    this._fab.addEventListener('click', () => this._toggleBlockMode());
    document.body.appendChild(this._fab);
  }

  get multiSelectMode() { return this._blockMode; }

  inject(comment) {
    const { username, element } = comment;
    DOMObserver.markProcessed(element);
    this._selection.recordSeen(username);

    if (this._users.has(username)) return;

    this._users.set(username, {
      state: BlockState.IDLE,
      confirmTimer: null,
      userId: null,
      commentEl: element,
    });

    // Add click handler to the comment element (only active in block mode)
    const handler = (e) => {
      if (!this._blockMode) return;

      // Intercept all clicks in block mode
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
      this._updateHighlights();
    };

    // Use capture phase to intercept before Threads' handlers
    element.addEventListener('click', handler, true);
    this._commentClickHandlers.set(element, handler);

    // Add hover style class
    if (this._blockMode) {
      element.classList.add('tb-blockmode-target');
    }
  }

  updateState(username, state) {
    const user = this._users.get(username);
    if (!user) return;

    if (user.confirmTimer !== null && state !== UIState.CONFIRM_UNBLOCK) {
      clearTimeout(user.confirmTimer);
      user.confirmTimer = null;
    }
    user.state = state;
  }

  setMultiSelectMode(enabled) {
    if (enabled) this._enterBlockMode();
    else this._exitBlockMode();
  }

  _toggleBlockMode() {
    if (this._blockMode) {
      this._exitBlockMode();
    } else {
      this._enterBlockMode();
    }
  }

  _enterBlockMode() {
    this._blockMode = true;
    this._fab.classList.add('tb-fab-active');
    this._fab.innerHTML = `${Icons.x}<span class="tb-fab-label">離開封鎖模式</span>`;
    this._fab.title = '離開封鎖模式';

    // Add visual class to all known comment elements
    for (const [, user] of this._users) {
      user.commentEl.classList.add('tb-blockmode-target');
    }

    // Add body class for global cursor change
    document.body.classList.add('tb-blockmode');
  }

  _exitBlockMode() {
    this._blockMode = false;
    this._fab.classList.remove('tb-fab-active');
    this._fab.innerHTML = `${Icons.shield}<span class="tb-fab-label">封鎖模式</span>`;
    this._fab.title = '進入封鎖模式：點擊留言即可選取並封鎖';

    // Remove visual classes
    for (const [, user] of this._users) {
      user.commentEl.classList.remove('tb-blockmode-target');
      user.commentEl.classList.remove('tb-blockmode-selected');
    }

    document.body.classList.remove('tb-blockmode');
    this._selection.clearSelection();
  }

  _updateHighlights() {
    for (const [username, user] of this._users) {
      const selected = this._selection.isSelected(username);
      user.commentEl.classList.toggle('tb-blockmode-selected', selected);
    }
  }

  updateCheckboxes() {
    this._updateHighlights();
  }
}
