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

  /**
   * Find comments in the DOM. Returns one entry per comment, with both
   * the avatar link and the text username link if found.
   */
  findComments(root) {
    const links = root.querySelectorAll('a[href^="/@"]');
    const results = [];
    const seenUsernames = new Set();

    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this.extractUsername(href);
      if (!username) continue;
      if (seenUsernames.has(username)) continue;

      const rect = link.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      // Classify: avatar (square-ish, ≤80px) vs text link (wider than tall)
      const isAvatar = rect.width <= 80 && Math.abs(rect.width - rect.height) < 15;

      if (isAvatar) {
        seenUsernames.add(username);
        const container = this._findCommentContainer(link);
        if (!container || container.hasAttribute(PROCESSED_ATTR)) continue;

        results.push({
          username,
          element: container,
          avatarLink: link,
          textLink: null, // may be filled later
        });
      }
    }

    // Second pass: find text links for already-found avatars
    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this.extractUsername(href);
      if (!username) continue;

      const rect = link.getBoundingClientRect();
      const isAvatar = rect.width <= 80 && Math.abs(rect.width - rect.height) < 15;
      if (isAvatar) continue;

      const entry = results.find(r => r.username === username && !r.textLink);
      if (entry) {
        entry.textLink = link;
      }
    }

    return results;
  }

  _findCommentContainer(linkElement) {
    let el = linkElement.parentElement;
    let depth = 0;
    while (el && depth < 15) {
      if (el === document.body) break;
      const w = el.offsetWidth;
      const children = el.children.length;
      if (w >= 400 && w <= 900 && children >= 2) {
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    // Fallback
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
