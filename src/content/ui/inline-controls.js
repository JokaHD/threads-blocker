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

    // Global safety net: in block mode, intercept any click that would navigate
    // away from the current page (catches clicks on links Threads adds dynamically)
    window.addEventListener('click', (e) => {
      if (!this._blockMode) return;
      // Check if the click target is inside a processed comment
      const processed = e.target.closest?.('[data-tb-processed]');
      if (processed) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true); // capture phase = runs first
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

    // Block ALL interaction events in block mode to prevent Threads navigation.
    // We intercept at capture phase on the element AND add a window-level
    // capture listener that blocks clicks on links inside processed elements.
    const selectHandler = (e) => {
      if (!this._blockMode) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Only process actual clicks, not mousedown/pointerdown
      if (e.type !== 'click') return;

      if (e.shiftKey) {
        this._selection.onClick(username, true);
      } else {
        this._selection.toggle(username);
        this._selection.setAnchor(username);
      }
      this._updateHighlights();
    };

    // Intercept click, mousedown, mouseup, pointerdown, pointerup at capture phase
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      element.addEventListener(evt, selectHandler, true);
    }

    // Also intercept all <a> tags inside this element
    const links = element.querySelectorAll('a');
    for (const link of links) {
      for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
        link.addEventListener(evt, (e) => {
          if (!this._blockMode) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }, true);
      }
    }
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
