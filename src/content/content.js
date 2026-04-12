/**
 * Thread Blocker - Content Script Entry Point
 *
 * Architecture:
 * - Shadow DOM host contains all extension UI (FAB, toolbar, panel)
 * - DOM observer detects comments using site adapter
 * - Block mode applies highlight classes to page DOM
 * - Communication with service worker via chrome.runtime.sendMessage
 */

import { DOMObserver } from './dom-observer.js';
import { IDResolver } from './id-resolver.js';
import { TokenProvider } from './token-provider.js';
import { APIExecutor } from './api-executor.js';
import { SelectionManager } from './selection-manager.js';
import { getShadowRoot } from './ui/shadow-host.js';
import { InlineControls } from './ui/inline-controls.js';
import { Toolbar } from './ui/toolbar.js';
import { Panel } from './ui/panel.js';
import { MessageType } from '../shared/messages.js';
import { installDebugGlobal } from './debug.js';
import { blockUser, unblockUser } from './threads-api.js';

console.log('[ThreadBlocker] Content script loaded on', window.location.href);

// Initialize Shadow DOM first
getShadowRoot();

// Initialize modules
const domObserver = new DOMObserver();
domObserver.init();

const idResolver = new IDResolver();
const tokenProvider = new TokenProvider();
const selectionManager = new SelectionManager();
const inlineControls = new InlineControls(selectionManager, idResolver);
const toolbar = new Toolbar(selectionManager, idResolver);
const panel = new Panel();

// Wrap API functions to use tokenProvider
async function blockUserWithTokens(userId) {
  const tokens = await tokenProvider.getTokens();
  return blockUser(userId, tokens);
}

async function unblockUserWithTokens(userId) {
  const tokens = await tokenProvider.getTokens();
  return unblockUser(userId, tokens);
}

const apiExecutor = new APIExecutor(tokenProvider, {
  blockUser: blockUserWithTokens,
  unblockUser: unblockUserWithTokens,
});

// Register with Service Worker
chrome.runtime.sendMessage({ type: MessageType.REGISTER_EXECUTOR });

// Listen for queue updates via storage.onChanged
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.queueNotify) return;
  const { items, status } = changes.queueNotify.newValue || {};
  if (!items) return;

  for (const item of items) {
    inlineControls.updateState(item.username, item.state);
  }
  panel.update(items, status);

  if (status.queued > 0 || status.unblocking > 0) {
    apiExecutor.startPolling();
  }
  if (status.paused && status.cooldownEnd) {
    panel.setCooldownEnd(status.cooldownEnd);
  }
});

// Process discovered comments
function processComment(comment) {
  domObserver.markProcessed(comment.container, comment.username);
  inlineControls.inject(comment);
  selectionManager.recordSeen(comment.username);
}

function processExistingComments() {
  const comments = domObserver.findComments(document.body);
  console.log('[ThreadBlocker] Found', comments.length, 'comments on page');
  for (const comment of comments) {
    processComment(comment);
  }
}

// Start DOM observation
domObserver.startObserving((newComments) => {
  console.log('[ThreadBlocker] MutationObserver found', newComments.length, 'new comments');
  for (const comment of newComments) {
    processComment(comment);
  }
});

// Initialize UI (all in Shadow DOM)
inlineControls.init();
toolbar.init();
panel.init();

// Install debug global
installDebugGlobal();

// Process existing comments after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processExistingComments);
} else {
  processExistingComments();
}

// Fetch initial states from service worker
(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: MessageType.GET_ALL_STATES });
    if (response?.items) {
      for (const item of response.items) {
        inlineControls.updateState(item.username, item.state);
      }
    }
    const statusResponse = await chrome.runtime.sendMessage({ type: MessageType.GET_QUEUE_STATUS });
    if (statusResponse?.status) {
      panel.update(response?.items || [], statusResponse.status);
    }
  } catch (e) {
    console.warn('[ThreadBlocker] Failed to fetch initial states:', e);
  }
})();

// TODO: beforeunload warning disabled - needs fix
// window.addEventListener('beforeunload', (e) => {
//   if (activeTaskCount > 0) {
//     e.preventDefault();
//     e.returnValue = '';
//   }
// });
