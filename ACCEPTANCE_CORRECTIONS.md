# Orbit Notes — Build 7e881169 acceptance corrections

This file tracks corrections requested after Batches 1–7. The source branch is `v0.16-map-redesign`. **A source change or green CI workflow is not equivalent to Pixel 10 acceptance.** Do not modify `main`.

| Reference | Required acceptance check | Source implementation | Device acceptance |
| --- | --- | --- | --- |
| LIB-03-R1 | Maps sidebar uses the approved three-spoke branching vector | Updated `App.tsx` | Pending |
| LIB-04-R1 | Blue Dark-mode surfaces/highlight; white or high-contrast map/note text | `keepTheme.ts`, `App.tsx` | Pending |
| LIB-08-R1 | Minimum preview/card height approximately 10% lower; more space for complex maps; no clipping | `App.tsx` preview bounds | Pending |
| LIB-10-R1 | Contextual menus about 20% narrower and with 20% lower action spacing | `App.tsx` | Pending |
| LBL-06-R1 | Keep-style full-screen searchable checkbox assignment; create and assign labels | `App.tsx` | Pending |
| DEL-02-R1 | Restore history-clock icon matches supplied recording and is in Deleted selection header | `App.tsx` | Pending visual comparison |
| DEL-05-R1 | Deleted maps use interactive read-only viewer; gestures, focus, breadcrumbs, read content and collapse; no data mutations | `DeletedMapReader.tsx` | Pending |
| DEL-06-R1 | Deleted grid/list tracks Maps layout; no per-card date or Restore; duplicate titles remain separate | `App.tsx` uses batch IDs | Pending |
| DEL-11-R1 | Archive empty illustration and text match Keep-inspired style | `App.tsx` | Pending visual comparison |
| EDT-04-R1 | Blank formatted lines save/reopen without stray markup characters | `RichNoteEditor.tsx` | Pending |
| EDT-04-R2 | Underlined A formatting icon | `App.tsx` | Pending visual comparison |
| EDT-06-R1 | Slashed T clear-formatting icon | `App.tsx` | Pending visual comparison |
| COL-02-R1 | Default/no color swatch and selected check mark | `App.tsx` | Pending |
| COL-03-R1 | Exactly 20 presets: existing 12 plus two darker rows; no custom input; preserve legacy colors | `keepTheme.ts`, `App.tsx` | Pending |
| COL-05-R1 | Theme-dependent map/note/card colors | `keepTheme.ts`, `App.tsx` | Pending |
| COL-05-R2 | Label chips have a distinguishable shade against colored cards | `keepTheme.ts`, `App.tsx` | Pending |
| COL-12-R1 | Dark-mode map and note text readable on dark surfaces | `keepTheme.ts` | Pending |
| MAP-11-R1 | Both active map and Deleted reader mini-maps rotate with main map | `App.tsx`, `DeletedMapReader.tsx` | Pending |
| SEC-04-R1 | Local encrypted Backup and Restore retained, alongside independent app update migration | `OrbitSettings.tsx`, backup code preserved | Pending |
| REG-01-R1 | Unarchive appears only in archived card overflow and long-press selection overflow | `App.tsx` | Pending |
| REG-07-R1 | Settings Back returns to previous Maps/label/Archive/Deleted; theme uses 3 inline pills | `OrbitSettings.tsx` | Pending |
| REG-07-R2 | On/Off subtitle on Settings; App Lock uses sliding switch; no explanatory accessibility sentence | `OrbitSettings.tsx` | Pending |
| REG-07-R3 | PIN/Password rows with selected symbol and centered dimmed dialog via arrow | `OrbitSettings.tsx` | Pending |
| REG-07-R4 | Existing credential verified before replacement; PIN min 4 digits; password min 6 chars, no caps/restrictions | `OrbitSettings.tsx`, `appLock.ts` | Pending |
| REG-07-R5 | Sliding biometric switch; first biometric authentication, then credential fallback | `OrbitSettings.tsx`, `App.tsx` | Pending |
| REG-07-R6 | Backup & Restore dedicated screen without discarded explanatory text | `OrbitSettings.tsx` | Pending |
| REG-07-R7 | Settings Back preserves originating library page/filter/view state | Settings overlays library without resetting state | Pending |
| REG-07-R8 | Minimal lock screen, biometric-first with PIN/password instead | `App.tsx` | Pending |
| RELEASE-R1 | Logic, behavior, TypeScript, standalone release APK and emulator checks | GitHub Actions | Pending final consolidated run |
| RELEASE-R2 | User-device acceptance checklist, separate from automated checks | This file | Pending |

## Safeguards
- Keep all note data in local SQLite and preserve existing backup/restore functions.
- Do not add cloud services, note sharing, or PPTX export.
- Passwords and PINs are handled through SecureStore as salted hashed credentials, not raw persisted strings.
- Old user-selected custom colors remain stored and displayed even though new custom color input has been removed.
- Do not claim visual fidelity or user acceptance without a real-device check.
