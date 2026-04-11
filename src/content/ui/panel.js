import { BlockState } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';

export class Panel {
  constructor() {
    this._el = null;
    this._minimized = true;
    this._cooldownInterval = null;
    // Hold references to avoid re-creating the cooldown button on every update
    this._cooldownBtn = null;
    this._cooldownTimeSpan = null;
    this._cooldownEnd = null;
    this._paused = false;
  }

  /**
   * Create DOM, append to body, hidden by default.
   */
  init() {
    const panel = document.createElement('div');
    panel.className = 'tb-panel';

    // ── Minimized badge ───────────────────────────────────────────────────────
    const badge = document.createElement('button');
    badge.className = 'tb-panel-badge';
    badge.innerHTML = `${Icons.shield} <span class="tb-panel-badge-text">0/0</span>`;
    badge.addEventListener('click', () => this._toggleMinimized());

    // ── Expanded header ───────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tb-panel-header';

    const title = document.createElement('span');
    title.className = 'tb-panel-title';
    title.textContent = '封鎖進度';

    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'tb-panel-minimize-btn';
    minimizeBtn.innerHTML = Icons.minus;
    minimizeBtn.title = '最小化';
    minimizeBtn.addEventListener('click', () => this._toggleMinimized());

    header.appendChild(title);
    header.appendChild(minimizeBtn);

    // ── Progress bar ──────────────────────────────────────────────────────────
    const progressBar = document.createElement('div');
    progressBar.className = 'tb-panel-progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = 'tb-panel-progress-fill';
    progressBar.appendChild(progressFill);

    // ── Item list ─────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'tb-panel-body';

    // ── Pause/resume button ───────────────────────────────────────────────────
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'tb-panel-pause-btn';
    pauseBtn.innerHTML = `${Icons.pause}<span>暫停</span>`;
    pauseBtn.addEventListener('click', () => this._togglePause(pauseBtn));

    // ── Cooldown area (injected once, updated on interval) ────────────────────
    const cooldownArea = document.createElement('div');
    cooldownArea.className = 'tb-panel-cooldown-area';

    panel.appendChild(badge);
    panel.appendChild(header);
    panel.appendChild(progressBar);
    panel.appendChild(body);
    panel.appendChild(pauseBtn);
    panel.appendChild(cooldownArea);

    document.body.appendChild(panel);

    this._el = panel;
    this._badge = badge;
    this._badgeText = badge.querySelector('.tb-panel-badge-text');
    this._progressFill = progressFill;
    this._body = body;
    this._pauseBtn = pauseBtn;
    this._cooldownArea = cooldownArea;

    // Start minimized (hidden entirely until first update with items)
    panel.style.display = 'none';
    this._applyMinimized();
  }

  /**
   * Receive queue state and re-render panel content.
   * @param {Array<{username: string, state: string}>} items
   * @param {{ paused: boolean }} status
   */
  update(items, status) {
    if (!this._el) return;

    this._paused = status?.paused ?? false;

    const total = items.length;
    const done = items.filter(
      (i) => i.state === BlockState.BLOCKED
    ).length;

    // Show/hide panel
    if (total === 0) {
      this._el.style.display = 'none';
      return;
    }
    this._el.style.display = '';

    // Badge text
    if (this._badgeText) {
      this._badgeText.textContent = `${done}/${total}`;
    }

    // Progress bar fill
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this._progressFill.style.width = `${pct}%`;

    // Pause button label
    this._updatePauseBtn();

    // Item list
    this._body.innerHTML = '';
    for (const item of items) {
      this._body.appendChild(this._renderItem(item));
    }
  }

  /**
   * Start a 1-second interval countdown toward `timestamp`.
   * Creates the cooldown button once; only updates the time span afterward.
   * @param {number} timestamp  ms since epoch when cooldown ends
   */
  setCooldownEnd(timestamp) {
    if (!this._el) return;

    this._cooldownEnd = timestamp;

    // Create button once
    if (!this._cooldownBtn) {
      const btn = document.createElement('button');
      btn.className = 'tb-panel-cooldown-btn';

      const label = document.createElement('span');
      label.textContent = '冷卻中: ';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'tb-panel-cooldown-time';

      btn.appendChild(label);
      btn.appendChild(timeSpan);
      this._cooldownArea.appendChild(btn);

      this._cooldownBtn = btn;
      this._cooldownTimeSpan = timeSpan;
    }

    this._cooldownBtn.style.display = '';

    const tick = () => {
      const remaining = Math.max(0, this._cooldownEnd - Date.now());
      const secs = Math.ceil(remaining / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      this._cooldownTimeSpan.textContent = `${m}:${String(s).padStart(2, '0')}`;

      if (remaining <= 0) {
        clearInterval(this._cooldownInterval);
        this._cooldownInterval = null;
        if (this._cooldownBtn) {
          this._cooldownBtn.style.display = 'none';
        }
      }
    };

    // Clear any existing interval before starting a new one
    if (this._cooldownInterval) {
      clearInterval(this._cooldownInterval);
    }

    tick(); // immediate first render
    this._cooldownInterval = setInterval(tick, 1000);
  }

  /**
   * Remove the panel from the DOM and clean up timers.
   */
  destroy() {
    if (this._cooldownInterval) {
      clearInterval(this._cooldownInterval);
      this._cooldownInterval = null;
    }
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _toggleMinimized() {
    this._minimized = !this._minimized;
    this._applyMinimized();
  }

  _applyMinimized() {
    if (!this._el) return;
    if (this._minimized) {
      this._el.classList.add('tb-panel-minimized');
    } else {
      this._el.classList.remove('tb-panel-minimized');
    }
  }

  _togglePause(btn) {
    if (this._paused) {
      chrome.runtime.sendMessage({ type: MessageType.RESUME_QUEUE });
    } else {
      chrome.runtime.sendMessage({ type: MessageType.PAUSE_QUEUE });
    }
    // Optimistic UI flip; will be corrected on next update()
    this._paused = !this._paused;
    this._updatePauseBtn();
  }

  _updatePauseBtn() {
    if (!this._pauseBtn) return;
    if (this._paused) {
      this._pauseBtn.innerHTML = `${Icons.play}<span>繼續</span>`;
    } else {
      this._pauseBtn.innerHTML = `${Icons.pause}<span>暫停</span>`;
    }
  }

  /**
   * Render a single queue item row.
   * @param {{ username: string, state: string }} item
   * @returns {HTMLElement}
   */
  _renderItem(item) {
    const row = document.createElement('div');
    row.className = 'tb-panel-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'tb-panel-item-name';
    nameEl.textContent = `@${item.username}`;

    const statusEl = document.createElement('span');
    statusEl.className = `tb-panel-item-status tb-panel-item-status--${item.state}`;
    statusEl.textContent = this._stateLabel(item.state);

    row.appendChild(nameEl);
    row.appendChild(statusEl);

    // Action button for queued (cancel) and failed (retry)
    if (item.state === BlockState.QUEUED) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'tb-panel-item-action';
      cancelBtn.innerHTML = Icons.x;
      cancelBtn.title = '取消';
      cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MessageType.CANCEL_QUEUED, username: item.username });
      });
      row.appendChild(cancelBtn);
    } else if (item.state === BlockState.FAILED) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tb-panel-item-action';
      retryBtn.innerHTML = Icons.refreshCw;
      retryBtn.title = '重試';
      retryBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MessageType.RETRY_FAILED, username: item.username });
      });
      row.appendChild(retryBtn);
    }

    return row;
  }

  _stateLabel(state) {
    switch (state) {
      case BlockState.QUEUED:    return '排隊中';
      case BlockState.BLOCKING:  return '封鎖中...';
      case BlockState.BLOCKED:   return '已封鎖';
      case BlockState.UNBLOCKING: return '解除中...';
      case BlockState.FAILED:    return '失敗';
      default:                   return state;
    }
  }
}
