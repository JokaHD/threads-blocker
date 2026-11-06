/* eslint-disable no-undef -- copy() is a DevTools console helper */
/**
 * Debug probe: right rail detection, oversized marked containers and the
 * "作者" badge next to a reply author.
 *
 * Usage: load the extension (dist/) in your logged-in Chrome, open a Threads
 * post page that has replies by the post author, wait for the right rail
 * (recommendations) to show, enter block mode once, then paste this whole
 * file into the DevTools console (top frame). The JSON report is printed and
 * copied to the clipboard.
 *
 * Privacy: usernames are replaced with <user>; text is cut to 30 characters.
 */
(() => {
  const ATTR = 'data-tb-comment-id';
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const clip = (s, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const redact = (s) => s?.replace(/\/@[^/?#]+/g, '/@<user>') ?? null;

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const step = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
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

  // Same checks as threadsSiteRule._isRightRailShaped, reported one by one
  const railShape = (el) => {
    const r = el.getBoundingClientRect();
    const position = getComputedStyle(el).position;
    return {
      rect: rectOf(el),
      position,
      widthOk: r.width >= 200 && r.width <= 480,
      heightOk: r.height >= vh * 0.5,
      rightOk: r.left >= vw * 0.55,
      positionOk: position === 'sticky' || position === 'fixed',
    };
  };

  const marked = [...document.querySelectorAll(`[${ATTR}]`)].filter(
    (el) => el.getClientRects().length > 0
  );

  const describeMarked = (el) => ({
    el: step(el),
    rect: rectOf(el),
    nestedMarked: el.querySelectorAll(`[${ATTR}]`).length,
    authorLinkHref: redact(el.querySelector('a[href^="/@"]')?.getAttribute('href')),
    firstText: clip((el.querySelector('span[dir="auto"]')?.textContent || '').trim()),
    hasTime: !!el.querySelector('time'),
    ancestorDepthToBody: (() => {
      let d = 0;
      for (let p = el; p && p !== document.body; p = p.parentElement) d++;
      return d;
    })(),
  });

  // Right-edge hit test chain (the rail's third detection candidate)
  const hit = document.elementsFromPoint(vw - 40, vh / 2)[0] ?? null;
  const hitChain = [];
  for (let el = hit; el && el !== document.body && hitChain.length < 30; el = el.parentElement) {
    hitChain.push({ el: step(el), ...railShape(el) });
  }

  const layout = document.getElementById('barcelona-page-layout');

  // "作者" badge (author replying in the thread)
  const authorBadges = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && authorBadges.length < 5; n = walker.nextNode()) {
    if (n.data.trim() !== '作者') continue;
    const container = n.parentElement.closest(`[${ATTR}]`);
    const parent = n.parentElement;
    const style = getComputedStyle(parent);
    const span = parent.closest('span[dir="auto"]');
    authorBadges.push({
      inMarked: !!container,
      path: container ? pathTo(n, container) : pathTo(n, document.body),
      parentAttrs: [...parent.attributes]
        .filter((a) => a.name !== 'class')
        .map((a) => `${a.name}=${clip(a.value, 40)}`),
      nearestDirAutoInLink: !!span?.closest('a'),
      divBetweenDirAutoAndText: (() => {
        if (!span) return null;
        for (let el = parent; el !== span; el = el.parentElement)
          if (el.tagName === 'DIV') return true;
        return false;
      })(),
      previousText: clip(
        (n.parentElement.closest('div')?.previousElementSibling?.textContent || '').trim()
      ),
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      bg: style.backgroundColor,
    });
  }

  const report = {
    at: new Date().toISOString(),
    path: location.pathname.replace(/@[^/]+/g, '@<user>'),
    viewport: { vw, vh },
    landmarks: [...document.querySelectorAll('aside, [role="complementary"]')].map((el) => ({
      el: step(el),
      ...railShape(el),
    })),
    layout: layout
      ? {
          rect: rectOf(layout),
          children: [...layout.children].map((c) => ({ el: step(c), ...railShape(c) })),
        }
      : null,
    rightEdgeHitChain: hitChain,
    markedCount: marked.length,
    // Containers that wrap other marked posts, biggest first
    outerMarked: marked
      .filter((el) => el.querySelector(`[${ATTR}]`))
      .sort(
        (a, b) => b.querySelectorAll(`[${ATTR}]`).length - a.querySelectorAll(`[${ATTR}]`).length
      )
      .slice(0, 5)
      .map(describeMarked),
    // Marked containers sitting in the right part of the viewport
    rightSideMarked: marked
      .filter((el) => el.getBoundingClientRect().left >= vw * 0.55)
      .slice(0, 5)
      .map(describeMarked),
    authorBadges,
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
