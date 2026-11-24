# Frontend parity implementation status

Work is in `mobile flutter/` (there is no `/mobile` directory). Frontend and backend files were not changed.

## Source and architecture audit

Inventoried frontend routes, page/component/data/style files, public brand assets and screenshots, mobile screens, workspace services, tests and fonts. The current web routes distinguish saved business screens from `/preview/*` fixture screens. Existing mobile prototype screens remain intact. Flutter uses `BusinessSession`, tenant-scoped `BusinessApi`, `WorkspaceScope`, named routes, and shared workspace widgets.

## Flow map and checklist

- Existing: register/sign in -> business selection -> Home -> Orders -> New order -> review/details -> explicit decision -> sheet delivery/reconcile. Profile owner edits and sign out remain intact.
- Added: drawer -> Docs / Company Brain / Agents / Workflows -> paginated records -> create/open -> validate -> save or archive -> refresh list. Owner permissions and expectedRevision preserved; uncertain requests keep their UUID and payload.
- Added: drawer -> Inbox -> add customer reference/language -> paginated conversations -> conversation -> paginated linked orders -> existing order details.
- Added: drawer -> AI chat -> select previous session or new chat -> model/language -> explicit OpenAI and optional MCP consent -> send -> refresh reply; retained message intent on uncertain responses.
- Added: drawer -> WhatsApp -> register Meta number -> inspect inbound messages and workflow replies -> refresh.
- Added: Connections browser OAuth callback, state validation, spreadsheet access inspection/tab selection, destinations and disconnect; Builder catalog/drafts, simulation, revision approval, generation, publication, pause/resume and run history. Builder chat links to the shared AI chat screen. Existing preview screens and Canvas now resolve with an explicit preview banner. AI replies refresh automatically while queued/running.
- Remaining: live provider end-to-end verification, production OAuth link association, comprehensive visual comparison and interaction audit of the reused legacy preview screens.

## Design system and components

Updated neutral black/gray surfaces, foreground, border, primary action, blue and pink tokens to frontend/src/styles/tokens.css. Existing Inter and IBM Plex fonts retained. Copied original brand images and used original mark in the drawer. Reused SAPage, WorkspacePage, WorkspaceCard, Intro, Notice, DataView and fieldDecoration. Added shared pagination and native workflow node/edge editor.

## API contracts

Uses existing tenant-scoped workspace-records, conversations, order-attempts, builder/models, builder/sessions, builder session messages, whatsapp-numbers, whatsapp-messages, and whatsapp-outbox endpoints. No backend modifications. GET requests can run concurrently; mutation locking remains in place. Reads discard responses after membership selection changes.

## Files

Added lib/workspace/{records,inbox,workflow_editor,assistant,whatsapp,builder,connections}.dart; lib/account/google_connection.dart; docs/GOOGLE_CONNECTIONS.md; tool/parity-visual.cjs; assets/brand/{logo,logo-mark-light}.png; test/{frontend_parity,workspace_parallel,records_widgets,builder_navigation,builder_widgets,google_connection}_test.dart. Updated lib/main.dart, lib/theme.dart, lib/account/business_session.dart, pubspec.yaml/lock, Android OAuth callback manifest/build settings, web callback bridge, and the existing workspace navigation test.

## Verification

`flutter pub get` passed. Full `flutter test`: 29 tests passed, including document validation/save at 320px and 430px, existing order and spreadsheet retry flows, session isolation, and parallel workspace reads. `flutter analyze`: no errors or warnings; eight informational lints remain (five in legacy cod/screens files and three brace-style suggestions). `flutter build web --release --no-wasm-dry-run` passed (63.4 seconds). Headless Chrome loaded the release sign-in screen at 390x844, reported no page errors, and captured build/verification/sign-in-current.png; the screenshot was visually inspected. No Android/iOS emulator or physical mobile device was listed; Windows, Chrome and Edge were available.

This is an incomplete parity implementation. New chat and WhatsApp API flows have not been exercised against a live configured AI/Meta provider. Do not treat endpoint wiring or the widget suite as complete end-to-end verification of every route.
