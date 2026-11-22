# Orbit Notes v1.0.0 — Stable

Orbit Notes v1.0.0 is the first accepted stable Android release, based on the Pixel 10 acceptance-tested v0.16.0 RC2 commit `81be7649448a0fc82257bd121d09747560dc0ad2`.

## Included
- Offline, local-only map and rich-text note storage; no accounts, cloud sync or sharing
- Circular hierarchical maps, rotate/pan/zoom, Expand/Collapse and library search
- Labels, colours, archive and seven-day whole-map Deleted recovery
- Five-second Undo for permanent branch deletion
- Separate recovery and permanent deletion of each simultaneously deleted map
- Biometric-first optional App Lock with PIN/password fallback
- Encrypted manual backup and restore, and PDF-only export preserving node colours

## Upgrade and verification
- Android package: `com.orbitnotes.prototype`
- App version: `1.0.0`; Android versionCode: `19`
- Install on top of the existing APK; **do not uninstall**, since data is stored locally
- Create an encrypted backup before upgrading
- The release artifact is the release-mode APK produced by the validated `main` workflow
- Initial stable acceptance: Pixel 10 testing of v0.16.0 RC2 passed; v1.0.0 changes are version metadata and release automation

## Development policy
`main` and the `v1.0.0` tag are the stable baseline. Build future changes from the v1.0.0 commit on a separate development branch. Do not modify the v1.0.0 tag.
