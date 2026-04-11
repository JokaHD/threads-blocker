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
   * Find comments in the DOM. For each unique username, takes the first
   * /@username link found (typically the avatar) and walks up to find
   * the comment container.
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
      seenUsernames.add(username);

      const container = this._findCommentContainer(link);
      if (!container) continue;
      if (container.hasAttribute(PROCESSED_ATTR)) continue;

      // The first link per username is typically the avatar.
      // Try to find a second text link for the same username.
      let textLink = null;
      const siblingLinks = container.querySelectorAll(`a[href="/@${username}"]`);
      for (const sl of siblingLinks) {
        if (sl !== link) { textLink = sl; break; }
      }

      results.push({
        username,
        element: container,
        avatarLink: link,     // first link = avatar
        textLink,             // second link = username text (may be null)
      });
    }
    return results;
  }

  _findCommentContainer(linkElement) {
    let el = linkElement.parentElement;
    let depth = 0;
    while (el && depth < 15) {
      if (el === document.body) break;
      const children = el.children.length;
      // A comment container typically has multiple children (avatar col + content col)
      if (children >= 3) {
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    // Fallback: go up 5 levels
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
