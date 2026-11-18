# Verification log

## Connected Flutter workspace — 2026-11-18

Current checks use Flutter 3.47.9 / Dart 3.13.7. The entries below are historical.

- `flutter test`: all 20 tests passed, covering account/session behavior,
  timezone date boundaries, integer money, retained retry IDs, tenant changes,
  phone layouts, reviewed decisions and explicit spreadsheet delivery/recovery.
  The added navigation test checks that only connected screens appear and a
  former preview route falls back to the live backend-powered Home screen.
- `flutter analyze lib/account lib/workspace lib/main.dart lib/theme.dart test tool/live_api_test.dart`:
  passed with no issues.
- `flutter analyze`: still reports five info-level findings in unchanged preview
  files (`cod_dashboard.dart`, `cod_inbox.dart`, `screens/inbox.dart`); exits 1.
  No findings were suppressed.
- `flutter build web --release --no-web-resources-cdn`: passed, including the
  Wasm dry run. The existing missing Cupertino icon font warning remains.
- `flutter test tool/live_api_test.dart`: passed against the real migrated local
  API and isolated PostgreSQL database. Verified registration, owner profile
  changes, idempotent order creation/decision replay, confirmed total of
  271.00 MAD, daily outcomes, sign-out and subsequent sign-in.
- `node tool/browser-smoke.mjs`: passed in isolated headless Chrome against
  `http://127.0.0.1:8080` and the same real API through its `/v1/` proxy.
  Registration, identity, outcomes, conversation, order attempt, reviewed
  confirmation and saved-order requests all returned their expected statuses;
  no browser page errors were recorded. The confirmation assertion uses the
  Flutter semantic label because rendered canvas text is not DOM text.
  The final run also checked that every removed preview menu entry is absent.
  Repeated test runs exhausted the isolated database's authentication counter;
  only exhausted local test counters were cleared before the successful rerun.
- Phone screenshots under ignored `build/verification/`: sign-in at 390px,
  Home at 320/390/430px, drawer at 430px and confirmed order at 430px. Visually
  inspected the compact Home, sign-in, drawer and confirmed order captures.
- `node --check tool/browser-smoke.mjs` and `git diff --check`: passed.

These checks create synthetic accounts/orders only in the isolated development
database. Provider features remain disabled; no live spreadsheet append or
WhatsApp operation was performed. Android SDK/device and APK verification remain
unavailable. No production deployment was performed.

## Account API foundation — 2026-11-18

The sections below this entry describe the original porting session and are
historical. Current verification used Flutter 3.47.9 / Dart 3.13.7 at
`C:\Users\imran\Downloads\Flutter\flutter`.

- `flutter pub get`: passed; resolved HTTP and the previously missing lint dependency.
- `dart format lib/account test`: passed.
- `flutter test`: all 12 tests passed. Coverage includes registration/identity
  bootstrap, selected-business profile writes, staff restrictions, failed login,
  failed identity loading, failed/retried sign-out, duplicate-action guards,
  authenticated 401 responses, local expiry with a late response, malformed and
  oversized responses, unsafe URLs, and real loopback redirect/timeout behavior.
- `flutter analyze lib/account test`: no issues.
- `flutter analyze`: five existing info-level findings in unchanged demo files:
  four `library_private_types_in_public_api` findings in `cod_dashboard.dart` and
  `cod_inbox.dart`, and one `prefer_if_null_operators` in `screens/inbox.dart`.
  The command exits 1; these findings have not been suppressed.
- `flutter build web --release`: passed, including its Wasm dry run. Build warned
  about a missing Cupertino icon font in the existing app.
- `git diff --check`: passed.

These tests do not verify live backend integration. The account API classes are
not wired into app navigation; new account-screen layout approval remains
pending. No account UI browser check or Android build/device test was performed.

## Source website

- `node server.js` — started successfully.
- `Invoke-WebRequest http://localhost:4173/` — HTTP 200; page title `Demo | AI Agent`.
- Chrome headless — captured Home and the eight saved routes at 390×844 CSS pixels, device scale factor 1; captured Home again at 430×932.
- Captures: `home-web-390.png`, `chat-web-390.png`, `inbox-web-390.png`, `board-web-390.png`, `agents-web-390.png`, `docs-web-390.png`, `company-brain-web-390.png`, `workflows-web-390.png`, `canvas-web-390.png`, `home-web-430.png` under session folder `C:\Users\PC\.copilot\session-state\6d9586bc-ca58-40c7-b7d4-6689c2867f5d\files\`.
- Observation: sidebar is hidden at phone widths without a visible menu; multiple existing page layouts clip horizontally.
- Temporary server stopped; port 4173 confirmed closed afterward.
- Website files have not been intentionally changed. No Git metadata exists in the workspace.

## Toolchain installation

- Initial check: `flutter`, `dart`, `adb`, `java`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `JAVA_HOME` unavailable.
- Official Flutter stable 3.50.0 archive expected size: 1,868,535,132 bytes; official SHA-256 will be validated before extraction. Transfer is slow and still in progress.
- Eclipse Temurin JDK 17 zip verified: SHA-256 `98518ecf554465057ee5509462631deeee374bc368c12a411d225cd29381f84b`.
- Android command-line tools (latest) verified: SHA-1 `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d`. Its wrapper stalls while downloading a replacement Android CLI; switched to verified legacy SDK manager 19.0 (SHA-1 `54a582f3bf73e04253602f2d1c80bd5868aac115`), download/extraction pending.
- No Flutter format/analyze/tests/build or app visual comparison has run.

## Per-screen status

| Screen | Status |
|---|---|
| Home | In progress only after representative implementation; currently not started |
| Chat | Not started |
| Inbox | Not started |
| Board | Not started |
| Agents | Not started |
| Docs | Not started |
| Company Brain | Not started |
| Workflows | Not started |
| Canvas | Not started |

No screen is visually verified.
