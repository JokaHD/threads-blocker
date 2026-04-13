/**
 * Toolbar - batch operation bar at top of screen.
 * Lives in Shadow DOM.
 */

import { MessageType } from '../../shared/messages.js';
import { getUIContainer } from './shadow-host.js';

export class Toolbar {
  constructor(selectionManager, idResolver, container = null) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._container = container;
    this._el = null;
    this._countEl = null;
  }

  /**
   * Create toolbar in Shadow DOM.
   */
  init() {
    const container = this._container ?? getUIContainer();
    if (!container) {
      console.error('[ThreadBlocker] Failed to get UI container');
      return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'tb-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Batch block toolbar');

    const count = document.createElement('span');
    count.className = 'tb-toolbar-count';

    const blockBtn = document.createElement('button');
    blockBtn.className = 'tb-toolbar-block-btn';
    blockBtn.textContent = 'Block Selected';
    blockBtn.addEventListener('click', () => this._handleBlockAll());

    const clearBtn = document.createElement('button');
    clearBtn.className = 'tb-toolbar-clear-btn';
    clearBtn.textContent = 'Clear Selection';
    clearBtn.addEventListener('click', () => this._selection.clearSelection());

    toolbar.appendChild(count);
    toolbar.appendChild(blockBtn);
    toolbar.appendChild(clearBtn);

    container.appendChild(toolbar);

    this._el = toolbar;
    this._countEl = count;

    // Show/hide based on selection count
    this._selection.onChange((selected) => {
      const n = selected.length;
      if (n > 0) {
        count.textContent = `${n} selected`;
        toolbar.classList.add('tb-toolbar-visible');
      } else {
        toolbar.classList.remove('tb-toolbar-visible');
      }
    });
  }

  /**
   * Remove toolbar.
   */
  destroy() {
    if (this._el) {
      this._el.remove();
      this._el = null;
      this._countEl = null;
    }
  }

  /**
   * Handle block all selected users.
   */
  async _handleBlockAll() {
    const selected = this._selection.getSelected();
    if (selected.length === 0) return;

    console.log(`[ThreadBlocker] Resolving user IDs for ${selected.length} users...`);

    // Build list of { username, userId } entries
    const entries = [];
    for (const username of selected) {
      const userId = await this._idResolver.resolve(username);
      if (userId) {
        entries.push({ username, userId });
      } else {
        console.warn(`[ThreadBlocker] Skipping @${username} - could not resolve user_id`);
      }
    }

    if (entries.length === 0) {
      console.error('[ThreadBlocker] No valid user IDs found');
      return;
    }

    console.log(`[ThreadBlocker] Enqueueing ${entries.length} users for blocking`);

    chrome.runtime.sendMessage({
      type: MessageType.ENQUEUE_BLOCK_BATCH,
      entries,
    }).catch(e => console.error('[ThreadBlocker] Enqueue batch failed:', e.message));

    this._selection.clearSelection();

    // Exit block mode via custom event
    window.dispatchEvent(new CustomEvent('tb-exit-block-mode'));
  }
}
