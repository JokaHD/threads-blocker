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
    for (const link of links) {
      const username = this.extractUsername(link.getAttribute('href'));
      if (!username) continue;
      const container = this._findCommentContainer(link);
      if (!container) continue;
      if (container.hasAttribute(PROCESSED_ATTR)) continue;
      comments.push({ username, element: container, linkElement: link });
    }
    return comments;
  }

  _findCommentContainer(linkElement) {
    let el = linkElement.parentElement;
    let depth = 0;
    while (el && depth < 8) {
      if (el.children.length >= 2) return el;
      el = el.parentElement;
      depth++;
    }
    return linkElement.parentElement;
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
