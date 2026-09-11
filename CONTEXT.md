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

**Dialog User List**:
A list of accounts inside the post-activity dialog (the likes / reposts /
quotes tabs). Rows carry no profile anchor; usernames are recovered by
avatar-alt cross-validation.
_Avoid_: likes list (that is one tab, not the whole concept), insights list

**Tab Session**:
The lifetime of one visit to one Dialog User List tab. Starts when the tab's
rows first appear; ends on tab switch, dialog close, or route change.
_Avoid_: dialog session

**Roster**:
The set of every username scanned in the current Tab Session, retained even
after virtual scroll recycles the row's DOM node. The data source for
select-all. Cleared when the Tab Session ends.
_Avoid_: seen list (an existing, differently-scoped mechanism for shift-range
selection), loaded list

**Loaded**:
Said of an account whose row has been inserted into the DOM at least once
during the current Tab Session. Independent of viewport visibility and of
whether the node still exists. What "(N loaded)" in the select-all button
counts.
_Avoid_: visible, on screen

**Auto-Select Mode**:
The live select-all state: every account entering the Roster is selected
automatically as the user scrolls. Ends on tab switch, dialog close, route
change, block execution, or manual toggle-off.
_Avoid_: live mode, follow mode, select-all state

**Manual Exclusion**:
An account the user deselected while Auto-Select Mode was active. Immune to
re-selection by Auto-Select Mode for the rest of the Tab Session; manual
re-selection lifts the exclusion. Manual action always overrides automation.
_Avoid_: blacklist, ignore list
