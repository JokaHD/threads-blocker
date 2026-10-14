# Select-all in dialog user lists: one-shot snapshot of the visible Sub-List

Status: accepted (revised 2026-10-14 after real-site debug, superseding the
first draft "roster-based live select-all").

Select-all in the post-activity dialog selects, in one shot, every marked
account row of the **Active Sub-List** at click time — rows that are currently
rendered (non-zero rect), excluding the logged-in user and any marked element
that is not a list row (post preview, overview avatar strip). There is no
Roster, no Auto-Select Mode and no Manual Exclusion bookkeeping: deselecting
someone after select-all simply sticks, because nothing re-selects
automatically. Pressing select-all again is the explicit way to extend.

## Real-site facts (debug probe, 2026-10-14)

- The activity dialog is an **overview + drill-down**, not tabs: the overview
  lists 「按讚內容 N ›」「轉發 N ›」「引用內容 N ›」 as `role="button"` entries;
  each opens a Sub-List, and a back arrow returns to the overview. No
  `role="tab"` / `aria-selected` anywhere.
- The likes Sub-List does **not virtualize** and did not lazy-load on scroll:
  ~200 rows (for a post with 5,321 likes) arrived at once and stayed in the
  DOM; no row element was ever reused for a different user.
- Going **back to the overview keeps the previous Sub-List mounted but
  hidden** (211 marked, 13 visible). Opening another Sub-List removes the old
  rows in one batch. Closing the dialog removes `[role="dialog"]`.
- The **logged-in user is marked** (the post preview at the top of the
  dialog — the post author is the viewer).

## Considered Options

- **Roster + live Auto-Select Mode** (first draft): kept every scanned
  username across virtual-scroll recycling and auto-selected rows as they
  loaded. Rejected: both premises are false on the real site — rows are not
  recycled, and the likes list does not stream in while scrolling. It would
  have cost five lifecycle-termination events and exclusion bookkeeping for
  no behavior the user can observe.
- **All marked rows in the dialog** (`dialog.querySelectorAll(mark)`):
  rejected — hidden Sub-Lists stay mounted, so select-all on the reposts list
  (or the overview) would silently include every liker.
- **Visible snapshot** (chosen): what you see is what gets selected. Matches
  the existing rather-miss-than-mis-mark rule.

## Consequences

- Visibility is the scope boundary: the filter must use the same non-zero
  rect test the site adapter already uses for user-list rows.
- The viewer's own account and non-row marked elements must be excluded
  explicitly; blocking yourself would fail in the queue at best.
- The button label shows the snapshot size, e.g. "Select all (N loaded)",
  with the ⓘ tooltip (a like is not an endorsement; only loaded accounts are
  covered). Block with ≥ 20 accounts keeps the confirm step.
- Open (pending round-2 probe): whether the reposts / quotes Sub-Lists
  lazy-load on scroll — if they do, the user re-presses select-all after
  scrolling; no live mode is planned either way. And which overview
  elements are marked (the 13 visible on the overview) so they can be
  excluded by shape rather than by guess.
