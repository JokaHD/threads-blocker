import { DOMObserver } from './dom-observer.js';
import { IDResolver } from './id-resolver.js';
import { TokenProvider } from './token-provider.js';
import { APIExecutor } from './api-executor.js';
import { SelectionManager } from './selection-manager.js';
import { InlineControls } from './ui/inline-controls.js';
import { Toolbar } from './ui/toolbar.js';
import { Panel } from './ui/panel.js';
import { MessageType } from '../shared/messages.js';

// Initialize modules
const domObserver = new DOMObserver();
const idResolver = new IDResolver();
const tokenProvider = new TokenProvider();
const selectionManager = new SelectionManager();
const inlineControls = new InlineControls(selectionManager, idResolver);
const toolbar = new Toolbar(selectionManager, idResolver);
const panel = new Panel();

// Placeholder API functions — to be filled during API reverse-engineering
async function blockUser(userId, token) {
  throw new Error('API not yet implemented — reverse engineer from DevTools');
}
async function unblockUser(userId, token) {
  throw new Error('API not yet implemented — reverse engineer from DevTools');
}

const apiExecutor = new APIExecutor(tokenProvider, { blockUser, unblockUser });

// Register with Service Worker
chrome.runtime.sendMessage({ type: MessageType.REGISTER_EXECUTOR });

// Listen for queue updates via storage.onChanged
let activeTaskCount = 0;
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
  activeTaskCount = (status.queued || 0) + (status.blocking || 0) + (status.unblocking || 0);
});

// Process existing comments
function processExistingComments() {
  const comments = domObserver.findComments(document.body);
  for (const comment of comments) {
    inlineControls.inject(comment);
    selectionManager.recordSeen(comment.username);
  }
}

// Watch for new comments
domObserver.startObserving(document.body, (newComments) => {
  for (const comment of newComments) {
    inlineControls.inject(comment);
    selectionManager.recordSeen(comment.username);
  }
});

// Initialize UI
toolbar.init();
panel.init();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processExistingComments);
} else {
  processExistingComments();
}

// Fetch initial states
(async () => {
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
})();

// beforeunload warning
window.addEventListener('beforeunload', (e) => {
  if (activeTaskCount > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
