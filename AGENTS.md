# Orbit Notes — AI Coding Agent Instructions

## Repository safety and scope
- Only implement development changes on `v0.16-map-redesign` unless the user explicitly authorizes a different development branch.
- **Never change, reset, rebase, merge into, or overwrite `main` or the stable `v0.15.1` release.**
- Treat this as an Expo SDK 54 / React Native Android application, **not** a web browser application.
- Preserve existing user data and behavior. Keep changes small, focused, and reversible.

## Offline and privacy guarantees
- Orbit Notes is single-user and fully offline/on-device. No cloud APIs, sync, hosted services, sign-in/accounts, remote storage, analytics, or application telemetry.
- No note sharing, portable sharing workflows, or collaboration. Preserve local personal backup/restore and PDF export. Do not reintroduce PPTX export.
- Keep SQLite and platform-secure local storage behavior intact. Do not add internet permissions or network access for runtime functionality.
- Development-time code checks and GitHub Actions may fetch tooling/dependencies; this does **not** authorize network use in the shipped application.

## Modern Web Guidance: coding-time reference only
- Official source: https://github.com/GoogleChrome/modern-web-guidance
- For web-specific development (if introduced deliberately), use the official skill's search and retrieve workflow, typically:
  `npx -y modern-web-guidance@latest search "focused UI pattern"`
  `npx -y modern-web-guidance@latest retrieve "matching-guide-id"`
- Guidance is **optional and conditional for React Native**. Apply only transferable principles (accessibility, layout, design, input behavior, animation, responsiveness, performance), and validate against the actual supported React Native / Expo APIs.
- Never import HTML, DOM, CSS, browser-only web platform APIs, or web polyfills into native Android components. Browser support tables do not establish Android React Native support.
- Favor existing native components, gesture-handler, Reanimated, React Native SVG and Expo APIs. Do not add runtime dependencies merely to adopt a web feature.
- Do not copy the upstream guidance repository into the app, run an automatic legacy rewrite, or install its package as an application dependency.
- The external skill is **not automatically installed** by this file. A separate supported coding-agent environment must install it if desired.


## Impeccable: native UI design guidance
- Official source: https://github.com/pbakaus/impeccable ; documentation: https://impeccable.style/docs
- Adopt Impeccable's **native Android / Material 3 design principles** for UI critique, audit, polish, layout, typography, accessibility, responsiveness, and interaction feedback in Orbit Notes.
- This project is **React Native on Android**, not a browser. When running Impeccable in a compatible coding agent, set the project platform to `android` in `PRODUCT.md` (or use `adaptive` only if iOS is deliberately added later).
- Use `impeccable critique`, `audit`, `adapt`, and `polish` as **review workflows**, not automatic rewrites. Review concrete app screens/components and translate suggestions to supported React Native/Expo APIs.
- Impeccable's HTML/CSS detector, live browser mode, and web-only edit hooks **do not validate native Android UI**. Do not enable browser hooks or bypass approvals/sandboxing for this app.
- Do not add Impeccable to app runtime dependencies, ship its binaries in the APK, or add network functionality. The project-local skill files are vendored below; an actual coding agent must load them before its commands become usable.
- Keep current v0.16 functional and regression work first; use Impeccable primarily for targeted design reviews and polish, and never let design suggestions silently change behavior.


## Installed Impeccable Codex skill
- The complete upstream Impeccable v4.9.2 Codex skill is vendored at `.agents/skills/impeccable/`, copied exactly from upstream commit `d41d9860b0094dcb68030657da63461212835aaa` (69 files including references, agents, and scripts).
- In a Codex environment that discovers project-local skills, invoke `$impeccable` and its native Android workflows (e.g. `critique`, `audit`, `adapt`, `polish`). The skill requires that environment to load/reload it; placing files in GitHub alone does not activate commands in ChatGPT or run the skill launcher.
- Use the already established offline Android project constraints as product context. Before any tool-assisted UI work, create/review `PRODUCT.md` with `## Platform\nandroid` through the skill's supported init flow; do not replace existing app code or design automatically.
- The launcher may fetch a development-only binary once when used by a compatible agent. Such downloads are unrelated to the shipped app and must not be treated as permission to add runtime networking.
- Avoid browser-only live mode, HTML/CSS detection hooks, and auto-apply behaviors for this React Native project; developer review and normal tests remain required.

## Change and regression discipline
- First inspect affected code, existing tests, and unresolved v0.16 issues. Avoid unrelated refactoring.
- Validate with `npm run test:logic`, `npm run test:behavior`, and `npm run typecheck`; then check the Android APK workflow if relevant.
- Report test failures and any checks that could not run. Do not report an APK as installable unless a successful GitHub Actions run contains the actual `Orbit-Notes-Android-APK` artifact.
- Keep release branch and stable APK untouched.
