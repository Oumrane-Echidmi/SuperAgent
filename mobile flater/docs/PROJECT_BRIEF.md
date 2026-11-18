# SuperAgent Android app

## Mission

Faithfully reproduce the existing AI Agent demo website in a separate Flutter app for Android. The website is the source of truth for every existing screen's layout, hierarchy, components, typography, colors, assets, content order, and navigation grouping. Adapt only as required for phone usability, and document differences.

The `architecture_project.md` describes business logic and requirements. Architecture requirements do not justify redesigning a captured screen. Conflicts and all new screens absent from the website must be presented for approval before implementation.

## Non-negotiable constraints

- The source website is `../` and must remain completely unchanged, including branding, source, assets, configuration, and lockfiles.
- The SuperAgent product identity applies only to this Flutter app.
- All nine existing screens are in scope: Home, Chat, Inbox, Board, Agents, Docs, Company Brain, Workflows, and Canvas.
- Preserve the approved compact navigation drawer based on the existing sidebar; do not introduce a bottom tab bar.
- Implement Home first, compare against the website at compact and large Android phone sizes, document adaptations and differences, and obtain visual approval before porting other screens.
- Architecture-only screens are new designs, not reproductions. Present their proposed layouts for approval before coding.
- Fixtures must be clearly identified as non-live. Never place provider secrets in the app.
- Report builds, tests, and visual comparisons only when actually run. Maintain exact progress and a continuation handoff.

## Product and source context

The parent workspace is a static website snapshot captured from `https://aiagent.app/demo`. Its README documents `node server.js` on port 4173. Other than sidebar navigation, most demo controls are inert. The product architecture proposes a Phase 1 cash-on-delivery order workflow with setup, simulation, approval, provider connections, publication, inbox, dashboard, takeover, and recovery. No backend/API implementation was found.

## Target

- Flutter / Dart, Android only.
- App directory: `superagent/`.
- No existing website file is to be changed.
