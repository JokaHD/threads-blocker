/**
 * Panel - queue progress display.
 * Lives in Shadow DOM, positioned bottom-right above FAB.
 */

import { BlockState } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { getUIContainer } from './shadow-host.js';

export class Panel {
  constructor(container = null) {
    this._container = container;
    this._el = null;
    this._minimized = true;
    this._cooldownInterval = null;
    this._cooldownEnd = null;
    this._paused = false;

    // Element references
    this._badge = null;
    this._badgeText = null;
    this._progressFill = null;
    this._body = null;
    this._pauseBtn = null;
    this._cooldownArea = null;
    this._cooldownBtn = null;
    this._cooldownTimeSpan = null;
    this._retryNowBtn = null;
  }

  /**
   * Create panel in Shadow DOM.
   */
  init() {
    const container = this._container ?? getUIContainer();
    if (!container) {
      console.error('[ThreadBlocker] Failed to get UI container');
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'tb-panel tb-panel-hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Block progress');

    // Minimized badge
    const badge = document.createElement('button');
    badge.className = 'tb-panel-badge';
    badge.innerHTML = `${Icons.shield} <span class="tb-panel-badge-text">0/0</span>`;
    badge.addEventListener('click', () => this._toggleMinimized());

    // Header
    const header = document.createElement('div');
    header.className = 'tb-panel-header';

    const title = document.createElement('span');
    title.className = 'tb-panel-title';
    title.textContent = 'Block Progress';

    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'tb-panel-minimize-btn';
    minimizeBtn.innerHTML = Icons.minus;
    minimizeBtn.title = 'Minimize';
    minimizeBtn.addEventListener('click', () => this._toggleMinimized());

    header.appendChild(title);
    header.appendChild(minimizeBtn);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'tb-panel-progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = 'tb-panel-progress-fill';
    progressFill.style.width = '0%';
    progressBar.appendChild(progressFill);

    // Item list
    const body = document.createElement('div');
    body.className = 'tb-panel-body';
    body.setAttribute('aria-live', 'polite');

    // Pause button
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'tb-panel-pause-btn';
    pauseBtn.innerHTML = `${Icons.pause}<span>Pause</span>`;
    pauseBtn.addEventListener('click', () => this._togglePause());

    // Footer with action buttons
    const footer = document.createElement('div');
    footer.className = 'tb-panel-footer';

    const clearCompletedBtn = document.createElement('button');
    clearCompletedBtn.className = 'tb-panel-action-btn';
    clearCompletedBtn.innerHTML = `${Icons.check}<span>Clear Done</span>`;
    clearCompletedBtn.title = 'Clear completed items';
    clearCompletedBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: MessageType.CLEAR_COMPLETED })
        .catch(e => console.warn('[ThreadBlocker] Clear completed failed:', e.message));
    });

    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'tb-panel-action-btn tb-panel-action-btn--danger';
    clearAllBtn.innerHTML = `${Icons.x}<span>Clear All</span>`;
    clearAllBtn.title = 'Clear all items (including queued)';
    clearAllBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: MessageType.CLEAR_QUEUE })
        .catch(e => console.warn('[ThreadBlocker] Clear queue failed:', e.message));
    });

    footer.appendChild(clearCompletedBtn);
    footer.appendChild(clearAllBtn);

    // Cooldown area
    const cooldownArea = document.createElement('div');
    cooldownArea.className = 'tb-panel-cooldown-area';

    // Assemble
    panel.appendChild(badge);
    panel.appendChild(header);
    panel.appendChild(progressBar);
    panel.appendChild(body);
    panel.appendChild(pauseBtn);
    panel.appendChild(footer);
    panel.appendChild(cooldownArea);

    container.appendChild(panel);

    // Store references
    this._el = panel;
    this._badge = badge;
    this._badgeText = badge.querySelector('.tb-panel-badge-text');
    this._progressFill = progressFill;
    this._body = body;
    this._pauseBtn = pauseBtn;
    this._cooldownArea = cooldownArea;

    // Start minimized
    this._applyMinimized();
  }

  /**
   * Update panel with queue state.
   */
  update(items, status) {
    if (!this._el) return;

    this._paused = status?.paused ?? false;

    const total = items.length;
    const done = items.filter(i => i.state === BlockState.BLOCKED).length;

    // Show/hide panel
    if (total === 0) {
      this._el.classList.add('tb-panel-hidden');
      return;
    }
    this._el.classList.remove('tb-panel-hidden');

    // Badge text
    if (this._badgeText) {
      this._badgeText.textContent = `${done}/${total}`;
    }

    // Progress bar
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this._progressFill.style.width = `${pct}%`;

    // Pause button
    this._updatePauseBtn();

    // Item list
    this._body.innerHTML = '';
    for (const item of items) {
      this._body.appendChild(this._renderItem(item));
    }
  }

  /**
   * Set cooldown end timestamp and start countdown.
   */
  setCooldownEnd(timestamp) {
    if (!this._el) return;

    this._cooldownEnd = timestamp;

    // Create cooldown UI once
    if (!this._cooldownBtn) {
      const btn = document.createElement('div');
      btn.className = 'tb-panel-cooldown-btn';

      const label = document.createElement('span');
      label.textContent = 'Cooldown: ';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'tb-panel-cooldown-time';

      btn.appendChild(label);
      btn.appendChild(timeSpan);

      const retryNowBtn = document.createElement('button');
      retryNowBtn.className = 'tb-panel-cooldown-retry-btn';
      retryNowBtn.textContent = 'Retry Now';
      retryNowBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MessageType.RESUME_QUEUE })
          .catch(e => console.warn('[ThreadBlocker] Resume failed:', e.message));
      });

      this._cooldownArea.appendChild(btn);
      this._cooldownArea.appendChild(retryNowBtn);

      this._cooldownBtn = btn;
      this._cooldownTimeSpan = timeSpan;
      this._retryNowBtn = retryNowBtn;
    }

    this._cooldownBtn.style.display = '';
    if (this._retryNowBtn) this._retryNowBtn.style.display = '';

    const tick = () => {
      const remaining = Math.max(0, this._cooldownEnd - Date.now());
      const secs = Math.ceil(remaining / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      this._cooldownTimeSpan.textContent = `${m}:${String(s).padStart(2, '0')}`;

      if (remaining <= 0) {
        clearInterval(this._cooldownInterval);
        this._cooldownInterval = null;
        if (this._cooldownBtn) this._cooldownBtn.style.display = 'none';
        if (this._retryNowBtn) this._retryNowBtn.style.display = 'none';
      }
    };

    if (this._cooldownInterval) {
      clearInterval(this._cooldownInterval);
    }

    tick();
    this._cooldownInterval = setInterval(tick, 1000);
  }

  /**
   * Cleanup.
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

  // Private methods

  _toggleMinimized() {
    this._minimized = !this._minimized;
    this._applyMinimized();
  }

  _applyMinimized() {
    if (!this._el) return;
    this._el.classList.toggle('tb-panel-minimized', this._minimized);
  }

  _togglePause() {
    const type = this._paused ? MessageType.RESUME_QUEUE : MessageType.PAUSE_QUEUE;
    chrome.runtime.sendMessage({ type })
      .catch(e => console.warn('[ThreadBlocker] Toggle pause failed:', e.message));
    this._paused = !this._paused;
    this._updatePauseBtn();
  }

  _updatePauseBtn() {
    if (!this._pauseBtn) return;
    if (this._paused) {
      this._pauseBtn.innerHTML = `${Icons.play}<span>Resume</span>`;
    } else {
      this._pauseBtn.innerHTML = `${Icons.pause}<span>Pause</span>`;
    }
  }

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

    // Action buttons
    if (item.state === BlockState.QUEUED) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'tb-panel-item-action';
      cancelBtn.innerHTML = Icons.x;
      cancelBtn.title = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MessageType.CANCEL_QUEUED, userId: item.userId })
          .catch(e => console.warn('[ThreadBlocker] Cancel failed:', e.message));
      });
      row.appendChild(cancelBtn);
    } else if (item.state === BlockState.FAILED) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tb-panel-item-action';
      retryBtn.innerHTML = Icons.refreshCw;
      retryBtn.title = 'Retry';
      retryBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MessageType.RETRY_FAILED, userId: item.userId })
          .catch(e => console.warn('[ThreadBlocker] Retry failed:', e.message));
      });
      row.appendChild(retryBtn);
    }

    return row;
  }

  _stateLabel(state) {
    switch (state) {
      case BlockState.QUEUED: return 'Queued';
      case BlockState.BLOCKING: return 'Blocking...';
      case BlockState.BLOCKED: return 'Blocked';
      case BlockState.UNBLOCKING: return 'Unblocking...';
      case BlockState.FAILED: return 'Failed';
      default: return state;
    }
  }
}
