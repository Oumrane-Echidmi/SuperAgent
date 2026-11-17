# Verification log

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
