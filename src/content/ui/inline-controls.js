/**
 * Inline Controls - FAB and Block Mode.
 * Block mode uses CSS pointer-events + document click handler.
 * No overlay, no DOM modification on comments.
 */

import { BlockState } from '../../shared/constants.js';
import { Icons } from './icons.js';
import { getUIContainer } from './shadow-host.js';
import { COMMENT_ID_ATTR } from '../dom-observer.js';

export class InlineControls {
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._users = new Map(); // username -> { state, container }
    this._blockMode = false;
    this._fab = null;
    this._clickHandler = null;
    this._hoverHandler = null;
    this._lastHovered = null;
  }

  init() {
    const container = getUIContainer();
    if (!container) {
      console.error('[ThreadBlocker] Failed to get UI container');
      return;
    }

    // Create FAB
    this._fab = document.createElement('button');
    this._fab.className = 'tb-fab';
    this._fab.innerHTML = `${Icons.shield}<span>Block Mode</span>`;
    this._fab.title = 'Enter block mode: click comments to select';
    this._fab.setAttribute('aria-label', 'Enter block mode');
    this._fab.addEventListener('click', () => this._toggleBlockMode());
    container.appendChild(this._fab);

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
      this._exitBlockMode();
    } else {
      this._enterBlockMode();
    }
  }

  _enterBlockMode() {
    this._blockMode = true;

    // Update FAB
    this._fab.classList.add('tb-fab-active');
    this._fab.innerHTML = `${Icons.x}<span>Exit Block Mode</span>`;
    this._fab.title = 'Exit block mode';

    // Add body class - this triggers CSS that disables pointer-events on links
    document.body.classList.add('tb-blockmode');
  }

  _exitBlockMode() {
    this._blockMode = false;

    // Update FAB
    this._fab.classList.remove('tb-fab-active');
    this._fab.innerHTML = `${Icons.shield}<span>Block Mode</span>`;
    this._fab.title = 'Enter block mode: click comments to select';

    // Remove body class
    document.body.classList.remove('tb-blockmode');

    // Remove all visual states
    document.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach(el => {
      el.classList.remove('tb-hover', 'tb-selected');
    });

    this._lastHovered = null;
    this._selection.clearSelection();
  }

  _updateHighlights() {
    document.querySelectorAll(`[${COMMENT_ID_ATTR}]`).forEach(el => {
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
    this._exitBlockMode();
  }
}
