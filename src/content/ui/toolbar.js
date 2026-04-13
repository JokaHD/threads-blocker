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
   * Immediately enqueues all users (as RESOLVING), then resolves userIds async.
   */
  _handleBlockAll() {
    const selected = this._selection.getSelected();
    if (selected.length === 0) return;

    console.log(`[ThreadBlocker] Enqueueing ${selected.length} users (resolving IDs async)...`);

    // Immediately enqueue all users with userId=null (RESOLVING state)
    const entries = selected.map((username) => ({ username, userId: null }));

    chrome.runtime
      .sendMessage({
        type: MessageType.ENQUEUE_BLOCK_BATCH,
        entries,
      })
      .catch((e) => console.error('[ThreadBlocker] Enqueue batch failed:', e.message));

    // Clear selection and exit block mode immediately (non-blocking)
    this._selection.clearSelection();
    window.dispatchEvent(new CustomEvent('tb-exit-block-mode'));

    // Resolve userIds asynchronously in background
    this._resolveUsersAsync(selected);
  }

  /**
   * Resolve userIds for a list of usernames and update the queue.
   */
  async _resolveUsersAsync(usernames) {
    for (const username of usernames) {
      const userId = await this._idResolver.resolve(username);
      if (userId) {
        console.log(`[ThreadBlocker] Resolved @${username} -> ${userId}`);
      } else {
        console.warn(`[ThreadBlocker] Failed to resolve @${username}`);
      }

      chrome.runtime
        .sendMessage({
          type: MessageType.UPDATE_RESOLVED_USER,
          username,
          userId,
        })
        .catch((e) => console.warn('[ThreadBlocker] Update resolved user failed:', e.message));
    }
  }
}
