import { MessageType } from '../../shared/messages.js';

export class Toolbar {
  /**
   * @param {import('../selection-manager.js').SelectionManager} selectionManager
   * @param {import('../id-resolver.js').IDResolver} idResolver
   */
  constructor(selectionManager, idResolver) {
    this._selection = selectionManager;
    this._idResolver = idResolver;
    this._el = null;
    this._countEl = null;
  }

  /**
   * Create DOM element and append to body. Register selection listener.
   */
  init() {
    const toolbar = document.createElement('div');
    toolbar.className = 'tb-toolbar';

    const count = document.createElement('span');
    count.className = 'tb-toolbar-count';

    const blockBtn = document.createElement('button');
    blockBtn.className = 'tb-toolbar-block-btn';
    blockBtn.textContent = '封鎖所有已選';
    blockBtn.addEventListener('click', () => this._handleBlockAll());

    const clearBtn = document.createElement('button');
    clearBtn.className = 'tb-toolbar-clear-btn';
    clearBtn.textContent = '取消選取';
    clearBtn.addEventListener('click', () => this._selection.clearSelection());

    toolbar.appendChild(count);
    toolbar.appendChild(blockBtn);
    toolbar.appendChild(clearBtn);

    document.body.appendChild(toolbar);

    this._el = toolbar;
    this._countEl = count;

    // Show/hide based on selection count
    this._selection.onChange((selected) => {
      const n = selected.length;
      if (n > 0) {
        count.textContent = `已選 ${n} 人`;
        toolbar.classList.add('tb-toolbar-visible');
      } else {
        toolbar.classList.remove('tb-toolbar-visible');
      }
    });
  }

  /**
   * Remove the toolbar from the DOM.
   */
  destroy() {
    if (this._el) {
      this._el.remove();
      this._el = null;
      this._countEl = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _handleBlockAll() {
    const selected = this._selection.getSelected();
    if (selected.length === 0) return;

    // Build list of { username, userId } entries
    const entries = await Promise.all(
      selected.map(async (username) => {
        // We don't have the comment element here, pass null — resolver will
        // fall back to username as the ID if it can't resolve.
        const userId = await this._idResolver.resolve(username, document.body);
        return { username, userId };
      })
    );

    chrome.runtime.sendMessage({
      type: MessageType.ENQUEUE_BLOCK_BATCH,
      entries,
    });

    this._selection.clearSelection();
  }
}
