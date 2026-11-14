# Orbit Notes v0.12 — Android-only development build (not release-ready)

An offline, single-user Expo/React Native note-taking prototype. No cloud services, accounts, collaboration, or share sheet. Android SAF is used for local PDF/PPTX exports and encrypted personal backups.

## New in v0.12

- Password-encrypted portable backups (`.orbitbackup`) using AES-256-GCM, PBKDF2-HMAC-SHA256 (210,000 iterations), random 16-byte salt and 12-byte nonce. The password is never saved. User chooses an Android folder. A local document picker reads backups for restore.
- Restore requires explicit replacement confirmation, authenticates/decrypts and validates the snapshot before saving it to SQLite. Wrong passwords fail without replacing the notebook.
- PIN verifier now includes a random device-held SecureStore secret, reducing offline attacks against a copied PIN hash. This does not encrypt the SQLite database. No old PIN migration is included; intended for a fresh installation.
- Focus navigation animates toward a tapped child before resetting the view to the newly focused branch.
- Existing differential SQLite writes, local exports, trash, hierarchy validation, and Android-only configuration remain.

## Important limitations

**Not verified as an Android release.** npm dependency installation timed out in the execution environment; a complete TypeScript build, APK build, and device-level integration tests have not run. Backup encryption and restore have not been validated on Android hardware. The crypto libraries and Expo modules must be installed and checked before trusting the backup flow.

**Not encrypted at rest.** SQLite note contents are plaintext inside the app sandbox; Android device encryption protects storage at the OS layer. Full SQLCipher/Keystore database encryption is a separate native integration not completed here.

The PDF/PPTX Android SAF writer still transfers the entire file in Base64, so very large exports can use considerable memory. Explicit overwrite handling depends on the document provider. Large-graph virtualization, deep overview rendering, complete module decomposition, and production-grade Android UI testing remain outstanding. The PIN verifier is not a slow KDF; it relies on the SecureStore secret for protection against copied-hash attacks.

## Development

```sh
npm install
npm run test:logic
npm run test:behavior
npm run typecheck
npx expo run:android
```

Run on a physical Android device and test: create/edit notes, crash/relaunch persistence, app lock, backup round-trip with the correct and wrong passwords, restore replacement, PDF/PPTX file creation and opening, and cancellation/low-storage cases. Use disposable notes until these tests pass.
