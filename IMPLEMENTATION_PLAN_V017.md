# Orbit Notes v0.17 — Approved redesign and release roadmap

Status: implementation in progress on `v0.16-map-redesign`. Never modify `main` or the stable `v0.15.1` artifact without a separate explicit release approval.

## Contract
Android-only, personal, fully offline. Existing SQLite notes, labels, trash, hierarchy, local encrypted backup/restore, PIN/biometric features, gestures and PDF export must remain intact. No cloud, sharing, accounts, collaboration, telemetry, Reminders, Archive, or new features except the specifically approved changes below. The latest change request supersedes older checklist behavior: remove interactive checklists while retaining stored note text.

## Implementation batches and acceptance

### A. Library (UI-01..06)
- Increase diagram preview height/width and reduce wasted padding without modifying world geometry.
- Remove last-updated date/time from **card and list presentations only** (retain timestamps in the database for sorting).
- Masonry-style independent-height cards based on map complexity; preserve performant scrolling and separate list layout.
- Distinguishable Material list/grid icon paths; neither resembles navigation drawer.
- Keep only Modified, Title A–Z, Created sorting; expose with native/Keep-inspired compact menu, do not invent sort behavior.
- Refine search bar, label chips, and card rhythm.
- Acceptance: mixed-size maps produce nonuniform card heights; no clipping, pin remains visible; sorting/search/selection work.

### B. Map (MAP-07..12 and decisions)
- Compact one-line zoom, +/- , branch toggle and node palette controls; maintain >=48 dp touch targets.
- Replace all color controls with palette icon; replace expand/collapse with clearly stateful icon and screen-reader label.
- Return mini-map to a bottom panel, with manageable height, not a floating viewport overlay.
- Replace native Alert for gesture instructions with coherent in-app sheet.
- Remove Settings entry from map/notes menus; only accessible via drawer.
- Remove Focus mode and Reset rotation actions; retain Center focused note, unchanged.
- Acceptance: whole-map and branch gestures, zoom reference, Fit, camera focus, child persistence, mini-map, PDF export still work.

### C. Navigation (NAV-07..13)
- Full-height drawer covers header/status-bar-safe content and dims the app behind it.
- Keep Orbit Notes title placement; remove its explicit X button. Close via outside tap, swipe and Android Back.
- Rename entry to Settings, maintain no new destinations.
- Edit existing label name; delete label only after explicit confirmation; maps become unfiled, never deleted.
- Keep drawer motion native and respect accessibility / reduced-motion settings.
- Acceptance: labels and maps survive restart, rename/delete preserves notes, selection and filters update, drawer works with Back.

### D. Editor (EDIT-08..11 and checklist removal)
- Provide bulleted and numbered list formatting with no interactive checkbox creation or toggle.
- Keep/upgrade Bold, Italic and add Underline with Keep-style Material icons and visible style application.
- Preserve existing checklist marks as stored literal text, do not drop them or alter old data during migration.
- Preserve autosave, draft semantics (Done/Back saves even empty child, X discards only new draft), keyboard insets.
- Acceptance: formatting survives restart, export/backup preserve literal text, no checklist actions.

### E. Security/settings (SEC-01..02, SET-05)
- Separate configured PIN storage from enabled/disabled app lock state. Disabling keeps credentials.
- Allow re-enable without choosing PIN again, and explicit secure Change PIN and Delete PIN actions.
- Require current PIN verification before change/delete to protect stored secrets; never display stored PIN.
- Keep biometric unlock behavior coherent with enabled state.
- Keep existing encrypted backup and restore unchanged; settings groups use approved Material-inspired design.
- Acceptance: configure -> disable -> enable, change, delete, lock, biometric, device restart, legacy persisted configuration.

### F. Integrated scope cleanup and tests
- Update source-assertion checks that reference removed labels/buttons.
- Write executable functional tests where possible, alongside typecheck and build workflow.
- Three-pass: (1) change-scoped source review, (2) logic/behavior/typecheck, (3) Android release build and emulator smoke tests, followed by Pixel 10 real-device acceptance.
- Fail = correct and rerun; no promotion while the combined release is failing.

## Impeccable Android design follow-up (Stage 3B)
- Project-local Impeccable v4.9.2 is present under `.agents/skills/impeccable` but its presence does not mean automated commands ran.
- Use native Material 3 `critique` / `audit.native` / `adapt.native` / `polish` principles; inspect actual device screenshots for light/dark, font scaling, 48dp targets, TalkBack labels, navigation, contrast, motion and truncation.
- Review for inconsistencies; only implement changes within approved scope without new approval. Record and propose any additional functionality/appearance.
- Keep PRODUCT.md / DESIGN.md truthful when adopted; do not install skill binaries in the Android app.

## Modern Web Guidance (Stage 4)
- Official `GoogleChrome/modern-web-guidance` is a development reference, not a React Native runtime dependency. The external skill has **not been activated** simply by AGENTS.md.
- Transfer only platform-appropriate guidance on accessibility, layout, input, animation, resilience and performance after validating with Expo/React Native/Android docs.
- Avoid DOM, CSS, browser-specific hooks, web polyfills and web-only testing. Mobile design-system suggestions (React Native Paper/Restyle) require separate approval before dependency or component changes.
- Unslop is deferred and optional; do not run or install it automatically.

## Regression/performance and remaining technical debt (Stage 5)
- Re-run earlier 24/24 device scenarios and two prior targeted fixes (pinned badge, child draft).
- Required: SQLite persistence/restart, deleted/restore, labels, map geometry at depths 1–5+, 10/50/100+ nodes, no jitter/clipping, zoom/rotation/focus, overflow menus, edit formatting, note colors, screenshots, theme, app lock/PIN/biometrics, encrypted backup/restore, multi-map PDF export/large file edge cases.
- Revisit previously identified EXP-03 large-file PDF optimization and TEST-01 automated Android UI tests as **separate audited work items**; no unapproved feature additions.
- Inspect and prioritize unresolved native performance and deep-map layout work; do not silently modify map geometry.
- Run real Pixel 10 acceptance; emulator alone cannot close the stage.

## Candidate release (Stage 6)
- Freeze approvals and regression baseline; produce a reproducible release APK; verify checksum, package identity/signing and upgrade preservation from current installed app.
- Record build ID, commit SHA, artifact URL, test outcomes, known issues and rollback instructions.
- Stable v0.17 promotion / merging to `main` is a separate explicit decision by the user.

## Current status
- Stage 1 and original Stage 2 baseline previously passed.
- Stage 3A newly authorized; code and CI execution are pending for items not individually marked complete in later commits.
- Stage 3B, Stage 4, Stage 5, Stage 6 are not claimed complete.
