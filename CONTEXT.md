# Thread Blocker

Chrome extension for batch-blocking accounts on Threads. Users select accounts
from comments or dialog user lists, then send them to a background block queue.

## Language

### Selection

**Block Mode**:
The state in which clicking a marked account row toggles its selection instead
of navigating. Entered via the FAB, exited explicitly or on route change.
_Avoid_: select mode, multi-select mode

**Block Queue**:
The background list of accounts awaiting ID resolution and block execution.
Pausable and per-item cancellable from the panel.
_Avoid_: batch, pending list

### Dialog user lists

**Activity Dialog**:
The post-activity dialog (查看動態). Opens on an overview listing the likes,
reposts and quotes counts; each entry drills down into a Sub-List, and a back
arrow returns to the overview. Not a tabbed UI.
_Avoid_: tabs, insights dialog

**Dialog User List**:
One Sub-List of the Activity Dialog (likes, reposts or quotes). Rows carry no
profile anchor; usernames are recovered by avatar-alt cross-validation.
_Avoid_: likes list (that is one Sub-List, not the whole concept), insights
list

**Active Sub-List**:
The Dialog User List currently on screen. A Sub-List left via the back arrow
stays mounted but hidden, so "active" is decided by visibility, never by DOM
presence.
_Avoid_: current tab, open list

**Loaded**:
Said of an account whose row is rendered in the Active Sub-List right now.
What "(N loaded)" on the select-all button counts. Threads web may load only
part of a long list (e.g. ~200 of 5,321 likes), so loaded ≠ all.
_Avoid_: all, visible in viewport (scrolled-off rows still count)

**Select-All Snapshot**:
One press of select-all: selects every Loaded account of the Active Sub-List
at that moment, excluding the viewer's own account and non-row marked
elements. No live follow-up — pressing again is how the user extends it, and a
manual deselection is never undone by automation.
_Avoid_: auto-select, live mode, select-all state
