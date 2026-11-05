/**
 * Shadow DOM host for Thread Blocker UI.
 * All extension UI lives inside this shadow root to prevent CSS pollution.
 */

const SHADOW_HOST_ID = 'tb-shadow-host';

let shadowRoot = null;

/**
 * Get or create the shadow host and return its shadow root.
 * The shadow root contains all extension UI (FAB, block mode card, panel).
 */
export function getShadowRoot() {
  if (shadowRoot) return shadowRoot;

  // If an orphan host from a previous CS load is present, drop it before
  // recreating — with `mode: 'closed'` we cannot recover the old shadow root
  // via `.shadowRoot`, so replacement is the correct recovery.
  const existing = document.getElementById(SHADOW_HOST_ID);
  if (existing) existing.remove();

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

  // Attach shadow root. `mode: 'closed'` prevents page JS on threads.com from
  // reaching into our UI via `document.getElementById('tb-shadow-host').shadowRoot`.
  shadowRoot = host.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getExtensionStyles();
  shadowRoot.appendChild(style);

  // Create UI containers
  const uiContainer = document.createElement('div');
  uiContainer.className = 'tb-ui-container';
  shadowRoot.appendChild(uiContainer);

  // Create stack container for FAB/Card/Panel
  const stackContainer = document.createElement('div');
  stackContainer.className = 'tb-stack';
  uiContainer.appendChild(stackContainer);

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
 * Get the stack container (flex column) for FAB, Card, and Panel.
 */
export function getStackContainer() {
  const root = getShadowRoot();
  return root.querySelector('.tb-stack');
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
      /* Block action: the danger red desaturated (hsl 0 45% 50%), so the
         primary button doesn't shout; white text stays >= 4.5:1 */
      --tb-block-action: #B94646;
      --tb-block-action-hover: #9F3C3C;
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
      --tb-switch-on: #5a6478;
      /* Keyword manager overlay */
      --tb-input-bg: rgba(255, 255, 255, 0.04);
      --tb-neutral-action: #2f3a57;
      --tb-neutral-action-text: #eef1f8;
      --tb-warn-text: #d9b37a;
      --tb-danger-text: #e3a0a0;
      --tb-danger-line: #5a3434;
      /* Same amber as ::highlight(tb-keyword) in content.css */
      --tb-kw-mark: rgba(230, 170, 40, 0.38);
    }

    /* Light theme */
    @media (prefers-color-scheme: light) {
      .tb-ui-container {
        --tb-bg: rgba(255, 255, 255, 0.95);
        --tb-bg-hover: rgba(245, 245, 245, 0.95);
        --tb-border: #e0e0e0;
        --tb-text: #333;
        --tb-text-muted: #666;
        --tb-input-bg: #fff;
        --tb-warn-text: #9a6a1c;
        --tb-danger-text: #a33a3a;
        --tb-danger-line: #e6bcbc;
        --tb-kw-mark: rgba(245, 190, 50, 0.5);
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
       Stack — flex column container for Panel + Card/FAB
       ============================================================ */
    .tb-stack {
      position: fixed;
      bottom: 112px;
      /* Set by StackPlacement to clear the right context rail */
      right: var(--tb-stack-right, 24px);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      width: var(--tb-stack-width, 280px);
      pointer-events: none;
    }

    .tb-stack > * {
      pointer-events: auto;
    }

    /* ============================================================
       FAB — Floating Action Button (entry point)
       ============================================================ */
    /* Compact launcher: 68x58 (not square on purpose; was 56x48, too small
       for the label and progress badge), must match
       StackLayout.COLLAPSED_WIDTH in stack-placement.js */
    .tb-fab {
      position: relative;
      align-self: flex-end;
      box-sizing: border-box;
      width: 68px;
      height: 58px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 0;
      border: 1px solid var(--tb-border);
      border-radius: 16px;
      background: var(--tb-bg);
      color: var(--tb-text);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      transition: all 200ms ease;
    }

    .tb-fab svg {
      width: 22px;
      height: 22px;
    }

    .tb-fab-label {
      line-height: 1;
    }

    /* Queue progress on the launcher (done/total) */
    .tb-fab-badge {
      position: absolute;
      top: -10px;
      right: -10px;
      min-width: 22px;
      padding: 2px 6px;
      border-radius: 11px;
      background: var(--tb-primary);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      line-height: 18px;
      font-variant-numeric: tabular-nums;
      text-align: center;
      box-shadow: 0 0 0 2px var(--tb-bg);
    }

    .tb-fab-badge[hidden] {
      display: none;
    }

    .tb-fab-badge--paused {
      background: var(--tb-warning);
      color: #000;
    }

    .tb-fab-badge--failed {
      background: var(--tb-danger);
    }

    .tb-fab:hover {
      background: var(--tb-bg-hover);
      transform: scale(1.03);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    }

    .tb-fab:active {
      transform: scale(0.97);
    }

    .tb-fab.tb-fab-hidden {
      display: none;
    }

    .tb-fab.tb-fab-route-hidden {
      display: none;
    }

    /* ============================================================
       Card — Block Mode Control Card
       ============================================================ */
    .tb-card {
      display: none;
      background: var(--tb-bg);
      border: 1px solid var(--tb-border);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      padding: 20px;
    }

    .tb-card.tb-card-visible {
      display: block;
    }

    .tb-card.tb-card-route-hidden {
      display: none;
    }

    /* Count Area - Big Number */
    .tb-card-count-area {
      text-align: center;
      margin-bottom: 16px;
    }

    .tb-card-count-num {
      display: block;
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
      color: var(--tb-text);
      font-variant-numeric: tabular-nums;
    }

    .tb-card-count-label {
      display: block;
      font-size: 14px;
      color: var(--tb-text-muted);
      margin-top: 4px;
    }

    /* Actions (shown when count > 0) */
    .tb-card-actions {
      display: none;
      flex-direction: column;
      gap: 12px;
    }

    .tb-card-actions.tb-card-actions-visible {
      display: flex;
    }

    .tb-card-block-btn {
      width: 100%;
      padding: 14px 20px;
      background: var(--tb-block-action);
      color: #fff;
      border: none;
      border-radius: var(--tb-radius-sm);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--tb-transition);
    }

    .tb-card-block-btn:hover {
      background: var(--tb-block-action-hover);
    }

    .tb-card-block-btn:active {
      transform: scale(0.97);
    }

    .tb-card-links {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }

    .tb-card-link {
      flex: 1;
      background: none;
      border: none;
      color: var(--tb-text-muted);
      font-size: 14px;
      cursor: pointer;
      padding: 8px;
      transition: color var(--tb-transition);
    }

    .tb-card-link:hover {
      color: var(--tb-text);
    }

    .tb-card-link:last-child {
      text-align: right;
    }

    /* Exit Only (shown when count = 0) */
    .tb-card-exit-only {
      display: none;
      width: 100%;
      background: none;
      border: none;
      color: var(--tb-text-muted);
      font-size: 14px;
      cursor: pointer;
      padding: 8px;
      text-align: center;
      transition: color var(--tb-transition);
    }

    .tb-card-exit-only.tb-card-exit-only-visible {
      display: block;
    }

    .tb-card-exit-only:hover {
      color: var(--tb-text);
    }

    /* Keyword highlight row — after the block actions, above the queue */
    .tb-card-keywords {
      display: flex;
      align-items: center;
      margin: 16px -20px 0;
      padding: 6px 14px 6px 8px;
      border-top: 1px solid var(--tb-border);
      font-size: 13px;
      color: var(--tb-text);
    }

    /* Last row of the card when the queue section is hidden */
    .tb-card-keywords:has(+ .tb-card-queue:empty),
    .tb-card-keywords:has(+ .tb-card-queue > .tb-panel-hidden) {
      margin-bottom: -20px;
    }

    .tb-card-keywords + .tb-card-queue {
      margin-top: 0;
    }

    /* One pill across the row: [label ··· switch] | manage. The label keeps
       its place at the left edge (18px in from the card) and the controls
       stay at the right, as before the pill; the outline only groups them.
       The label lives inside the switch button, so the whole left segment
       toggles */
    .tb-kw-group {
      display: flex;
      flex: 1;
      align-items: stretch;
      border: 1px solid var(--tb-border);
      border-radius: 999px;
    }

    .tb-kw-switch {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 4px 10px 4px 9px;
      border: none;
      border-radius: 999px 0 0 999px;
      background: none;
      color: var(--tb-text);
      font: inherit;
      cursor: pointer;
    }

    .tb-card-keywords--off .tb-kw-label {
      color: var(--tb-text-muted);
    }

    .tb-kw-track {
      position: relative;
      flex: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--tb-switch-on);
      transition: background var(--tb-transition);
    }

    .tb-kw-track::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 18px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #e8e8e8;
      transition: left var(--tb-transition);
    }

    .tb-kw-switch[aria-checked='false'] .tb-kw-track {
      background: var(--tb-border);
    }

    .tb-kw-switch[aria-checked='false'] .tb-kw-track::after {
      left: 2px;
      background: var(--tb-text-muted);
    }

    .tb-kw-manage {
      display: flex;
      align-items: center;
      padding: 0 12px 0 10px;
      border: none;
      border-left: 1px solid var(--tb-border);
      border-radius: 0 999px 999px 0;
      background: none;
      color: var(--tb-text-muted);
      cursor: pointer;
      transition: color var(--tb-transition);
    }

    .tb-kw-switch:hover .tb-kw-label,
    .tb-kw-manage:hover {
      color: var(--tb-text);
    }

    .tb-kw-manage svg {
      width: 16px;
      height: 16px;
    }

    .tb-kw-switch:focus-visible,
    .tb-kw-manage:focus-visible {
      outline: 2px solid var(--tb-primary);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .tb-kw-track,
      .tb-kw-track::after {
        transition: none;
      }
    }

    /* ============================================================
       Keyword manager overlay — modal over the page (keyword-overlay.js)
       ============================================================ */
    .tb-kw-overlay {
      position: fixed;
      inset: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.5);
      pointer-events: auto;
    }

    /* Fixed frame sized by the window only, never by the keyword count;
       the manager scrolls inside, so ✕ stays in reach */
    .tb-kw-modal {
      position: relative;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 460px;
      height: 80vh;
      background: var(--tb-bg);
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-md);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      color: var(--tb-text);
      overflow: hidden;
    }

    .tb-kw-modal-close {
      position: absolute;
      top: 16px;
      right: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: var(--tb-radius-sm);
      background: none;
      color: var(--tb-text-muted);
      cursor: pointer;
      transition: color var(--tb-transition);
    }

    .tb-kw-modal-close:hover {
      color: var(--tb-text);
      background: var(--tb-bg-hover);
    }

    .tb-kw-modal-close svg {
      width: 16px;
      height: 16px;
    }

    .km {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      display: grid;
      align-content: start;
      gap: 14px;
      padding: 20px 20px 18px;
    }

    .km * {
      box-sizing: border-box;
    }

    .km-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      /* Room for the ✕ */
      padding-right: 36px;
    }

    .km-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .km-global {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--tb-text-muted);
      font-size: 13px;
    }

    .km-add {
      display: flex;
      gap: 8px;
    }

    .km-input {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-sm);
      background: var(--tb-input-bg);
      color: var(--tb-text);
      font: inherit;
    }

    .km-btn {
      padding: 8px 14px;
      border: none;
      border-radius: var(--tb-radius-sm);
      background: var(--tb-neutral-action);
      color: var(--tb-neutral-action-text);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .km-error {
      margin: -8px 0 0;
      color: var(--tb-warn-text);
      font-size: 12px;
    }

    .km-error[hidden],
    .km-empty[hidden] {
      display: none;
    }

    .km-table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }

    .km-table th {
      padding: 6px;
      border-bottom: 1px solid var(--tb-border);
      color: var(--tb-text-muted);
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      white-space: nowrap;
    }

    .km-table td {
      padding: 9px 6px;
      border-bottom: 1px solid var(--tb-border);
      white-space: nowrap;
    }

    .km-table .km-num {
      text-align: right;
    }

    .km-col-on {
      width: 40px;
    }

    .km-col-del {
      width: 64px;
    }

    /* Keyword previewed with the in-page highlight (amber background) */
    .km-kw {
      padding: 1px 2px;
      border-radius: 2px;
      background: var(--tb-kw-mark);
    }

    .km-row--off .km-kw {
      background: none;
      color: var(--tb-text-muted);
    }

    .km-switch {
      position: relative;
      flex: none;
      width: 28px;
      height: 16px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: var(--tb-switch-on);
      cursor: pointer;
    }

    .km-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 14px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #e8e8e8;
      transition: left var(--tb-transition);
    }

    .km-switch[aria-checked='false'] {
      background: var(--tb-border);
    }

    .km-switch[aria-checked='false']::after {
      left: 2px;
      background: var(--tb-text-muted);
    }

    /* Global switch: same size as the card's */
    .km-switch--lg {
      width: 36px;
      height: 20px;
      border-radius: 10px;
    }

    .km-switch--lg::after {
      left: 18px;
      width: 16px;
      height: 16px;
    }

    .km-del {
      padding: 1px 6px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: none;
      color: var(--tb-text-muted);
      font: inherit;
      cursor: pointer;
    }

    .km-del--confirm {
      border-color: var(--tb-danger-line);
      color: var(--tb-danger-text);
      font-size: 12px;
    }

    .km-empty,
    .km-foot {
      margin: 0;
      color: var(--tb-text-muted);
      font-size: 12px;
    }

    .km-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    .km button:focus-visible,
    .km-input:focus-visible,
    .tb-kw-modal-close:focus-visible {
      outline: 2px solid var(--tb-primary);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .km-switch::after {
        transition: none;
      }
    }

    /* ============================================================
       Panel — queue progress (bottom-right, above FAB)
       ============================================================ */
    /* Queue section at the bottom of the block mode card */
    .tb-card-queue {
      margin: 16px -20px -20px;
      border-top: 1px solid var(--tb-border);
    }

    .tb-card-queue:empty,
    .tb-card-queue:has(> .tb-panel-hidden) {
      display: none;
    }

    .tb-card-queue .tb-panel {
      border: none;
      border-radius: 0 0 16px 16px;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      max-height: min(320px, 45vh);
    }

    .tb-panel {
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

    .tb-panel-item-status--resolving {
      background: rgba(100, 116, 139, 0.15);
      color: #94A3B8;
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

    .tb-panel-retry-all-btn {
      color: var(--tb-warning);
      border-color: var(--tb-warning);
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
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      color: var(--tb-warning);
      cursor: help;
    }

    .tb-panel-cooldown-time {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .tb-panel-cooldown-info {
      display: inline-flex;
      margin-left: 4px;
      opacity: 0.8;
    }

    .tb-panel-cooldown-info svg {
      width: 12px;
      height: 12px;
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

    /* ============================================================
       Confirm Dialog — exit block mode confirmation
       ============================================================ */
    .tb-confirm-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      opacity: 0;
      visibility: hidden;
      transition: opacity 200ms ease, visibility 200ms ease;
    }

    .tb-confirm-backdrop.tb-confirm-visible {
      opacity: 1;
      visibility: visible;
    }

    .tb-confirm-dialog {
      background: var(--tb-bg);
      border: 1px solid var(--tb-border);
      border-radius: var(--tb-radius-md);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      padding: 20px;
      max-width: 320px;
      width: calc(100% - 32px);
      transform: scale(0.95);
      transition: transform 200ms ease;
    }

    .tb-confirm-backdrop.tb-confirm-visible .tb-confirm-dialog {
      transform: scale(1);
    }

    .tb-confirm-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--tb-text);
    }

    .tb-confirm-message {
      font-size: 14px;
      color: var(--tb-text-muted);
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .tb-confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .tb-confirm-btn {
      min-height: 44px;
      min-width: 80px;
      padding: 10px 20px;
      border-radius: var(--tb-radius-sm);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--tb-transition);
    }

    .tb-confirm-btn:active {
      transform: scale(0.97);
    }

    .tb-confirm-btn-cancel {
      background: transparent;
      color: var(--tb-text-muted);
      border: 1px solid var(--tb-border);
    }

    .tb-confirm-btn-cancel:hover {
      border-color: var(--tb-text);
      color: var(--tb-text);
    }

    .tb-confirm-btn-confirm {
      background: var(--tb-danger);
      color: #fff;
      border: none;
    }

    .tb-confirm-btn-confirm:hover {
      background: var(--tb-danger-hover);
    }
  `;
}
