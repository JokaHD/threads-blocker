/**
 * Debug utilities for Thread Blocker.
 * Provides observability into injection state.
 */

import { getSiteRule } from './site-adapter.js';
import { shadowHostExists } from './ui/shadow-host.js';

/**
 * Get current debug state as JSON.
 * Can be called from console via window.__TB_DEBUG__()
 */
export function getDebugState() {
  const siteRule = getSiteRule();

  // Count username links
  const allLinks = document.querySelectorAll('a[href^="/@"]');
  const usernamePattern = /^\/@([a-zA-Z0-9_.]+)$/;
  let avatarLinks = 0;
  let textLinks = 0;

  allLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!usernamePattern.test(href)) return;
    const rect = link.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 40) {
      avatarLinks++;
    } else {
      textLinks++;
    }
  });

  // Count marked comments
  const markedComments = document.querySelectorAll('[data-tb-comment-id]');
  const selectedComments = document.querySelectorAll('[data-tb-comment-id].tb-selected');

  // Check shadow host
  const shadowHost = document.getElementById('tb-shadow-host');
  const shadowRoot = shadowHost?.shadowRoot;

  // Check UI elements in shadow
  const fab = shadowRoot?.querySelector('.tb-fab');
  const toolbar = shadowRoot?.querySelector('.tb-toolbar');
  const panel = shadowRoot?.querySelector('.tb-panel');

  return {
    timestamp: new Date().toISOString(),
    url: location.href,
    siteRule: siteRule?.id || null,
    theme: siteRule?.getTheme() || null,

    // Links found
    links: {
      total: allLinks.length,
      avatar: avatarLinks,
      text: textLinks,
    },

    // Comments
    comments: {
      marked: markedComments.length,
      selected: selectedComments.length,
    },

    // Shadow DOM
    shadowHost: {
      exists: shadowHostExists(),
      hasRoot: !!shadowRoot,
    },

    // UI elements
    ui: {
      fab: !!fab,
      fabActive: fab?.classList.contains('tb-fab-active') || false,
      toolbar: !!toolbar,
      toolbarVisible: toolbar?.classList.contains('tb-toolbar-visible') || false,
      panel: !!panel,
      panelMinimized: panel?.classList.contains('tb-panel-minimized') || false,
    },

    // Block mode
    blockMode: document.body.classList.contains('tb-blockmode'),

    // Sample comments (first 3)
    commentSamples: Array.from(markedComments).slice(0, 3).map(el => ({
      username: el.getAttribute('data-tb-comment-id'),
      selected: el.classList.contains('tb-selected'),
      rect: (() => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      })(),
    })),
  };
}

/**
 * Log debug state to console.
 */
export function logDebugState() {
  const state = getDebugState();
  console.log('=== THREAD BLOCKER DEBUG STATE ===');
  console.log(JSON.stringify(state, null, 2));
  console.log('=== END DEBUG STATE ===');
  return state;
}

/**
 * Install global debug function.
 * Note: Cannot inject into page context due to CSP, so this only works
 * from the extension's console context.
 */
export function installDebugGlobal() {
  // Store reference for internal use (content script context only)
  window.__TB_DEBUG__ = logDebugState;
  console.log('[ThreadBlocker] Debug available in extension context');
}
