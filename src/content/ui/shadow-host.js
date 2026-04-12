/**
 * Shadow DOM host for Thread Blocker UI.
 * All extension UI lives inside this shadow root to prevent CSS pollution.
 */

const SHADOW_HOST_ID = 'tb-shadow-host';

let shadowRoot = null;

/**
 * Get or create the shadow host and return its shadow root.
 * The shadow root contains all extension UI (FAB, toolbar, panel).
 */
export function getShadowRoot() {
  if (shadowRoot) return shadowRoot;

  // Check if already exists (page reload, etc.)
  const existing = document.getElementById(SHADOW_HOST_ID);
  if (existing?.shadowRoot) {
    shadowRoot = existing.shadowRoot;
    return shadowRoot;
  }

  // Create host element
  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  // Host itself is invisible and doesn't interfere with page
  host.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;

  // Attach shadow root
  shadowRoot = host.attachShadow({ mode: 'open' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getExtensionStyles();
  shadowRoot.appendChild(style);

  // Create UI containers
  const uiContainer = document.createElement('div');
  uiContainer.className = 'tb-ui-container';
  shadowRoot.appendChild(uiContainer);

  document.body.appendChild(host);

  return shadowRoot;
}

/**
 * Get the UI container inside the shadow root.
 */
export function getUIContainer() {
  const root = getShadowRoot();
  return root.querySelector('.tb-ui-container');
}

/**
 * Check if shadow host exists.
 */
export function shadowHostExists() {
  return !!document.getElementById(SHADOW_HOST_ID);
}

/**
 * Destroy the shadow host.
 */
export function destroyShadowHost() {
  const host = document.getElementById(SHADOW_HOST_ID);
  if (host) {
    host.remove();
    shadowRoot = null;
  }
}

/**
 * Extension styles - all UI CSS lives here.
 * Isolated from page CSS via Shadow DOM.
 */
function getExtensionStyles() {
  return `
    /* Container for all UI elements */
    .tb-ui-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #e0e0e0;
    }

    /* ============================================================
       Design tokens
       ============================================================ */
    .tb-ui-container {
      --tb-primary: #2563EB;
      --tb-danger: #DC2626;
      --tb-danger-hover: #B91C1C;
      --tb-success: #16A34A;
      --tb-warning: #F59E0B;
      --tb-bg: rgba(25, 25, 25, 0.95);
      --tb-bg-hover: rgba(35, 35, 35, 0.95);
      --tb-border: #333;
      --tb-text: #e0e0e0;
      --tb-text-muted: #888;
      --tb-radius-sm: 8px;
      --tb-radius-md: 12px;
      --tb-transition: 150ms ease;
    }

    /* Light theme */
    @media (prefers-color-scheme: light) {
      .tb-ui-container {
        --tb-bg: rgba(255, 255, 255, 0.95);
        --tb-bg-hover: rgba(245, 245, 245, 0.95);
        --tb-border: #e0e0e0;
        --tb-text: #333;
        --tb-text-muted: #666;
      }
    }

    /* ============================================================
       Spinner animation
       ============================================================ */
    @keyframes tb-spin {
      to { transform: rotate(360deg); }
    }
    .tb-spin {
      display: inline-block;
      animation: tb-spin 700ms linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .tb-spin { animation: none; }
    }

    /* ============================================================
       FAB — Floating Action Button
       ============================================================ */
    .tb-fab {
      position: fixed;
      bottom: 100px;
      right: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: 28px;
      background: var(--tb-bg);
      color: var(--tb-text);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      transition: all var(--tb-transition);
      pointer-events: auto;
    }

    .tb-fab svg {
      width: 20px;
      height: 20px;
    }

    .tb-fab:hover {
      background: var(--tb-bg-hover);
      transform: scale(1.03);
    }

    .tb-fab:active {
      transform: scale(0.97);
    }

    .tb-fab.tb-fab-active {
      background: var(--tb-danger);
      color: #fff;
      box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
    }

    .tb-fab.tb-fab-active:hover {
      background: var(--tb-danger-hover);
    }

    /* ============================================================
       Toolbar — top bar when items selected
       ============================================================ */
    .tb-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      background: var(--tb-bg);
      color: var(--tb-text);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transform: translateY(-100%);
      transition: transform 250ms ease-out;
      pointer-events: auto;
    }

    .tb-toolbar.tb-toolbar-visible {
      transform: translateY(0);
    }

    .tb-toolbar-count {
      flex: 1;
      font-weight: 600;
      color: var(--tb-text-muted);
    }

    .tb-toolbar-block-btn {
      background: var(--tb-danger);
      color: #fff;
      border: none;
      border-radius: var(--tb-radius-sm);
      padding: 8px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background var(--tb-transition);
    }

    .tb-toolbar-block-btn:hover {
      background: var(--tb-danger-hover);
    }

    .tb-toolbar-clear-btn {
      background: transparent;
      color: var(--tb-text-muted);
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-sm);
      padding: 8px 18px;
      font-size: 14px;
      cursor: pointer;
      transition: all var(--tb-transition);
    }

    .tb-toolbar-clear-btn:hover {
      border-color: var(--tb-text);
      color: var(--tb-text);
    }

    /* ============================================================
       Panel — queue progress (bottom-right, above FAB)
       ============================================================ */
    .tb-panel {
      position: fixed;
      bottom: 160px;
      right: 16px;
      width: 300px;
      max-height: 360px;
      display: flex;
      flex-direction: column;
      background: var(--tb-bg);
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-md);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      overflow: hidden;
      pointer-events: auto;
    }

    .tb-panel-hidden {
      display: none;
    }

    .tb-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--tb-bg-hover);
      border-bottom: 1px solid var(--tb-border);
      flex-shrink: 0;
    }

    .tb-panel-title {
      flex: 1;
      font-weight: 600;
    }

    .tb-panel-minimize-btn {
      background: transparent;
      border: none;
      color: var(--tb-text-muted);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1;
    }

    .tb-panel-minimize-btn:hover {
      color: var(--tb-text);
      background: var(--tb-border);
    }

    .tb-panel-progress-bar {
      height: 4px;
      background: var(--tb-border);
      flex-shrink: 0;
    }

    .tb-panel-progress-fill {
      height: 100%;
      background: var(--tb-primary);
      transition: width 300ms ease;
    }

    .tb-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
      min-height: 0;
    }

    .tb-panel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .tb-panel-item:last-child {
      border-bottom: none;
    }

    .tb-panel-item-name {
      flex: 1;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tb-panel-item-status {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .tb-panel-item-status--queued {
      background: rgba(245, 158, 11, 0.15);
      color: var(--tb-warning);
    }

    .tb-panel-item-status--blocking {
      background: rgba(220, 38, 38, 0.15);
      color: var(--tb-danger);
    }

    .tb-panel-item-status--blocked {
      background: rgba(22, 163, 74, 0.15);
      color: var(--tb-success);
    }

    .tb-panel-item-status--unblocking {
      background: rgba(100, 116, 139, 0.15);
      color: #94A3B8;
    }

    .tb-panel-item-status--failed {
      background: rgba(220, 38, 38, 0.15);
      color: var(--tb-danger);
    }

    .tb-panel-item-action {
      background: transparent;
      border: none;
      color: var(--tb-text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tb-panel-item-action:hover {
      color: var(--tb-text);
      background: var(--tb-border);
    }

    .tb-panel-item-action svg {
      width: 14px;
      height: 14px;
    }

    .tb-panel-pause-btn {
      width: 100%;
      padding: 8px;
      background: var(--tb-bg-hover);
      border: none;
      border-top: 1px solid var(--tb-border);
      color: var(--tb-text-muted);
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .tb-panel-pause-btn:hover {
      background: var(--tb-border);
      color: var(--tb-text);
    }

    .tb-panel-pause-btn svg {
      width: 14px;
      height: 14px;
    }

    .tb-panel-footer {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-top: 1px solid var(--tb-border);
      flex-shrink: 0;
    }

    .tb-panel-action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 8px;
      background: var(--tb-bg-hover);
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-sm);
      color: var(--tb-text-muted);
      font-size: 11px;
      cursor: pointer;
      transition: all var(--tb-transition);
    }

    .tb-panel-action-btn:hover {
      background: var(--tb-border);
      color: var(--tb-text);
    }

    .tb-panel-action-btn svg {
      width: 12px;
      height: 12px;
    }

    .tb-panel-action-btn--danger:hover {
      background: rgba(220, 38, 38, 0.2);
      border-color: var(--tb-danger);
      color: var(--tb-danger);
    }

    .tb-panel-cooldown-area {
      padding: 8px 12px;
      background: rgba(245, 158, 11, 0.1);
      border-top: 1px solid var(--tb-border);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .tb-panel-cooldown-area:empty {
      display: none;
    }

    .tb-panel-cooldown-btn {
      flex: 1;
      font-size: 12px;
      color: var(--tb-warning);
    }

    .tb-panel-cooldown-time {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .tb-panel-cooldown-retry-btn {
      background: var(--tb-warning);
      color: #000;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .tb-panel-cooldown-retry-btn:hover {
      background: #D97706;
    }

    /* Minimized state */
    .tb-panel.tb-panel-minimized {
      width: 48px;
      height: 48px;
      max-height: 48px;
      border-radius: 50%;
      cursor: pointer;
    }

    .tb-panel.tb-panel-minimized .tb-panel-header,
    .tb-panel.tb-panel-minimized .tb-panel-progress-bar,
    .tb-panel.tb-panel-minimized .tb-panel-body,
    .tb-panel.tb-panel-minimized .tb-panel-pause-btn,
    .tb-panel.tb-panel-minimized .tb-panel-footer,
    .tb-panel.tb-panel-minimized .tb-panel-cooldown-area {
      display: none;
    }

    .tb-panel-badge {
      display: none;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      background: var(--tb-primary);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      border: none;
      border-radius: 50%;
      cursor: pointer;
    }

    .tb-panel.tb-panel-minimized .tb-panel-badge {
      display: flex;
    }

    /* ============================================================
       Overlay — full-screen click interceptor for block mode
       ============================================================ */
    .tb-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483646;
      cursor: crosshair;
      pointer-events: auto;
      /* Transparent - user sees page underneath */
      background: transparent;
    }

    .tb-overlay-hidden {
      display: none;
    }
  `;
}
