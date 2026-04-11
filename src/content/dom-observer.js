const PROCESSED_ATTR = 'data-tb-processed';
const USERNAME_PATTERN = /^\/@([a-zA-Z0-9_.]+)$/;

export class DOMObserver {
  constructor() {
    this._observer = null;
    this._onNewComments = null;
  }

  extractUsername(href) {
    const match = href.match(USERNAME_PATTERN);
    return match ? match[1] : null;
  }

  findComments(root) {
    const links = root.querySelectorAll('a[href^="/@"]');
    const comments = [];
    const seenContainers = new Set();

    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this.extractUsername(href);
      if (!username) continue;

      // Skip avatar links (small square images) — we want text username links
      // Avatar links are typically 60x60 or similar square, text links are wider
      const rect = link.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && Math.abs(rect.width - rect.height) < 5 && rect.width < 80) {
        continue; // Square-ish and small = avatar
      }

      const container = this._findCommentContainer(link);
      if (!container) continue;
      if (container.hasAttribute(PROCESSED_ATTR)) continue;
      if (seenContainers.has(container)) continue;
      seenContainers.add(container);

      comments.push({ username, element: container, linkElement: link });
    }
    return comments;
  }

  _findCommentContainer(linkElement) {
    // Walk up looking for a container that is roughly the width of a comment
    // On Threads, comments are ~500-700px wide
    let el = linkElement.parentElement;
    let depth = 0;
    while (el && depth < 15) {
      if (el === document.body) break;
      const w = el.offsetWidth;
      const children = el.children.length;
      // A comment container is typically 400-800px wide with multiple children
      if (w >= 400 && w <= 900 && children >= 2) {
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    // Fallback: just go up a few levels
    el = linkElement.parentElement;
    for (let i = 0; i < 5; i++) {
      if (el.parentElement && el.parentElement !== document.body) {
        el = el.parentElement;
      }
    }
    return el;
  }

  startObserving(targetNode, onNewComments) {
    this._onNewComments = onNewComments;
    this._observer = new MutationObserver((mutations) => {
      const newComments = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const comments = this.findComments(node);
          newComments.push(...comments);
        }
      }
      if (newComments.length > 0 && this._onNewComments) {
        this._onNewComments(newComments);
      }
    });
    this._observer.observe(targetNode, { childList: true, subtree: true });
  }

  stopObserving() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  static markProcessed(element) {
    element.setAttribute(PROCESSED_ATTR, 'true');
  }
}
