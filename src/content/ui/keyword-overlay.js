/**
 * Keyword manager overlay — a modal over the Threads page, opened from the
 * block mode card's manage button. Built on open and torn down on close
 * (✕, Esc, backdrop click), so nothing keeps listening while it's closed.
 */

import { Icons } from './icons.js';
import { KeywordManager } from './keyword-manager.js';

export class KeywordOverlay {
  /** @param {HTMLElement} container — inside the shadow root */
  constructor(container) {
    this._container = container;
    this._backdrop = null;
    this._manager = null;
    this._returnFocusTo = null;
    // Capture on document: catches Esc even when focus fell back to <body>
    this._onDocumentKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    };
  }

  get isOpen() {
    return this._backdrop !== null;
  }

  /** @param {{returnFocusTo?: HTMLElement}} [options] */
  open({ returnFocusTo = null } = {}) {
    if (this.isOpen) return;
    this._returnFocusTo = returnFocusTo;

    const backdrop = document.createElement('div');
    backdrop.className = 'tb-kw-overlay';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'km-title');

    const modal = document.createElement('div');
    modal.className = 'tb-kw-modal';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-kw-modal-close';
    close.innerHTML = Icons.x;
    close.setAttribute('aria-label', '關閉');
    close.addEventListener('click', () => this.close());

    const root = document.createElement('div');
    root.className = 'km';

    modal.appendChild(close);
    modal.appendChild(root);
    backdrop.appendChild(modal);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });
    // Typing in the manager must not reach Threads' own key handlers: past
    // the shadow boundary the target is our host, not an input
    for (const type of ['keydown', 'keyup', 'keypress']) {
      backdrop.addEventListener(type, (e) => e.stopPropagation());
    }

    this._container.appendChild(backdrop);
    this._backdrop = backdrop;
    document.addEventListener('keydown', this._onDocumentKeydown, true);

    this._manager = new KeywordManager(root);
    this._manager
      .init()
      .catch((e) => console.warn('[ThreadBlocker] Keyword manager failed to load:', e.message));
    root.querySelector('#km-input')?.focus();
  }

  close() {
    if (!this.isOpen) return;
    document.removeEventListener('keydown', this._onDocumentKeydown, true);
    this._manager.destroy();
    this._manager = null;
    this._backdrop.remove();
    this._backdrop = null;
    this._returnFocusTo?.focus();
    this._returnFocusTo = null;
  }

  destroy() {
    this.close();
  }
}
