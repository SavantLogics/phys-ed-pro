# PhysEd Pro v3.1

Offline-first PE attendance, dress-out, and participation tracker for physical education teachers. Replaces manual grading spreadsheets with a tap-fast, tablet-and-desktop tool that exports straight to Canvas.

**The analogy:** a referee's scorecard, not an accountant's ledger. During class it's tap-fast and forgiving; after class it becomes the clean report you hand to the league office (Canvas).

## Quick start

Open `index.html` in any modern browser. No server, no install, no account. For tablet use, "Add to Home Screen" installs it as an app (PWA). Everything works fully offline.

**Upgrading from v2:** your old localStorage data migrates into IndexedDB automatically the first time v3 opens, and the old data is left untouched as a backup.

## Files

| File | Role |
|------|------|
| `index.html` | The app (UI layer only) |
| `logic.js` | Pure logic: points, dates, CSV, comment ladder. Shared by app and tests |
| `storage.js` | IndexedDB facade + one-time v2 migration + JSON backup/restore |
| `sw.js` | Service worker (stale-while-revalidate offline caching) |
| `manifest.json` | PWA manifest |
| `tests.html` | In-browser test suite (uses the same logic.js/storage.js — no copied code) |
| `tests/` | Node unit tests, Python oracle, cross-check, headless smoke + migration tests |

## Attendance codes (seed defaults — deductions editable in Settings)

| Code | Meaning | Default deduction | Counts as |
|------|---------|-------------------|-----------|
| A | Absent | −10 | absence |
| N | Non-suit | −5 | non-suit |
| P | Non-participation | −5 | non-participation |
| NP | Non-suit + Non-participation | −10 | non-suit, non-participation |
| TN | Tardy + Non-suit | −5 | tardy, non-suit |
| TP | Tardy + Non-participation | −5 | tardy, non-participation |
| TNP | Tardy + Non-suit + Non-participation | −10 | tardy, non-suit, non-participation |
| EX | Excused | 0 | excused |
| MED | Medically Excused | 0 | excused |
| T | Tardy | 0 | tardy |

Custom codes (Tier 3) can be added in Settings with their own deduction and "counts as" flags, so they participate in the comment ladder correctly.

## Points

`Weekly points = max points − Σ(code deductions in the 10-weekday grading window)`, floored at 0. The grid shows the auto value; the **Adj** column stores a manual override per student per window (the auto value stays visible — "auto vs. adjusted" per spec). Exports always use the adjusted value when one exists.

## Comment ladder (first match wins, top to bottom)

| # | Condition (defaults; editable in Settings) | Comment |
|---|---|---|
| 1 | unexcused absences ≥ 2 | "Multiple unexcused absences this week affected the grade…" |
| 2 | non-participation days ≥ 2 | "Did not participate on multiple days…" |
| 3 | non-suit days ≥ 2 | "Was not dressed out multiple times this week…" |
| 4 | absences ≥ 1 | "One unexcused absence this week…" |
| 5 | non-participation ≥ 1 | "Sat out one day this week…" |
| 6 | non-suit ≥ 1 | "Was not dressed out once this week…" |
| 7 | tardies ≥ 2 | "Late to class multiple times this week…" |
| 9 | excused ≥ 1 | "Had excused absence(s) this week; otherwise on track." |
| 10 | ≥ 95% of points and no tardies | "Excellent week — full participation, dressed out, and on time…" |
| 11 | ≥ 85% of points | "Solid, consistent week. Good effort." |
| 12 | otherwise | "Met weekly expectations." |

**Adaptations from the signed ladder doc** (because entry is exception-only — no code means a clean day):

- Rule 8 (`low_part_days`) dropped — redundant with non-participation counts in the codes-only model.
- Rule 13 ("no data") dropped — "no codes" means a clean week here, not an untracked one.
- Rules 4/5/6 use ≥ 1 instead of == 1, so raising a critical threshold can't silence the comment entirely.
- Rule 10 additionally requires zero tardies so "on time" is never untrue (a single tardy lands on rule 11).
- The window is 2 calendar weeks (10 weekdays), matching the grid and the per-assignment Canvas export; rule wording still says "this week."

Teachers can click any comment to **override it** per student per window; clearing the text reverts to the auto-comment. The auto/custom state is visually marked (✎, italic).

## Canvas CSV export (Tier 2)

The export produces the 5 required case-sensitive Canvas columns — `Student, ID, SIS User ID, SIS Login ID, Section` — plus one new-assignment column and the `Points Possible` row that Canvas's own exports carry. In Canvas: **Grades → Actions → Import**, then map the new column to "A new assignment."

Workflow: export your gradebook from Canvas once (Grades → Actions → Export), upload it on the Export tab so the app learns IDs/SIS IDs, then download the filled CSV each grading window.

Sources:
- [How do I import grades in the Gradebook? — Instructure Community](https://community.canvaslms.com/t5/Instructor-Guide/How-do-I-import-grades-in-the-Gradebook/ta-p/807)
- [Importing Grades Into Canvas Using a Spreadsheet — USU](https://www.usu.edu/teach/help-topics/canvas/importing-grades-using-a-spreadsheet)

## Tiers (feature flags, Settings → Features)

- **Tier 1 (always on):** roster + bulk import, entry grid, points, ladder comments, manual overrides, multi-period, offline.
- **Tier 2:** Print, clear-entries buttons, Canvas CSV export.
- **Tier 3:** custom codes.
- **Future (not built):** PDF reports, Canvas API live sync, SIS integration, behavior analytics. The data layer keeps these possible (offline-first stays the operating mode; sync would be an online-only batch action).

## Storage, backup & student-data posture

Data lives in IndexedDB (`students`, `entries`, `settings`, `overrides` stores) — durable, queryable, no 5 MB localStorage ceiling ([MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)). The app also requests persistent storage so the browser won't evict it.

**Privacy by architecture:** the app has no server, no account, and transmits nothing. Nobody but the teacher can see the data — there is no developer-side database to breach. Think of it as a **calculator, not a filing cabinet**: it computes points and comments; the records get filed wherever the teacher saves them.

**Recommended workflow — keep the system of record in district storage:**

1. Settings → Data Management → **Choose Backup File…** and pick a file *inside your district-synced Google Drive / OneDrive folder* (Chrome/Edge; Firefox/Safari fall back to a normal download you can save there manually).
2. Tap **Back Up Now** at the end of each week (or whenever the reminder banner appears — it nags after 7 days without a backup). The file is overwritten in place, and Drive/OneDrive keep version history.
3. The browser data is then just a working cache — like an unsaved spreadsheet — while the data at rest sits under the district's existing security, retention, and access controls, exactly like the grade spreadsheets teachers already keep in Drive.

Why not direct Google/Microsoft API sync? Once an app talks to Drive/OneDrive APIs on a district account it becomes a third-party OAuth app — the exact thing district admins gate ([Google Workspace third-party app access controls](https://support.google.com/a/answer/13288950?hl=en)), and unverified Google apps are [capped at 100 users](https://support.google.com/cloud/answer/7454865?hl=en) pending [verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification). The synced-folder approach gets district-held data with zero OAuth surface. API sync stays a documented future option alongside Canvas API sync (online-only batch, queue-while-offline).

**Restore Backup** replaces all data from a backup file. Take a backup before clearing anything.

## Testing (per the owner's standing rule: nothing ships untested)

```bash
bash tests/run_all.sh          # Node unit tests + Python oracle cross-check
# optional headless app tests (need: npm i jsdom fake-indexeddb):
node tests/smoke_jsdom.js      # boots the real index.html, drives UI flows
node tests/migration_test.js   # v2 -> v3 migration scenarios
```

Also open `tests.html` in a browser (via a local server, e.g. `python3 -m http.server`) to run the same suites against real browser IndexedDB. The Python file `tests/comment_oracle.py` is the **test oracle**: an independent re-implementation of the comment ladder; the JS engine must match it exactly across `tests/cases.json` (32 student-week cases).

Last full run: **77 Node unit tests, 32/32 Python cross-check, 30 headless UI smoke tests, 13 migration tests, browser suite green — 0 failures.**

## v3.1 changes

- Backup-to-folder: pick a backup file once (File System Access API, Chrome/Edge); "Back Up Now" overwrites it in place. Persisted file handle, permission re-prompt handled, download fallback for Firefox/Safari.
- Backup reminder banner after 7 days without a backup (dismissible per session); last-backup status line in Settings.
- Privacy note in About; service worker cache bumped to v3-1.

## v3.0 changes from v2

- Storage: localStorage → IndexedDB with auto-migration and JSON backup/restore.
- Comment engine: replaced the v2 if-chain (where one EX masked everything, even 4 absences) with the priority ladder above, cross-checked against a Python oracle.
- Manual weekly override (Adj column) and per-student editable comments — new.
- Print button + print stylesheet — new.
- Custom codes with ladder flags — new.
- Tier feature flags — new.
- Bug fixes: UTC date drift (off-by-one "today"/week labels in US evenings), broken `--row-alt` CSS self-reference, Canvas export now includes Points Possible row and a named assignment column.
