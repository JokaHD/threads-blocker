/**
 * Debug script: dialog user-list virtualization & lifecycle probe.
 *
 * Answers the DOM facts needed to implement Tab Session detection for the
 * dialog select-all feature (docs/adr/0001):
 *   1. Does the list virtualize (are scrolled-away rows removed from DOM)?
 *   2. How many rows arrive per lazy-load batch?
 *   3. On tab switch: are rows batch-removed, do data-tb-comment-id markers
 *      survive, is the dialog element itself replaced?
 *   4. What signal fires on dialog close?
 *   5. Which DOM signal identifies the active tab (role="tab" /
 *      aria-selected / something else)? Tab detection must not assume
 *      role="tab" exists — candidates are recorded on every click.
 *   6. Are row elements recycled in place (same element, new user)? If so,
 *      does the data-tb-comment-id marker go stale (marker ≠ row content)?
 *
 *   7. (round 2) Does the reposts / quotes sub-list lazy-load on scroll
 *      (unlike likes, which loaded ~200 rows at once)?
 *   8. (round 2) Which marked elements are visible on the overview screen
 *      (post preview? liker avatar previews?) — select-all must exclude
 *      anything that is not a list row. See visibleMarkedDetail.
 *
 * Usage (on threads.com, with the extension loaded):
 *   1. Open a post's activity dialog (查看動態) — the overview with
 *      「按讚內容 / 轉發 / 引用內容 ›」. Stay on the overview.
 *   2. Paste this whole file into the DevTools console (page context).
 *   3. Click 轉發 ›, wait 3 s, then slowly scroll to the very bottom,
 *      pausing until each new batch appears.
 *   4. Click the back arrow, wait 3 s.
 *   5. Close the dialog.
 *   6. Run: __tbDlgDebug.report()  — JSON is logged and copied to clipboard.
 */
(() => {
  const ATTR = 'data-tb-comment-id';
  const MARK = `[${ATTR}]`;
  const PRESSABLE = '[data-pressable-container]';
  const TAB_LABELS = ['讚', '按讚', '轉發', '引用', 'Likes', 'Reposts', 'Quotes'];

  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog')];
  const dlg = dialogs.find((d) => d.querySelector(PRESSABLE)) || dialogs[0] || null;

  const state = {
    startedAt: new Date().toISOString(),
    url: location.href,
    dialogCount: dialogs.length,
    dialogFound: !!dlg,
    seenUsernames: new Set(),
    maxConcurrentMarked: 0,
    addedBatches: [], // marked-row additions per mutation tick
    removedMarkedTotal: 0,
    removalEvents: [], // {t, removedMarked, dialogStillConnected}
    tabSwitches: [], // {t, clicked, before, afterSnapshots: [...]}
    tabHeaderAtStart: null,
    recycledElements: 0, // same element observed carrying a different user
    staleMarks: [], // marker disagrees with the row's own img alt / text
    dialogRemovedAt: null,
    timeline: [], // sparse snapshots when counts change
  };

  const brief = (el) =>
    el && {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaCurrent: el.getAttribute('aria-current'),
      ariaPressed: el.getAttribute('aria-pressed'),
      tabindex: el.getAttribute('tabindex'),
      pressable: el.hasAttribute('data-pressable-container'),
      text: (el.textContent || '').trim().slice(0, 30),
      // Font weight / color often carry the "selected" state when ARIA doesn't
      fontWeight: getComputedStyle(el).fontWeight,
      color: getComputedStyle(el).color,
    };

  // Candidate tab headers, most to least stable. Recorded so the
  // implementation can pick a selector backed by real data.
  const tabHeader = () => {
    if (!dlg || !dlg.isConnected) return null;
    const byRole = [...dlg.querySelectorAll('[role="tab"]')];
    const byAria = [...dlg.querySelectorAll('[aria-selected]')];
    const byText = [...dlg.querySelectorAll('div, span, a, button')].filter(
      (el) =>
        el.children.length <= 2 &&
        TAB_LABELS.some((l) => (el.textContent || '').trim().startsWith(l)) &&
        (el.textContent || '').trim().length <= 12
    );
    return {
      tablistCount: dlg.querySelectorAll('[role="tablist"]').length,
      roleTab: byRole.map(brief),
      ariaSelected: byAria.slice(0, 10).map(brief),
      byLabelText: byText.slice(0, 10).map(brief),
    };
  };

  // Username a row claims to be, from its own content (avatar alt is the
  // most reliable — see threadsSiteRule.findUserListRows).
  const rowIdentity = (el) => {
    const alt = el.querySelector('img[alt]')?.getAttribute('alt') || '';
    return { alt: alt.slice(0, 60), text: (el.textContent || '').slice(0, 80) };
  };

  const elementUser = new WeakMap();

  const checkMarks = () => {
    if (!dlg || !dlg.isConnected) return;
    for (const el of dlg.querySelectorAll(MARK)) {
      const user = el.getAttribute(ATTR);
      state.seenUsernames.add(user);

      const prev = elementUser.get(el);
      if (prev && prev !== user) state.recycledElements++;
      elementUser.set(el, user);

      // The marked container may be the pressable without the avatar; look
      // one row up for the img alt.
      const row = el.querySelector('img[alt]') ? el : el.parentElement?.parentElement || el;
      const id = rowIdentity(row);
      const consistent = id.alt.includes(user) || id.text.includes(user);
      if (!consistent && state.staleMarks.length < 20) {
        state.staleMarks.push({ t: Date.now(), marker: user, ...id });
      }
    }
  };

  // What a visible marked element is: a list row (avatar + username +
  // follow button, ~full dialog width) or something else (post preview,
  // avatar strip on the overview screen).
  const describeMarked = (el) => {
    const r = el.getBoundingClientRect();
    return {
      user: el.getAttribute(ATTR),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top - dlg.getBoundingClientRect().top),
      pressable: el.hasAttribute('data-pressable-container'),
      imgs: el.querySelectorAll('img').length,
      hasButton: !!el.querySelector('[role="button"]'),
      insideButton: !!el.parentElement?.closest('[role="button"]'),
      text: (el.textContent || '').trim().slice(0, 50),
    };
  };

  const snap = () => {
    if (!dlg || !dlg.isConnected) return null;
    const marked = [...dlg.querySelectorAll(MARK)];
    return {
      t: Date.now(),
      pressables: dlg.querySelectorAll(PRESSABLE).length,
      marked: marked.length,
      visibleMarked: marked.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length,
      firstMarked: marked[0]?.getAttribute(ATTR) || null,
      visibleMarkedDetail: marked
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .slice(0, 20)
        .map(describeMarked),
    };
  };

  const record = () => {
    const s = snap();
    if (!s) return;
    checkMarks();
    state.maxConcurrentMarked = Math.max(state.maxConcurrentMarked, s.marked);
    const last = state.timeline[state.timeline.length - 1];
    if (!last || last.pressables !== s.pressables || last.marked !== s.marked) {
      state.timeline.push(s);
      if (state.timeline.length > 400) state.timeline.shift();
    }
  };

  const countMarkedIn = (node) => {
    if (node.nodeType !== 1) return 0;
    const self = node.matches?.(MARK) ? 1 : 0;
    return self + (node.querySelectorAll?.(MARK).length || 0);
  };

  const mo = new MutationObserver((muts) => {
    let added = 0;
    let removed = 0;
    for (const m of muts) {
      for (const n of m.addedNodes) added += countMarkedIn(n);
      for (const n of m.removedNodes) removed += countMarkedIn(n);
    }
    if (added > 0) state.addedBatches.push(added);
    if (removed > 0) {
      state.removedMarkedTotal += removed;
      state.removalEvents.push({
        t: Date.now(),
        removedMarked: removed,
        dialogStillConnected: !!dlg?.isConnected,
      });
    }
    if (dlg && !dlg.isConnected && !state.dialogRemovedAt) {
      state.dialogRemovedAt = Date.now();
    }
    record();
  });
  // characterData: catches in-place recycling where only the text changes
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Any click inside the dialog that is not on a marked row is a tab-switch
  // candidate — we don't know yet whether tabs carry role="tab".
  const onClick = (e) => {
    if (!dlg || !dlg.contains(e.target) || e.target.closest(MARK)) return;
    const entry = {
      t: Date.now(),
      clicked: brief(e.target),
      clickedRoleTabAncestor: !!e.target.closest('[role="tab"]'),
      before: { rows: snap(), header: tabHeader() },
      afterSnapshots: [],
    };
    state.tabSwitches.push(entry);
    for (const delay of [300, 1000, 2500]) {
      setTimeout(() => entry.afterSnapshots.push({ rows: snap(), header: tabHeader() }), delay);
    }
  };
  document.addEventListener('click', onClick, true);

  state.tabHeaderAtStart = tabHeader();
  record();

  window.__tbDlgDebug = {
    report() {
      mo.disconnect();
      document.removeEventListener('click', onClick, true);
      const out = {
        ...state,
        seenUsernames: undefined,
        uniqueUsernamesEverSeen: state.seenUsernames.size,
        verdict: {
          virtualized:
            state.removalEvents.some((e) => e.dialogStillConnected) &&
            state.seenUsernames.size > state.maxConcurrentMarked,
          typicalBatchSize: state.addedBatches.length
            ? state.addedBatches.sort((a, b) => a - b)[Math.floor(state.addedBatches.length / 2)]
            : null,
          dialogRemovedOnClose: state.dialogRemovedAt !== null,
          tabsHaveRoleTab: (state.tabHeaderAtStart?.roleTab.length || 0) > 0,
          rowsRecycledInPlace: state.recycledElements > 0,
          staleMarkersFound: state.staleMarks.length > 0,
        },
        suggestedNextStep:
          'Paste this JSON back into the Claude session for Tab Session implementation.',
      };
      const json = JSON.stringify(out, null, 2);
      console.log(json);
      try {
        // eslint-disable-next-line no-undef -- DevTools console command-line API
        copy(json);
        console.log('%c[tb-debug] JSON copied to clipboard.', 'color: #4caf50');
      } catch {
        console.log('[tb-debug] copy() unavailable — select the JSON above manually.');
      }
      return out;
    },
  };

  console.log(
    `[tb-debug] armed. dialog=${!!dlg}, roleTab=${state.tabHeaderAtStart?.roleTab.length ?? 0}. ` +
      'Scroll, switch tab, close dialog, then run __tbDlgDebug.report()'
  );
})();
