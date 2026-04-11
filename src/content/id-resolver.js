export class IDResolver {
  constructor() { this._cache = new Map(); }

  async resolve(username, commentElement) {
    if (this._cache.has(username)) return this._cache.get(username);

    const fiberId = this._fromReactFiber(commentElement);
    if (fiberId) { this._cache.set(username, fiberId); return fiberId; }

    const dataId = this._fromDataAttributes(commentElement);
    if (dataId) { this._cache.set(username, dataId); return dataId; }

    const linkId = this._fromProfileLink(commentElement, username);
    if (linkId) { this._cache.set(username, linkId); return linkId; }

    console.warn(`[ThreadBlocker] Could not resolve user_id for @${username}, using username`);
    return username;
  }

  _fromReactFiber(element) {
    const fiberKey = Object.keys(element).find(
      (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) return null;
    try {
      let fiber = element[fiberKey];
      let depth = 0;
      while (fiber && depth < 20) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props?.user?.pk) return String(props.user.pk);
        if (props?.user?.id) return String(props.user.id);
        if (props?.userId) return String(props.userId);
        if (props?.authorId) return String(props.authorId);
        fiber = fiber.return;
        depth++;
      }
    } catch { }
    return null;
  }

  _fromDataAttributes(element) {
    const attrs = ['data-user-id', 'data-author-id', 'data-pk'];
    for (const attr of attrs) {
      let el = element;
      let depth = 0;
      while (el && depth < 8) {
        const val = el.getAttribute(attr);
        if (val) return val;
        el = el.parentElement;
        depth++;
      }
    }
    return null;
  }

  _fromProfileLink(element, username) {
    const link = element.querySelector(`a[href="/@${username}"]`);
    if (!link) return null;
    const fiberKey = Object.keys(link).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) return null;
    try {
      let fiber = link[fiberKey];
      let depth = 0;
      while (fiber && depth < 10) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props?.id && /^\d+$/.test(String(props.id))) return String(props.id);
        if (props?.userId) return String(props.userId);
        fiber = fiber.return;
        depth++;
      }
    } catch { }
    return null;
  }

  clearCache() { this._cache.clear(); }
}
