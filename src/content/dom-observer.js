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
    // Find all links that are exactly /@username (not /@user/post/xxx)
    const links = root.querySelectorAll('a[href^="/@"]');
    const comments = [];
    const seenContainers = new Set();

    for (const link of links) {
      const href = link.getAttribute('href');
      const username = this.extractUsername(href);
      if (!username) continue;

      // Heuristic: the commenter's profile link is typically the FIRST
      // /@username link in a comment block, and it usually contains just
      // the username text or is near the top of the comment.
      // Skip @mentions inside comment text — these are usually inside
      // a <span dir="auto"> text block deeper in the DOM.
      const container = this._findCommentContainer(link);
      if (!container) continue;
      if (container.hasAttribute(PROCESSED_ATTR)) continue;

      // Only take the first /@username link per container
      const containerId = this._getContainerId(container);
      if (seenContainers.has(containerId)) continue;
      seenContainers.add(containerId);

      comments.push({ username, element: container, linkElement: link });
    }
    return comments;
  }

  _findCommentContainer(linkElement) {
    // Walk up looking for a block-level container with multiple children
    let el = linkElement.parentElement;
    let depth = 0;
    while (el && depth < 10) {
      // Look for a container that has at least 2 child elements
      // and is reasonably sized (not the whole page)
      if (el.children.length >= 2 && el !== document.body) {
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    return linkElement.parentElement;
  }

  _getContainerId(element) {
    // Generate a unique-ish ID for deduplication
    if (element.id) return element.id;
    // Use the element reference itself (works within a single scan)
    return element;
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
