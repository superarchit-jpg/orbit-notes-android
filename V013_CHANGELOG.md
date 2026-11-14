# Orbit Notes v0.13 — beta source update

Changes from the v0.12 source:
- Android safe-area-aware layout and wrapping toolbars.
- Library menu opens at launch; + New map action in Library.
- Blank new note titles with Heading placeholder.
- Double-tap opens editor; one tap focuses a node.
- Prong marks indicate child connections; a small ≡ indicates a description.
- Parent circle and dotted + child circle integrated into the map.
- Two-finger rotation, pinch zoom, drag pan and reset rotation.
- PDF exporter uses paginated SVG radial maps and accompanying descriptions.
- PPTX exporter repairs OOXML slide-master ordering and theme styles.

## Validation status
TypeScript syntax transpilation and existing JavaScript tests were run locally. The Expo Android APK and PowerPoint compatibility **have not been tested on a device**. Please test both exports with representative nested maps before relying on them.

## Phone-only deployment
GitHub mobile browser > repository > Add file > Upload files. Upload the extracted source files, including `.github/workflows/android-apk.yml`, to the matching paths. GitHub's web upload may not preserve directory hierarchy automatically; a Git client or GitHub web editor may be needed. After commit, Actions builds the APK.

Since your current notes are disposable, uninstalling the previous app before installing a differently signed APK is acceptable. The app package remains `com.orbitnotes.prototype`.
