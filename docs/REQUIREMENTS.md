# Flowboard — Granular Requirements

**Product:** Flowboard — calendar board for projects, flows, tasks, and dependency arrows  
**Stack:** React + TypeScript + Vite; optional Google Sheets / Google Calendar via Apps Script  
**Storage:** Browser `localStorage` cache + optional remote Sheets sync  

This document is the source of truth for regression tests under `src/**/*.test.ts`.  
Requirement IDs (e.g. `REQ-TIME-001`) map 1:1 to test cases.

### Running regressions (REQ-NF-001)

| When | Command / gate |
|------|----------------|
| Local anytime | `npm test` |
| Watch mode while editing | `npm run test:watch` |
| Every production build | `npm run build` (runs `vitest run` first) |
| Every git commit | `.husky/pre-commit` → `npm test` |
| Every push / PR | `.github/workflows/regression.yml` |

---

## 1. Domain model

### REQ-MODEL-001 — Projects
- A project has `id`, `name`, and `color`.
- Every task belongs to exactly one project.
- Task chip color is the project color (not a per-task color).
- At least one project must always exist.

### REQ-MODEL-002 — Flows
- A flow has `id`, `name`, `color`, and `projectId`.
- Flows belong to a project for organization; arrows use the flow color.
- Every project must have at least one flow.
- Dependencies reference a `flowId`.

### REQ-MODEL-003 — Tasks and day segments
- A task has `id`, `title`, `notes`, `projectId`, `labels[]`, and `segments[]`.
- A day segment has `date` (YYYY-MM-DD), `startHour`, `startMinute`, `endHour`, `endMinute`.
- Minutes are quantized to **0 | 15 | 30 | 45**.
- End time is **exclusive** on the 15-minute grid (e.g. 6:00–7:00 occupies 6:00, 6:15, 6:30, 6:45).
- End-of-day may be represented as hour `24`, minute `0`.
- A task may span multiple days via multiple segments; each day may have its own start/end.
- **`segments: []` means unscheduled** (backlog). Migrate preserves explicit empty arrays; missing segments on legacy data may still invent a recovery segment.

### REQ-MODEL-005 — Task labels
- A task may have **zero or more labels** (`labels: string[]`).
- The board keeps a **label catalog** on `StoreState.labels` as `LabelDef[]` (`{ name, description }`). Catalog entries remain after the last task unlinks them until explicitly deleted.
- Labels are normalized via `normalizeLabels` / `normalizeLabel`: trimmed, collapsed whitespace, max 32 chars, max 12 per task, case-insensitive dedupe (first spelling kept), sorted A–Z.
- Missing / invalid task labels migrate to `[]`; catalog is rebuilt via `mergeLabelCatalog` (legacy string catalogs accepted).
- Sheets stores per-task labels on the Tasks tab as a comma-separated `labels` cell, and the catalog in Meta key `labelCatalog` (JSON `LabelDef[]` or legacy string array).
- **Delete catalog label** (`deleteLabel` / `canDeleteLabel`) is allowed only when **no task** still uses that label (`countTasksWithLabel === 0`). If any task is linked, delete is refused.

### REQ-MODEL-004 — Dependencies
- A dependency has `id`, `fromId`, `toId`, `flowId`.
- Links may connect tasks across projects.
- Self-links are forbidden.
- Duplicate `(fromId, toId, flowId)` is forbidden.
- Cycles in the dependency graph are forbidden.

---

## 2. Time grid and scheduling

### REQ-TIME-001 — 15-minute slots
- The board exposes **96** slots per day (00:00 through 23:45).
- `normalizeMinute` snaps any minute value into `{0,15,30,45}`.

### REQ-TIME-002 — Slot indexing
- `slotIndex(hour, minute)` returns 0–96 (96 = midnight / exclusive end of day).
- `slotFromIndex` round-trips valid indices; index ≥ 96 maps to `{hour:24, minute:0}`.

### REQ-TIME-003 — Segment occupancy
- A segment occupies slots `[start, end)`.
- If stored end ≤ start, occupancy treats duration as at least 1 hour (4 slots), capped at end of day.
- `isSegmentStart` is true only for the segment’s start slot.

### REQ-TIME-004 — Single-day segment helpers
- `singleDaySegment(date, startH, startM)` without end defaults to **1 hour**.
- Providing end hour/minute uses that exclusive end (normalized).

### REQ-TIME-005 — Multi-day segment sync
- `syncSegmentsForRange` produces one segment per calendar day from startDate…endDate inclusive.
- Existing per-day times are preserved when the date still exists.
- New first/middle/last days get documented defaults (first: defaultStart→17:00; middle: 9:00–17:00; last: 9:00→defaultEnd; single day: defaultStart→defaultEnd).

### REQ-TIME-006 — Move task
- `moveTaskToSlot` shifts the whole task so the earliest segment starts at the drop slot.
- Relative day offsets and per-segment durations are preserved (clamped within the day).

### REQ-TIME-007 — Slot multi-select → create range
- Dragging across continuous empty cells on the **same day** selects inclusive slots.
- One cell → create range of **1 hour** (4 slots).
- Multiple cells → create range from first selected slot through exclusive end after the last selected slot.
- Selection cannot cross days.

### REQ-UI-016 — Touch scroll does not open create-task
- On **touch**, slot-select create requires a short hold (~280ms) before it arms; a finger that moves past a small slop (scroll) cancels the gesture.
- Scrolling the board abandons any pending slot-select.
- Unarmed or cancelled gestures must **not** open the New task modal on pointer-up.
- Mouse / pen still arm immediately for drag-to-create (desktop).

### REQ-TIME-008 — Formatting
- `formatSlot` uses 12-hour clock with am/pm (midnight end-of-day displays as `12:00am`).
- `formatRange` is `start–end`.

---

## 3. Board UI

### REQ-UI-001 — Day span views
- Supported spans: 1, 3, 7, 10, 15, 30, 60, 90, 180, 365 days.
- Cursor navigates backward/forward by the active span.

### REQ-UI-002 — Project filter
- Filter: **All** or a single project.
- Visible tasks/dependencies only include tasks in the filtered set (both endpoints must be visible for a link).

### REQ-UI-003 — Active flow
- User selects an active flow for drawing new links.
- When a flow is selected, arrows on other flows are muted (grey, reduced opacity); active flow stays full color.
- Muted arrows are not deletable via click.

### REQ-UI-004 — Task create / edit
- New task modal supports title, project, **labels**, start/end dates, start/end times, notes.
- Labels can be added (Enter / comma / Add) and removed as chips in the task editor.
- Multi-day tasks show a per-day start/end editor.
- Board create via slot select pre-fills segment times.
- A **Backlog only** checkbox saves with `segments: []` (no date/time).
- When editing an existing task, **Delete** sits in the **sticky modal header** (next to Close) so it stays reachable without scrolling on mobile; Cancel/Save remain in the footer.

### REQ-UI-018 — Unscheduled backlog panel
- **Board and Graph** views show a **right-side** **Backlog** rail of unscheduled tasks (`isTaskUnscheduled` / empty segments), filtered by the same project + label filters as the main view. It stays on the right on narrow viewports (does not move under the board).
- Backlog tasks are **grouped by label** (`groupUnscheduledByLabel`); multi-label tasks appear under each label; tasks with no labels under **Unlabeled** (last). Groups are scrollable with sticky group headers.
- Users can **hide/show** the rail (`▹` / vertical Backlog tab); preference persists in `flowboard-backlog-hidden` (REQ-LOCAL-008). Collapsed rail remains a drop target and shows the backlog count.
- Users can add backlog tasks from the panel (`+`) without assigning dates/times.
- In **Board** view, backlog cards are draggable onto calendar slots (same `DndContext` as the board). Drop calls `moveTaskToSlot` (creates a 1-hour segment) and upserts — the task leaves the backlog and appears on the calendar.
- In **Board** view, scheduled calendar tasks can be dragged **back onto the Backlog** drop target (`BACKLOG_DROP_ID`); drop calls `unscheduleTask` (clears `segments` to `[]`) so the task leaves the calendar and appears in the backlog.
- In **Graph** view the same backlog list is shown for browse/add/edit; drag-to-schedule onto day columns is board-only (switch to Board to drop onto time slots).
- Clicking a backlog card opens the task editor.
- The open backlog panel fills workspace height; its grouped list scrolls (`overflow-y: auto`). Cards use `touch-action: pan-y` so the list can scroll; hold-to-drag still schedules/unschedules on the board.

### REQ-UI-017 — Filter by labels
- Chrome shows a **LabelBar** of catalog labels plus **All labels**.
- **Clicking a label** (bar or task editor chip) selects that label (`selectLabelFilter`), filters the board/graph, expands chrome if minimized, and shows matching task titles in a **LabelFilterBanner** (always visible while filtered). Clicking a label must not delete/unlink it.
- Matching task titles are clickable to open the task editor.
- Each chip shows a usage count; **×** deletes from the catalog only when unused. If tasks still use it, delete is refused, the filter selects that label (so the task list appears), and a toast explains why.
- In the task editor, the Labels help copy is a **tooltip** on a compact `?` control (not a paragraph), to save space. Label name click lists matching tasks; **×** only unlinks from **that task**.
- **All labels** / **Clear labels** clears the filter (show all, still subject to project filter).
- Project filter and label filter combine (AND across dimensions).

### REQ-UI-013 — Pick dependents in task editor
- Task modal lists other existing tasks as **Dependent tasks** (multi-select checkboxes).
- A **search field** filters that list by case-insensitive title substring (`filterDependentTasks`); empty query shows all eligible tasks.
- The search control is **compact** (not full modal width); dependent task titles **wrap** to multiple lines (no single-line ellipsis truncation).
- Filtering only affects visibility — checked selections persist even when a task is temporarily hidden by the query.
- Search resets when the task modal opens / switches task.
- Links are created on the **active flow**: selected tasks become `from(current) → to(selected)`.
- On save, selection is synced: new checks add dependencies; unchecked existing links on that flow are removed.
- Cycle / duplicate / self-link rules still apply (`validateNewDependency`); failures are skipped and reported in the toast.
- If no flow is selected, the list explains that a flow is required (no links written).

### REQ-UI-005 — Task move
- Tasks can be dragged to a new date/time slot; whole multi-day block shifts accordingly.

### REQ-UI-006 — Linking
- User must select a flow before linking.
- Drag from task → handle onto another task creates a dependency on the active flow.
- Toast explains success or validation failure.

### REQ-UI-010 — Dependency arrows stay with tasks
- Dependency arrows are drawn in **board-canvas coordinates** (not a full-page fixed overlay).
- Arrows scroll with the time grid and are **clipped by the board scroller** — they must not float into the chrome (flows bar, topbar) when tasks scroll out of view.
- Endpoint positions use `elementCenterInRoot` / `clientPointToRoot` relative to `.board-canvas`.
- Draft (in-progress) link lines use the same coordinate space.

### REQ-UI-007 — Sample reset
- Reset restores sample projects/flows/tasks/dependencies and clears legacy local cache keys.

### REQ-UI-008 — Sticky date header
- The day labels (weekday + date) and the Time corner stay **pinned at the top** of the board while the user scrolls through time slots.
- Scrolling through hours happens **inside the board** (not by growing the whole page past the viewport).
- Sticky header and time-grid body share the same column template (`boardColumns`) so day columns stay aligned while scrolling.
- Day column widths shrink with longer day spans (1 → 112px … 365 → 36px) via `colMin`.
- The Time column remains sticky on horizontal scroll (`left: 0`).

### REQ-UI-009 — Resizable day columns
- User can **manually widen or narrow** day columns (drag the resize handle on a day header) to reveal more of truncated task titles.
- All visible day columns share one width; header and body stay aligned via the same `boardColumns` template.
- Width is clamped: floor is `colMin(dayCount)`; ceiling is 360px.
- Preferred widths are persisted in `localStorage` under `flowboard-day-col-widths`, keyed by day-span count.
- Double-clicking a resize handle resets that day-span’s width to the default `colMin`.

### REQ-UI-011 — Minimizable projects & flows chrome
- The projects filter, flows bar, and usage hint sit in a **collapsible chrome panel** above the board.
- User can **Minimize** / **Expand** the panel to reclaim vertical space for the calendar.
- When minimized, a one-line summary shows the active project filter and flow; Expand restores the full controls.
- Minimized preference persists in `localStorage` under `flowboard-chrome-minimized`.

### REQ-UI-012 — Dependency graph view
- Topbar offers **Board** and **Graph** main views.
- **Graph** shows a task dependency graph: nodes are tasks (title + project color), edges are dependencies (flow color).
- Graph has **no time rows** (no hour/15‑minute grid).
- Graph keeps **day columns** for every date that has **at least one task** (`daysWithTasks`); empty days are omitted.
- Graph view includes the same right-side **Backlog** panel as Board (REQ-UI-018) for unscheduled tasks.
- Each task appears once under its earliest segment date (`taskColumnDate` / `primarySegment`).
- Each node card shows **start time (bottom-left)** and **end time (bottom-right)** for that column day’s segment (`formatSlot`), with the title above — no full time grid.
- Layout via `layoutDependencyGraph` (day columns left-to-right; tasks stacked **by start time** within a day, earliest first).
- Arrows are **straight by default**. They bend only when the straight path would pass through another task box (`routeGraphEdge` / obstacle checks).
- Bent arrows are drawn **above** task cards with a light under-stroke so they stay visible.
- **Bend when blocked** slider (0.15–2, `flowboard-graph-curve`) controls how far avoidance bends push; drag a handle sitting **on the curve** (mid-path point, not the off-curve control) to fine-tune (`flowboard-graph-bends`); **Reset bends** clears manual bends.
- Project filter still limits visible nodes/edges; active-flow muting matches the board (other flows greyed).
- Clicking a node opens the task editor; clicking an active-flow edge removes that dependency.
- Day-span / date navigation controls are hidden while Graph is active.
- Preferred main view persists under `flowboard-main-view` (`board` | `graph`).

### REQ-UI-014 — Mobile board scrolling
- On touch devices, the board scroller must accept **vertical and horizontal** pan gestures (`touch-action: pan-x pan-y`).
- Task chips must **not** use `touch-action: none` at rest (that blocks scroll when the finger starts on a task); only while actively dragging.
- Touch drag-and-drop uses a short activation delay so a normal swipe scrolls the board; mouse drag keeps a small distance threshold.
- Board / graph scroll areas use a flex basis of `0` with `min-height: 0` so iOS Safari keeps them viewport-bounded and scrollable (page body stays `overflow: hidden`).
- On narrow viewports (≤720px): chrome is **two compact rows** (Board/Graph + actions; days dropdown + date nav). Brand title is visually hidden; day-span pills, link count, Reset sample, and usage hint are hidden; Sheets shows status dot only; New task is **+**; projects/flows toggle is a short chevron.
- Board/graph keep a minimum height (~72dvh). Projects/flows chrome is height-capped when expanded.
- Narrow viewports **start with projects/flows minimized** on load so the calendar gets most of the screen (user can still Expand).

### REQ-UI-015 — Mobile modals fit the viewport
- Modal dialogs (task / project / flow / sheets) must stay within the viewport on narrow screens — no horizontal clipping of fields (e.g. End date / End time).
- Modal width uses `min(…, 100vw − padding)` / `max-width: 100%` with `box-sizing: border-box`.
- Form controls inside modals use `width: 100%`, `min-width: 0` so native date/time inputs cannot blow out the layout.
- On narrow viewports (≤720px), two-column `modal__row` grids stack to a single column; the modal scrolls vertically within ~90dvh.

### REQ-AUTH-001 — Shared password gate config
- Build-time env `VITE_FLOWBOARD_PASSWORD` configures a shared login password (trimmed).
- Empty or unset password → **no login gate** (app opens immediately).
- Non-empty password → visitors must unlock before seeing the board.
- This is a **casual shared gate**: Vite embeds `VITE_*` values in client JS (not server-side auth).

### REQ-AUTH-002 — Unlock session
- Correct password unlocks the app and stores a derived session token under `flowboard-auth-session` in **`sessionStorage`** (tab-scoped).
- Wrong password leaves the session empty and keeps the login screen.
- Changing the configured password invalidates prior session tokens.
- **Lock** clears the session and returns to the login screen.
- When the gate is disabled, unlock helpers treat the app as already unlocked.

---

## 4. Persistence — local

### REQ-LOCAL-001 — Cache key
- Primary key: `flowboard-state-v6`.
- Loader migrates from older keys v1–v5 when present.

### REQ-LOCAL-002 — Migration
- Legacy tasks with `date`/`hour`/`minute` convert to a single day segment (default 1 hour if no end).
- Legacy tasks with `segments` keep normalized segments.
- Missing project/flow ids are repaired with fallbacks.
- Projects without a flow receive a default “Main flow”.

### REQ-LOCAL-003 — Sheets URL / calendar flag
- Sheets script URL: browser override under `flowboard-sheets-url`; if unset, use build-time `VITE_SHEETS_SCRIPT_URL`.
- Saving an empty URL means local-only (does not fall back to the built-in URL until the override key is cleared).
- Cloud sync control (Sheets button / modal) remains available even when a URL is baked into the build.
- Calendar sync preference stored under `flowboard-calendar-sync`.

### REQ-LOCAL-004 — Day column widths
- Manual day-column widths persist under `flowboard-day-col-widths` as a map of day-span → px.

### REQ-LOCAL-005 — Chrome minimized flag
- Chrome panel minimized state persists under `flowboard-chrome-minimized` (`true` / `false`).

### REQ-LOCAL-006 — Main view preference
- Board vs Graph selection persists under `flowboard-main-view`.

### REQ-LOCAL-007 — Graph arrow curve prefs
- Global curve strength: `flowboard-graph-curve`.
- Per-edge bend offsets: `flowboard-graph-bends`.

### REQ-LOCAL-008 — Backlog visibility preference
- Backlog rail hidden state persists under `flowboard-backlog-hidden` (`true` / `false`).
- Default when unset: visible (`false`).

---

## 5. Persistence — Google Sheets / Calendar (Apps Script contract)

### REQ-SYNC-001 — Remote state shape
- Sheets tabs: Projects, Flows, Tasks, Segments, Dependencies, CalendarMap, Meta.
- Tasks store identity + notes + project; Segments store per-day times.
- Tasks may also store denormalized first-segment `date/hour/minute/endHour/endMinute` for recovery.

### REQ-SYNC-002 — Save guards
- Refuse saving an empty task list over a non-empty Tasks sheet **unless** the client sends `allowEmptyBoard: true` (explicit Push after confirmation).
- Auto-save must **not** wipe Sheets when the local board becomes empty (e.g. user deleted the last task); surface a tip to Pull or confirm Push instead.
- If incoming tasks lack schedules, preserve existing Segments rather than wiping them.
- On load, copy legacy Task date/hour into Segments when Segments missing for that task.

### REQ-SYNC-003 — Calendar sync
- When enabled, each day-segment becomes one timed event on the primary calendar.
- Events are tagged with `Flowboard task: <id> | date: <YYYY-MM-DD>`.
- Calendar failures must not roll back a successful Sheets save (error surfaced separately).
- Tasks with no valid date are skipped (`invalid date ""`).

### REQ-SYNC-004 — Delete invalid tasks
- Action/UI removes tasks with no valid schedule date from Sheets (and related segments/deps/map rows).
- Valid tasks (e.g. with `2026-07-21`) are kept.

### REQ-SYNC-005 — Prefer local after broken remote
- If remote tasks exist but all lack segments, and local has scheduled tasks, keep local and push.

---

## 6. Dependencies (validation rules)

### REQ-DEP-001 — Self link
- `fromId === toId` → reject.

### REQ-DEP-002 — Missing flow
- Empty/missing `flowId` → reject.

### REQ-DEP-003 — Duplicate
- Same from/to/flow already present → reject.

### REQ-DEP-004 — Cycle detection
- Adding A→B is rejected if B can already reach A through existing edges.

### REQ-DEP-005 — Cross-project
- Cross-project links are allowed when both tasks exist and flow exists.

---

## 7. Non-functional

### REQ-NF-001 — Regression gate
- Automated regression tests cover REQ-* scenarios in this document.
- Tests run on every commit (git hook) and on every CI push/PR.
- `npm run build` runs the regression suite before compiling.

### REQ-NF-002 — Determinism
- Pure domain helpers (`time`, `migrate`, `dependencies`, `boardLayout`, `arrowGeometry`, `graphLayout`) have no network/UI side effects and are unit-tested.

---

## Traceability

| Area        | Requirement IDs                                      | Primary tests                                      |
|-------------|------------------------------------------------------|----------------------------------------------------|
| Time grid   | REQ-TIME-001 … 008                                   | `src/time.test.ts`                                 |
| Model migrate | REQ-LOCAL-002, REQ-MODEL-*                         | `src/storage/migrate.test.ts`                      |
| Task labels | REQ-MODEL-005, REQ-UI-017                            | `src/domain/taskLabels.test.ts`                    |
| Unscheduled backlog | REQ-UI-018, REQ-MODEL-003, REQ-LOCAL-008       | `src/domain/unscheduled.test.ts`, `src/chromePrefs.test.ts`, `src/time.test.ts` |
| Dependencies| REQ-DEP-001 … 005, REQ-MODEL-004                     | `src/domain/dependencies.test.ts`                  |
| Slot select | REQ-TIME-007, REQ-UI-016                             | `src/time.test.ts`, `src/domain/slotSelectGesture.test.ts` |
| Board layout| REQ-UI-008, REQ-UI-009, REQ-UI-014, REQ-UI-015, REQ-LOCAL-004 | `src/boardLayout.test.ts`                   |
| Dep arrows  | REQ-UI-010                                           | `src/domain/arrowGeometry.test.ts`                 |
| Chrome panel| REQ-UI-011, REQ-LOCAL-005                            | `src/chromePrefs.test.ts`                          |
| Graph view  | REQ-UI-012, REQ-LOCAL-006, REQ-LOCAL-007             | `src/domain/graphLayout.test.ts`, `src/viewPrefs.test.ts`, `src/domain/arrowGeometry.test.ts`, `src/graphCurvePrefs.test.ts` |
| Task modal  | REQ-UI-004, REQ-UI-013                               | `src/taskModal.layout.test.ts`, `src/domain/taskDependents.test.ts` |
| Auth gate   | REQ-AUTH-001, REQ-AUTH-002                           | `src/auth/passwordGate.test.ts`                    |
| Local cache | REQ-LOCAL-001, REQ-LOCAL-003                         | `src/storage/localCache.test.ts`                   |
| Sync policy | REQ-SYNC-002, REQ-SYNC-005                           | `src/storage/syncPolicy.test.ts`                   |
