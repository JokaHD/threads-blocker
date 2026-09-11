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
 *
 * Usage (on threads.com, with the extension loaded):
 *   1. Open a post's activity dialog (查看動態) and pick the 按讚 tab.
 *      Wait until rows are marked (extension scan runs automatically).
 *   2. Paste this whole file into the DevTools console (page context).
 *   3. Slowly scroll the list through at least 5–10 load batches.
 *   4. Switch to another tab (轉發/引用) and back once.
 *   5. Close the dialog.
 *   6. Run: __tbDlgDebug.report()  — JSON is logged and copied to clipboard.
 */
(() => {
  const MARK = '[data-tb-comment-id]';
  const PRESSABLE = '[data-pressable-container]';

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
    tabSwitches: [], // {t, label, before, afterSnapshots: [...]}
    dialogRemovedAt: null,
    timeline: [], // sparse snapshots when counts change
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
    };
  };

  const record = () => {
    const s = snap();
    if (!s) return;
    for (const el of dlg.querySelectorAll(MARK)) {
      state.seenUsernames.add(el.getAttribute('data-tb-comment-id'));
    }
    state.maxConcurrentMarked = Math.max(state.maxConcurrentMarked, s.marked);
    const last = state.timeline[state.timeline.length - 1];
    if (!last || last.pressables !== s.pressables || last.marked !== s.marked) {
      state.timeline.push(s);
      if (state.timeline.length > 400) state.timeline.shift();
    }
  };

  const countMarkedIn = (node) => {
    if (node.nodeType !== 1) return 0;
    let n = node.matches?.(MARK) ? 1 : 0;
    return n + node.querySelectorAll?.(MARK).length || n;
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
  mo.observe(document.body, { childList: true, subtree: true });

  // Tab clicks: snapshot before, then sample 3x after to see the transition.
  const onClick = (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    const entry = {
      t: Date.now(),
      label: tab.textContent?.trim().slice(0, 30),
      before: snap(),
      afterSnapshots: [],
    };
    state.tabSwitches.push(entry);
    for (const delay of [300, 1000, 2500]) {
      setTimeout(() => entry.afterSnapshots.push(snap()), delay);
    }
  };
  document.addEventListener('click', onClick, true);

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
    `%c[tb-debug] Probe armed (dialogFound=${!!dlg}). Scroll, switch tab, close dialog, then run __tbDlgDebug.report()`,
    'color: #2196f3'
  );
})();
