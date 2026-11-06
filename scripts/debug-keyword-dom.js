/* eslint-disable no-undef -- copy() is a DevTools console helper */
/**
 * Debug probe: keyword highlight — post body text boundaries, permalinks,
 * colors and Threads' own theme signal.
 *
 * Usage: load the extension (dist/) in your normal, logged-in Chrome profile,
 * open threads.com, scroll a little so posts get marked, then paste this
 * whole file into the DevTools console (top frame). Run it on the home feed
 * and on a post page that has replies and, if possible, a quote post. The
 * JSON report is printed and copied to the clipboard.
 *
 * Privacy: usernames are replaced with <author>/<other>; text is cut to 30
 * characters.
 */
(() => {
  const ATTR = 'data-tb-comment-id';
  const MAX_POSTS = 5;
  const MAX_NESTED = 2;
  const MAX_NODES = 40;
  const USER_IN_HREF = /^\/@([^/?#]+)/;

  const clip = (s, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const redactHref = (href, author) =>
    href?.replace(USER_IN_HREF, (_, user) => (user === author ? '/@<author>' : '/@<other>')) ??
    null;

  const step = (el) =>
    el.tagName.toLowerCase() +
    (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '') +
    (el.hasAttribute('dir') ? `[dir=${el.getAttribute('dir')}]` : '') +
    (el.hasAttribute('data-pressable-container') ? '[pressable]' : '') +
    (el.hasAttribute(ATTR) ? '[marked]' : '');

  const pathTo = (node, container) => {
    const parts = [];
    for (let el = node.parentElement; el && el !== container; el = el.parentElement) {
      parts.unshift(step(el));
    }
    return parts.join(' > ');
  };

  const opaqueBg = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg)) {
        return { bg, at: step(node) };
      }
    }
    return null;
  };

  const textNodes = (container, author) => {
    const out = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && out.length < MAX_NODES; node = walker.nextNode()) {
      const text = node.data.trim();
      if (!text) continue;
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      out.push({
        text: clip(text.replaceAll(author, '<author>')),
        path: pathTo(node, container),
        inLink: redactHref(parent.closest('a')?.getAttribute('href'), author),
        inTime: !!parent.closest('time'),
        inButton: !!parent.closest('button, [role="button"]'),
        nestedPost: parent.closest(`[${ATTR}]`) !== container,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      });
    }
    return out;
  };

  const describePost = (container) => {
    const author = container.getAttribute(ATTR);
    return {
      tag: step(container),
      permalinks: [...container.querySelectorAll('a[href*="/post/"]')].map((a) => ({
        href: redactHref(a.getAttribute('href'), author),
        ownedByThisPost: a.closest(`[${ATTR}]`) === container,
        hasTime: !!a.querySelector('time'),
        text: clip((a.textContent || '').trim()),
      })),
      nestedMarked: container.querySelectorAll(`[${ATTR}]`).length,
      seeMoreCandidates: [...container.querySelectorAll('[role="button"], span, div')]
        .filter((el) => /^(更多|顯示更多|See more|more)$/i.test((el.textContent || '').trim()))
        .slice(0, 3)
        .map((el) => ({ el: step(el), text: el.textContent.trim() })),
      background: opaqueBg(container),
      textNodes: textNodes(container, author),
    };
  };

  const all = [...document.querySelectorAll(`[${ATTR}]`)];
  // After SPA navigation Threads keeps the previous route's posts in the DOM,
  // hidden; only rendered posts describe the current page
  const isRendered = (el) => el.getClientRects().length > 0;
  const marked = all.filter(isRendered);
  const topLevel = marked.filter((el) => !el.parentElement?.closest(`[${ATTR}]`));
  const nested = marked.filter((el) => el.parentElement?.closest(`[${ATTR}]`));
  const bodyLink = document.querySelector(
    `[${ATTR}] a[href^="/search"], [${ATTR}] a[href^="http"]`
  );

  const root = document.documentElement;
  const report = {
    at: new Date().toISOString(),
    path: location.pathname.replace(/@[^/]+/g, '@<user>'),
    markedCount: marked.length,
    hiddenMarkedCount: all.length - marked.length,
    theme: {
      htmlBg: getComputedStyle(root).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlClass: root.className,
      htmlAttrs: [...root.attributes].map((a) => `${a.name}=${clip(a.value, 40)}`),
      bodyClass: clip(document.body.className, 80),
      colorScheme: getComputedStyle(root).colorScheme,
      metaColorScheme: document.querySelector('meta[name="color-scheme"]')?.content ?? null,
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
      osPrefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      firstPostBackground: topLevel[0] ? opaqueBg(topLevel[0]) : null,
    },
    linkSample: bodyLink
      ? {
          color: getComputedStyle(bodyLink).color,
          href: bodyLink.getAttribute('href').slice(0, 20),
        }
      : null,
    posts: topLevel.slice(0, MAX_POSTS).map(describePost),
    nestedPosts: nested.slice(0, MAX_NESTED).map(describePost),
  };

  const json = JSON.stringify(report, null, 2);
  console.log(json);
  try {
    copy(json);
    console.log('[TB debug] Report copied to clipboard');
  } catch {
    console.log('[TB debug] copy() unavailable — select the JSON above manually');
  }
})();
