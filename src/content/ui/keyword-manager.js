/**
 * Keyword manager (in-page overlay, see keyword-overlay.js): add, toggle and
 * delete keywords, the global switch, and per-keyword stats.
 *
 * Reads and writes `keywords` / `keywordHighlightEnabled` directly; stats are
 * read-only here (the service worker owns `keywordStats`). Every change made
 * elsewhere (another tab, the card switch) arrives through storage.onChanged.
 */

import {
  KeywordStorageKey,
  KeywordLimits,
  normalizeKeyword,
  isDuplicate,
  formatBlockRate,
} from '../../shared/keywords.js';

const DELETE_CONFIRM_MS = 3000;

export class KeywordManager {
  /**
   * @param {HTMLElement} root
   * @param {{newId?: () => string}} [options]
   */
  constructor(root, { newId = () => crypto.randomUUID() } = {}) {
    this._root = root;
    this._newId = newId;
    this._keywords = [];
    this._enabled = true;
    this._stats = null;
    // Keywords added while this page is open stay on top until reload
    this._pinned = new Set();
    this._pendingDelete = null; // { id, timer }
    this._destroyed = false;
    this._onStorageChange = (changes, area) => this._handleStorageChange(changes, area);
  }

  async init() {
    this._build();
    const data = await chrome.storage.local.get([
      KeywordStorageKey.ENABLED,
      KeywordStorageKey.KEYWORDS,
      KeywordStorageKey.STATS,
    ]);
    this._enabled = data[KeywordStorageKey.ENABLED] !== false;
    this._keywords = data[KeywordStorageKey.KEYWORDS] ?? [];
    this._stats = data[KeywordStorageKey.STATS] ?? null;
    // Closed while storage was still answering: don't leave a listener behind
    if (this._destroyed) return;
    chrome.storage.onChanged.addListener(this._onStorageChange);
    this._render();
  }

  destroy() {
    this._destroyed = true;
    chrome.storage.onChanged.removeListener(this._onStorageChange);
    clearTimeout(this._pendingDelete?.timer);
    this._pendingDelete = null;
  }

  _build() {
    this._root.innerHTML = `
      <header class="km-head">
        <h2 class="km-title" id="km-title">關鍵字</h2>
        <div class="km-global">
          <span id="km-global-label">標示關鍵字</span>
          <button type="button" class="km-switch km-switch--lg" id="km-global-switch"
            role="switch" aria-labelledby="km-global-label"></button>
        </div>
      </header>
      <form class="km-add" id="km-add-form">
        <input class="km-input" id="km-input" type="text" autocomplete="off"
          placeholder="新增關鍵字" aria-label="新增關鍵字" />
        <button type="submit" class="km-btn">新增</button>
      </form>
      <p class="km-error" id="km-error" role="alert" hidden></p>
      <table class="km-table">
        <thead>
          <tr>
            <th class="km-col-on">啟用</th>
            <th>關鍵字</th>
            <th class="km-num">已看到</th>
            <th class="km-num">已封鎖</th>
            <th class="km-num">封鎖率</th>
            <th class="km-col-del km-num"><span class="km-sr">刪除</span></th>
          </tr>
        </thead>
        <tbody id="km-rows"></tbody>
      </table>
      <p class="km-empty" id="km-empty" hidden>還沒有關鍵字。在上方輸入後按 Enter 新增。</p>
      <p class="km-foot" id="km-foot"></p>
    `;

    this._globalSwitch = this._root.querySelector('#km-global-switch');
    this._input = this._root.querySelector('#km-input');
    this._errorEl = this._root.querySelector('#km-error');
    this._rowsEl = this._root.querySelector('#km-rows');
    this._emptyEl = this._root.querySelector('#km-empty');
    this._footEl = this._root.querySelector('#km-foot');

    this._globalSwitch.addEventListener('click', () => this._setEnabled(!this._enabled));
    this._root.querySelector('#km-add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._add(this._input.value);
    });
    this._rowsEl.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      const id = button?.closest('tr')?.dataset.id;
      if (!id) return;
      if (button.dataset.action === 'toggle') this._toggleKeyword(id);
      else if (button.dataset.action === 'delete') this._requestDelete(id);
    });
  }

  _add(raw) {
    const text = normalizeKeyword(raw);
    if (!text) {
      return this._showError(
        String(raw ?? '').trim() ? `關鍵字最多 ${KeywordLimits.MAX_LENGTH} 字` : '請輸入關鍵字'
      );
    }
    if (isDuplicate(text, this._keywords)) return this._showError(`「${text}」已在清單中`);
    if (this._keywords.length >= KeywordLimits.MAX_COUNT) {
      return this._showError(`最多 ${KeywordLimits.MAX_COUNT} 個關鍵字`);
    }

    const keyword = { id: this._newId(), text, enabled: true, createdAt: Date.now() };
    this._pinned.add(keyword.id);
    this._input.value = '';
    this._showError(null);
    return this._saveKeywords([...this._keywords, keyword]);
  }

  _toggleKeyword(id) {
    return this._saveKeywords(
      this._keywords.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k))
    );
  }

  _requestDelete(id) {
    if (this._pendingDelete?.id === id) {
      clearTimeout(this._pendingDelete.timer);
      this._pendingDelete = null;
      this._pinned.delete(id);
      return this._saveKeywords(this._keywords.filter((k) => k.id !== id));
    }
    clearTimeout(this._pendingDelete?.timer);
    this._pendingDelete = {
      id,
      timer: setTimeout(() => {
        this._pendingDelete = null;
        this._render();
      }, DELETE_CONFIRM_MS),
    };
    this._render();
    return undefined;
  }

  _setEnabled(on) {
    this._enabled = on;
    this._render();
    return chrome.storage.local.set({ [KeywordStorageKey.ENABLED]: on });
  }

  _saveKeywords(next) {
    this._keywords = next;
    this._render();
    return chrome.storage.local.set({ [KeywordStorageKey.KEYWORDS]: next });
  }

  _showError(message) {
    this._errorEl.hidden = !message;
    this._errorEl.textContent = message ?? '';
  }

  _handleStorageChange(changes, area) {
    if (area !== 'local') return;
    const enabled = changes[KeywordStorageKey.ENABLED];
    const keywords = changes[KeywordStorageKey.KEYWORDS];
    const stats = changes[KeywordStorageKey.STATS];
    if (enabled) this._enabled = enabled.newValue !== false;
    if (keywords) this._keywords = keywords.newValue ?? [];
    if (stats) this._stats = stats.newValue ?? null;
    if (enabled || keywords || stats) this._render();
  }

  _counts(id) {
    return this._stats?.perKeyword?.[id] ?? { hits: 0, blocked: 0 };
  }

  _sorted() {
    return [...this._keywords].sort((a, b) => {
      const pinA = this._pinned.has(a.id);
      const pinB = this._pinned.has(b.id);
      if (pinA !== pinB) return pinA ? -1 : 1;
      if (pinA) return b.createdAt - a.createdAt;
      return this._counts(b.id).hits - this._counts(a.id).hits || a.createdAt - b.createdAt;
    });
  }

  _render() {
    this._globalSwitch.setAttribute('aria-checked', String(this._enabled));
    this._rowsEl.replaceChildren(...this._sorted().map((k) => this._renderRow(k)));
    this._emptyEl.hidden = this._keywords.length > 0;

    const since = this._stats?.since
      ? `統計自 ${new Date(this._stats.since).toLocaleDateString('zh-TW')} 起。`
      : '';
    this._footEl.textContent =
      `封鎖率在看到 ${KeywordLimits.MIN_HITS_FOR_RATE} 則以上才顯示。` +
      `標示關閉時仍會統計，資料只存在這個瀏覽器。${since}`;
  }

  _renderRow(keyword) {
    const counts = this._counts(keyword.id);
    const confirming = this._pendingDelete?.id === keyword.id;

    const row = document.createElement('tr');
    row.dataset.id = keyword.id;
    row.classList.toggle('km-row--off', !keyword.enabled);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'km-switch';
    toggle.dataset.action = 'toggle';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(keyword.enabled));
    toggle.setAttribute('aria-label', `標示「${keyword.text}」`);

    const text = document.createElement('span');
    text.className = 'km-kw';
    text.textContent = keyword.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = confirming ? 'km-del km-del--confirm' : 'km-del';
    del.dataset.action = 'delete';
    del.textContent = confirming ? '刪除？' : '✕';
    del.setAttribute(
      'aria-label',
      confirming ? `確認刪除「${keyword.text}」及其統計` : `刪除「${keyword.text}」`
    );

    row.append(
      cell(toggle),
      cell(text),
      cell(String(counts.hits), 'km-num'),
      cell(String(counts.blocked), 'km-num'),
      cell(formatBlockRate(counts), 'km-num'),
      cell(del, 'km-num')
    );
    return row;
  }
}

function cell(content, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (typeof content === 'string') td.textContent = content;
  else td.appendChild(content);
  return td;
}
