# Select-all in dialog user lists: live auto-select over a Tab-Session Roster

Dialog user lists (likes / reposts / quotes) lazy-load on scroll and may
virtualize rows away, so "all" can never mean the full server-side list — only
what has been loaded this Tab Session. We decided that select-all reads from a
**Roster** (every username scanned since the tab was entered, kept across DOM
recycling) rather than querying the live DOM, and behaves as **Auto-Select
Mode** (a toggle: accounts keep getting selected as they load) rather than a
one-shot snapshot. Manual deselection while the mode is active creates a
**Manual Exclusion** that automation may not override.

## Considered Options

- **DOM query at click time** (`querySelectorAll('[data-tb-comment-id]')`):
  simplest, but silently misses rows recycled by virtual scroll — the result
  would depend on an implementation detail of Threads we don't control.
- **Snapshot semantics** (select the Roster as of the click; re-click to
  extend): keeps every selection an explicit act. Rejected by the owner for
  ergonomics — the expected usage is "scroll and sweep", and the live count on
  the button plus the Block-time confirm (≥ 20 accounts) were judged a
  sufficient guard.
- **Cross-tab Roster accumulation**: rejected. Select-all pressed on the
  "likes" tab must never include accounts scraped from the "reposts" tab;
  the Roster is cleared on every tab switch. Rather under-select than
  mis-select — consistent with the existing rather-miss-than-mis-mark rule in
  the site adapter.

## Consequences

- Auto-Select Mode must terminate on all five events (tab switch, dialog
  close, route change, block execution, manual toggle) — a mode that outlives
  its Tab Session would silently re-sweep the next list.
- Selection can include accounts no longer present in the DOM; the UI must
  communicate scope through the "(N loaded)" button label and the ⓘ tooltip
  ("a like is not an endorsement; only scrolled-past accounts are covered"),
  not through row highlights alone.
- Detecting tab switches and dialog close requires DOM facts (whether rows
  are batch-replaced, whether markers survive) that must come from a debug
  run on the real site, per the UI-injection rules — never guessed.
