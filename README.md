# Orbit Notes — Android (v0.16 development)

Orbit Notes is a single-user, offline React Native / Expo Android note-taking application with a circular hierarchy map, a local note editor, labels, archive and seven-day Deleted recovery.

## Data and privacy
- Notes, hierarchy, labels and preferences remain on-device in SQLite and local application storage.
- No cloud sync, accounts, sharing, collaboration, network backend or telemetry.
- Personal encrypted backup and password-protected restore remain available. Verify a backup on disposable data before depending on it.
- PDF export supports single maps and several maps in one PDF. PPTX export is not supported.
- App Lock supports PIN/password and optional biometric authentication.

## Checks

```sh
npm install
npm run test:logic
npm run test:behavior
npm run typecheck
npx expo run:android
```

Use the GitHub Android workflow to build the installable APK. Its advisory emulator smoke test does not replace real-device Pixel 10 acceptance testing.

The map layout, zoom and rotation require device testing. Test encrypted backup/restore with disposable data. Existing data is not migrated or removed by routine application UI changes.

## Notes

The local PDF save flow uses Android Storage Access Framework and Base64 transfers, which can increase memory use for very large exports. SQLite note content is not separately encrypted at the application database layer; Android device protections apply.
