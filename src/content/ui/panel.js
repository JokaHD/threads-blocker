/**
 * Panel - queue progress display.
 * Lives in Shadow DOM, inside the block mode card (InlineControls'
 * queue slot); the collapsed FAB carries a done/total badge instead.
 */

import { BlockState } from '../../shared/constants.js';
import { MessageType } from '../../shared/messages.js';
import { Icons } from './icons.js';
import { getStackContainer } from './shadow-host.js';
import { threadsSiteRule } from '../site-adapter.js';

/**
 * Queue counts for the FAB badge.
 * @returns {{done: number, total: number, failed: number, paused: boolean}}
 */
export function summarizeQueue(items, status) {
  return {
    done: items.filter((i) => i.state === BlockState.BLOCKED).length,
    total: items.length,
    failed: items.filter((i) => i.state === BlockState.FAILED).length,
    paused: (status?.paused ?? false) || !!status?.cooldownEnd,
  };
}

export class Panel {
  /**
   * @param {Element|null} container
   * @param {{onSummary?: (summary: ReturnType<typeof summarizeQueue>) => void}} [options]
   */
  constructor(container = null, { onSummary = null } = {}) {
    this._container = container;
    this._onSummary = onSummary;
    this._el = null;
    this._cooldownInterval = null;
    this._cooldownEnd = null;
    this._paused = false;
    this._routeHidden = false;

    // Element references
    this._progressFill = null;
    this._body = null;
    this._pauseBtn = null;
    this._cooldownArea = null;
    this._cooldownBtn = null;
    this._cooldownTimeSpan = null;
    this._retryNowBtn = null;
    this._retryAllBtn = null;
  }

  /**
   * Create panel in Shadow DOM.
   */
  init() {
    const container = this._container ?? getStackContainer();
    if (!container) {
      console.error('[ThreadBlocker] Failed to get UI container');
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'tb-panel tb-panel-hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Block progress');

    // Header
    const header = document.createElement('div');
    header.className = 'tb-panel-header';

    const title = document.createElement('span');
    title.className = 'tb-panel-title';
    title.textContent = 'Block Progress';

    header.appendChild(title);

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

    const retryAllBtn = document.createElement('button');
    retryAllBtn.className = 'tb-panel-action-btn tb-panel-retry-all-btn';
    retryAllBtn.title = 'Retry all failed items';
    retryAllBtn.style.display = 'none';
    retryAllBtn.addEventListener('click', () => {
      chrome.runtime
        .sendMessage({ type: MessageType.RETRY_ALL_FAILED })
        .catch((e) => console.warn('[ThreadBlocker] Retry all failed failed:', e.message));
    });

    const clearCompletedBtn = document.createElement('button');
    clearCompletedBtn.className = 'tb-panel-action-btn';
    clearCompletedBtn.innerHTML = `${Icons.check}<span>Clear Done</span>`;
    clearCompletedBtn.title = 'Clear completed items';
    clearCompletedBtn.addEventListener('click', () => {
      chrome.runtime
        .sendMessage({ type: MessageType.CLEAR_COMPLETED })
        .catch((e) => console.warn('[ThreadBlocker] Clear completed failed:', e.message));
    });

    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'tb-panel-action-btn tb-panel-action-btn--danger';
    clearAllBtn.innerHTML = `${Icons.x}<span>Clear All</span>`;
    clearAllBtn.title = 'Clear all items (including queued)';
    clearAllBtn.addEventListener('click', () => {
      chrome.runtime
        .sendMessage({ type: MessageType.CLEAR_QUEUE })
        .catch((e) => console.warn('[ThreadBlocker] Clear queue failed:', e.message));
    });

    footer.appendChild(retryAllBtn);
    footer.appendChild(clearCompletedBtn);
    footer.appendChild(clearAllBtn);

    // Cooldown area
    const cooldownArea = document.createElement('div');
    cooldownArea.className = 'tb-panel-cooldown-area';

    // Assemble
    panel.appendChild(header);
    panel.appendChild(progressBar);
    panel.appendChild(body);
    panel.appendChild(pauseBtn);
    panel.appendChild(footer);
    panel.appendChild(cooldownArea);

    container.appendChild(panel);

    // Store references
    this._el = panel;
    this._progressFill = progressFill;
    this._body = body;
    this._pauseBtn = pauseBtn;
    this._retryAllBtn = retryAllBtn;
    this._cooldownArea = cooldownArea;

    // Listen for route changes to hide on non-whitelisted pages
    window.addEventListener('tb-route-change', () => this._handleRouteChange());
    this._handleRouteChange();
  }

  _handleRouteChange() {
    const visible = threadsSiteRule.isUIVisibleOnUrl(window.location.href);
    this._routeHidden = !visible;
    if (this._el) {
      this._el.classList.toggle('tb-panel-route-hidden', this._routeHidden);
    }
  }

  /**
   * Update panel with queue state.
   */
  update(items, status) {
    if (!this._el) return;

    this._paused = status?.paused ?? false;

    const summary = summarizeQueue(items, status);
    const { total, done } = summary;
    this._onSummary?.(summary);

    // Show/hide panel
    if (total === 0) {
      this._el.classList.add('tb-panel-hidden');
      return;
    }
    this._el.classList.remove('tb-panel-hidden');

    // Progress bar
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this._progressFill.style.width = `${pct}%`;

    // Pause button
    this._updatePauseBtn();

    // Cooldown display follows the SW status: shown while it reports one,
    // dropped once it ends or is skipped (Retry Now / Resume)
    if (status?.cooldownEnd) this.setCooldownEnd(status.cooldownEnd);
    else if (this._cooldownEnd) this._hideCooldown();

    // Retry-all button: only while something has failed
    const failed = items.filter((i) => i.state === BlockState.FAILED).length;
    this._retryAllBtn.style.display = failed > 0 ? '' : 'none';
    this._retryAllBtn.innerHTML = `${Icons.refreshCw}<span>Retry Failed (${failed})</span>`;

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
    if (timestamp === this._cooldownEnd && this._cooldownInterval) return;

    this._cooldownEnd = timestamp;

    // Create cooldown UI once
    if (!this._cooldownBtn) {
      const btn = document.createElement('div');
      btn.className = 'tb-panel-cooldown-btn';

      btn.title = COOLDOWN_TOOLTIP;

      const label = document.createElement('span');
      label.textContent = 'Rate limited · retry in ';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'tb-panel-cooldown-time';

      const info = document.createElement('span');
      info.className = 'tb-panel-cooldown-info';
      info.innerHTML = Icons.info;

      btn.appendChild(label);
      btn.appendChild(timeSpan);
      btn.appendChild(info);

      const retryNowBtn = document.createElement('button');
      retryNowBtn.className = 'tb-panel-cooldown-retry-btn';
      retryNowBtn.textContent = 'Retry Now';
      retryNowBtn.title = 'Resume the queue now, skipping the cooldown';
      retryNowBtn.addEventListener('click', () => {
        chrome.runtime
          .sendMessage({ type: MessageType.RESUME_QUEUE })
          .catch((e) => console.warn('[ThreadBlocker] Resume failed:', e.message));
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
      this._cooldownTimeSpan.textContent = formatCountdown(remaining);
      if (remaining <= 0) this._hideCooldown();
    };

    if (this._cooldownInterval) {
      clearInterval(this._cooldownInterval);
    }

    // Arm before the first tick so an already-expired timestamp clears it
    this._cooldownInterval = setInterval(tick, 1000);
    tick();
  }

  _hideCooldown() {
    if (this._cooldownInterval) {
      clearInterval(this._cooldownInterval);
      this._cooldownInterval = null;
    }
    this._cooldownEnd = null;
    if (this._cooldownBtn) this._cooldownBtn.style.display = 'none';
    if (this._retryNowBtn) this._retryNowBtn.style.display = 'none';
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

  _togglePause() {
    const type = this._paused ? MessageType.RESUME_QUEUE : MessageType.PAUSE_QUEUE;
    chrome.runtime
      .sendMessage({ type })
      .catch((e) => console.warn('[ThreadBlocker] Toggle pause failed:', e.message));
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
    if (item.state === BlockState.RESOLVING) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'tb-panel-item-action';
      cancelBtn.innerHTML = Icons.x;
      cancelBtn.title = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        chrome.runtime
          .sendMessage({ type: MessageType.CANCEL_RESOLVING, username: item.username })
          .catch((e) => console.warn('[ThreadBlocker] Cancel resolving failed:', e.message));
      });
      row.appendChild(cancelBtn);
    } else if (item.state === BlockState.QUEUED) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'tb-panel-item-action';
      cancelBtn.innerHTML = Icons.x;
      cancelBtn.title = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        chrome.runtime
          .sendMessage({ type: MessageType.CANCEL_QUEUED, userId: item.userId })
          .catch((e) => console.warn('[ThreadBlocker] Cancel failed:', e.message));
      });
      row.appendChild(cancelBtn);
    } else if (item.state === BlockState.FAILED) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tb-panel-item-action';
      retryBtn.innerHTML = Icons.refreshCw;
      retryBtn.title = 'Retry';
      retryBtn.addEventListener('click', () => {
        chrome.runtime
          .sendMessage({ type: MessageType.RETRY_FAILED, userId: item.userId })
          .catch((e) => console.warn('[ThreadBlocker] Retry failed:', e.message));
      });
      row.appendChild(retryBtn);
    }

    return row;
  }

  _stateLabel(state) {
    switch (state) {
      case BlockState.RESOLVING:
        return 'Resolving...';
      case BlockState.QUEUED:
        return 'Queued';
      case BlockState.BLOCKING:
        return 'Blocking...';
      case BlockState.BLOCKED:
        return 'Blocked';
      case BlockState.UNBLOCKING:
        return 'Unblocking...';
      case BlockState.FAILED:
        return 'Failed';
      default:
        return state;
    }
  }
}

const COOLDOWN_TOOLTIP =
  'Experimental: Threads rate-limited this session. The cooldown is fixed at 24h ' +
  "because Threads doesn't say how long the limit actually lasts. " +
  'Click Retry Now to try again right away.';

/** 1:02:03 for >= 1h, otherwise 2:03. */
function formatCountdown(ms) {
  const secs = Math.ceil(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
