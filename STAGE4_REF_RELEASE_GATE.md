# Stage 4 consolidated release gate — APPROVED, NOT YET CERTIFIED

**Branch:** `v0.16-map-redesign`. **Baseline last installed by user:** `5215c8bc`.
**Rule:** GitHub Actions builds are CI intermediates. Do not present or recommend another APK for Pixel 10 acceptance until this entire gate passes for a single final commit and build. Do not merge to `main` without separate approval.

## Source of approvals

- Recording review: FIX-01–FIX-06; KEEP-02R and KEEP-02S; KEEP-12–KEEP-14. KEEP-11 H1/H2 explicitly rejected.
- Visual parity audit: VIS-01–VIS-08 approved.
- Additional approved instructions: no map-card selection checkboxes; Keep-style label creation/rename/delete and sidebar separators; multiple label chips and label filtering; Keep-style Archive/Unarchive, Delete/Restore/Undo and contextual menus; dialogs; typography; remove timestamps from note read view.
- REF-01–REF-07 all approved from Google Keep reference video `screen-20261120-165318-1795173511827.mp4`: contextual actions, labels, sidebar, card selection, deletion/archive, editor formatting, and color/typography.
- Illustrated note backgrounds **deferred**; H1/H2 **rejected**. Defer unapproved additional Keep features and earlier KEEP candidates.
- Archive/Unarchive specifically reapproved as a dedicated view. Keep seven-day Recently Deleted policy and one-time warning/recovery for legacy trash.
- PIN: preserve existing credentials; new numeric PIN 4–6 digits; optional alphanumeric password 6–12 characters; biometric first, credential fallback.
- Impeccable and applicable Modern guidance audit: only approved changes, no dependencies/features added without approval.

## Final acceptance requirements

Each row must be visually reviewed against the supplied reference where applicable, functionally tested, and recorded PASS for the *same final commit*. Existing implementation does not count as verification.

| Gate | Scope |
| --- | --- |
| REF-01 / FIX-01–04 / VIS-01,02,06,08 | Menu icons, order, row spacing, separators, context placement, list/grid, sort, sidebar safe area, expand icon, dialogs |
| REF-02 / VIS-05 | Create/rename/delete label screens; assignment indicators; multiple labels, sidebar dividers and chips; label filtering and sorting; preserve maps |
| REF-03 / VIS-01,02,04 | Sidebar grouping, highlights, light/dark typography, navigation and Archive/Deleted destinations |
| REF-04 / KEEP-13 / VIS-03,08 | Checkbox-free map-card long press; selected borders; contextual header and multi-select actions; no obstructed previews |
| REF-05 / KEEP-14 | Archive/unarchive single+multi; delete/restore single+multi; undo incl. dismissed snackbar; permanent delete confirm; seven-day retention and existing trash recovery warning |
| REF-06 / FIX-05 / KEEP-02R,02S / VIS-07 | Real inline B/I/U, overlapping formatting, keyboard-safe toolbar, bullets and numbers continuation, autosave and legacy content; no H1/H2; no timestamps in read view |
| REF-07 / KEEP-12 / VIS-04 | Solid-color pastel palette, selected swatch, dark/light/system theme, readable font/contrast, preserve old colors; no illustrated backgrounds |
| Security | Biometric-first unlock; PIN/password fallback, existing PIN compatibility; 4–6 numeric and 6–12 alphanumeric new credentials |
| Data integrity | SQLite migration and multi-label retention; hierarchy; archive states; trash; local encrypted backup/restore; PDF export; offline, no cloud/sharing |
| Map regression | Gestures, zoom/fit, rotations, focus, child creation, hierarchy, minimap, labels, connectors, large map and navigation |
| Automated CI | Project logic and behavior tests, TypeScript typecheck, release APK compilation, Android emulator smoke test all PASS |
| Pixel 10 acceptance | User tests final combined APK; record passed/failed/not-tested outcomes. Do not equate CI success with device acceptance |

## Release process

1. Compare current branch to this complete approved scope and source recording; implement missing or inconsistent items only. Reuse working code and preserve data.
2. Add targeted regression checks for code changes and migration behavior.
3. Fix any errors and rerun checks until one combined branch head passes all automated checks.
4. Validate actual screen layouts against the reference; report any items that cannot be verified rather than claiming completion.
5. Only then offer **one consolidated APK** with commit SHA, workflow run, artifact link, verified tests, and remaining Pixel 10 tests. Mark it a candidate until device acceptance.
6. Do not label intermediate successful GitHub builds as the approved complete release.

## Current certification

**NOT READY**. The latest REF changes are partially committed, and CI runs may be in progress. The presence of implementation code, individual successful workflows, or a working installed APK does not close this gate.
