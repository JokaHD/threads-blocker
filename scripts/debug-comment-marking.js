/* eslint-disable no-undef -- copy() is a DevTools console helper */
/**
 * Debug probe: same-user multi-comment marking + block-mode navigation guard.
 *
 * Usage: open a threads.com post where one user commented more than once,
 * enter Block Mode, scroll so those comments are loaded, then paste this
 * whole file into the DevTools console. The JSON report is printed and
 * copied to the clipboard.
 */
(() => {
  const ATTR = 'data-tb-comment-id';
  const USER_RE = /^\/@([a-zA-Z0-9_.]+)$/;
  const TRIGGER_SEL = 'a[href^="/@"], [data-pressable-container], [role="link"]';

  const summarize = (el) =>
    el && {
      tag: el.tagName.toLowerCase(),
      marked: el.getAttribute(ATTR),
      pressable: el.hasAttribute('data-pressable-container'),
      role: el.getAttribute('role'),
      text: (el.textContent || '').trim().slice(0, 60),
      rect: (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(
        el.getBoundingClientRect()
      ),
    };

  // 1. Every pressable container that contains a profile link, grouped by
  //    the first (author) username — the shape findContainer priority 1 hits.
  const pressables = [...document.querySelectorAll('[data-pressable-container]')]
    .filter((p) => !p.closest('nav, [role="navigation"]'))
    .map((p) => {
      const users = [...p.querySelectorAll('a[href^="/@"]')]
        .map((a) => a.getAttribute('href').match(USER_RE)?.[1])
        .filter(Boolean);
      return { el: p, author: users[0] || null, mentions: users.slice(1) };
    })
    .filter((p) => p.author);

  const byAuthor = {};
  for (const p of pressables) (byAuthor[p.author] ||= []).push(p);

  const multiCommentUsers = Object.entries(byAuthor)
    .filter(([, list]) => list.length > 1)
    .map(([user, list]) => ({
      user,
      comments: list.length,
      marked: list.filter((p) => p.el.hasAttribute(ATTR)).length,
      // Distinct containers? (false = findContainer collapses them into one)
      distinctMarkedContainers: new Set(list.map((p) => p.el.closest(`[${ATTR}]`)).filter(Boolean))
        .size,
      markedAs: [...new Set(list.map((p) => p.el.getAttribute(ATTR)))],
    }));

  // 2. Containers whose mark disagrees with their author link (mention hijack).
  const mismatches = pressables
    .filter((p) => p.el.hasAttribute(ATTR) && p.el.getAttribute(ATTR) !== p.author)
    .map((p) => ({ author: p.author, markedAs: p.el.getAttribute(ATTR), mentions: p.mentions }));

  // 3. Unmarked navigation triggers that the guard would swallow in block mode.
  const unmarkedTriggers = [...document.querySelectorAll(TRIGGER_SEL)].filter(
    (el) =>
      !el.closest(`[${ATTR}]`) &&
      !el.closest('nav, [role="navigation"]') &&
      !el.closest('[role="tablist"], [role="tab"]')
  );

  const report = {
    url: location.href,
    extensionLoaded: !!document.getElementById('tb-shadow-host'),
    blockMode: document.body.classList.contains('tb-blockmode'),
    counts: {
      markedContainers: document.querySelectorAll(`[${ATTR}]`).length,
      // Marked inside another marked comment (embedded quote / reply nesting)
      nestedMarkedContainers: [...document.querySelectorAll(`[${ATTR}] [${ATTR}]`)].map(
        (el) =>
          `${el.parentElement.closest(`[${ATTR}]`).getAttribute(ATTR)} > ${el.getAttribute(ATTR)}`
      ),
      authoredPressables: pressables.length,
      unmarkedAuthoredPressables: pressables.filter((p) => !p.el.closest(`[${ATTR}]`)).length,
      unmarkedNavigationTriggers: unmarkedTriggers.length,
    },
    multiCommentUsers,
    mentionMismatches: mismatches,
    unmarkedAuthoredSample: pressables
      .filter((p) => !p.el.closest(`[${ATTR}]`))
      .slice(0, 5)
      .map((p) => ({ author: p.author, el: summarize(p.el) })),
    unmarkedTriggerSample: unmarkedTriggers.slice(0, 10).map(summarize),
    verdict:
      multiCommentUsers.length === 0
        ? 'NO_DATA: no user with 2+ comments loaded — open a post where someone replied twice'
        : multiCommentUsers.every((u) => u.marked === u.comments) && mismatches.length === 0
          ? 'OK: every comment of multi-comment users is marked, no mention hijack'
          : 'FAIL: see multiCommentUsers / mentionMismatches',
  };

  console.log(JSON.stringify(report, null, 2));
  try {
    copy(JSON.stringify(report, null, 2));
  } catch {
    /* copy() unavailable outside DevTools */
  }
  return report;
})();
