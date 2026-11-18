# Handoff

Run: C:\src\flutter\bin\flutter run -d web-server --web-port 8099 (Flutter stable cloned to C:\src\flutter; web+android platforms generated).

Built (flutter analyze: no errors in lib/): Home, Chat, Inbox, Board, Agents, Docs, Company Brain, Workflows, Canvas, plus COD Phase 1 screens in lib/cod (dashboard, builder, review/publish, connections, WhatsApp inbox) with demo fixtures.

Verified: web build served; Home, COD dashboard and Board visually checked in Chrome. NOT verified: other screens, visual diff vs website, Android build (no Android SDK), compact/large phone sizes.

Known gaps: Board tab filters inert (TabStrip uncontrolled); Board Done column and Brain graph edges/log are invented demo data; Inbox has 20 of the website rows; Android SDK/JDK not installed; no live backend.
