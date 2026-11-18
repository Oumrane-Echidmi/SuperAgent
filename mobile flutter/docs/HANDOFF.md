# Handoff

## Current work — 2026-11-18

Branch: `feature/flutter-business-account`.

Flutter now follows the connected React frontend: authentication gate, live
daily outcomes, paginated orders, order creation/review/decisions, owner/staff
profiles, and explicit spreadsheet delivery controls. The user subsequently
requested removal of examples: navigation now contains only Home, Orders and
Business profile, and demo routes/imports are removed. The user explicitly
requested this frontend/backend alignment; no
account-screen layout approval remains pending.

Code: `lib/account/`, `lib/workspace/`, `lib/main.dart`, `lib/theme.dart`.
Connection tooling: `tool/serve-web.mjs`, nginx template, Dockerfile and Android
Internet/debug loopback configuration. The frontend Inter font is converted to
TTF, included with its license, and applied alongside the frontend design tokens.

The local backend was initialized with an ignored `backend/.env` containing
generated random credentials. PostgreSQL uses isolated Compose project
`superagent-mobile-local`, its own volume and loopback port 5433. Migrations have
been applied. Do not print or commit the environment. Provider features are
disabled. Verification leaves synthetic test accounts/orders in this isolated
development database; it performs no provider writes.

Run the API from `backend` with
`node --env-file=.env --experimental-strip-types src/server.ts`.
Run the compiled web app from this directory with `node tool/serve-web.mjs` and
open `http://127.0.0.1:8080`. See README for build and Android commands.

Flutter SDK: `C:\Users\imran\Downloads\Flutter\flutter`, Flutter 3.47.9 /
Dart 3.13.7. SDK/cache and headless browser commands may need sandbox approval.
The Android SDK is unavailable, so no APK/device verification is claimed.

See [VERIFICATION.md](VERIFICATION.md) for exact current check results. Earlier
entries there and old project-brief source paths describe the original demo port,
before this repository contained a working React frontend and backend.

Continuation completed the verification pass: all 20 Flutter tests, scoped
analysis, release web build, explicit real-backend test and headless Chrome order
flow pass. The browser assertion now reads Flutter's semantic confirmation label
instead of searching for DOM text. Screenshot evidence is in ignored
`build/verification/`. Full analysis retains five historical preview findings;
the web build retains its historical missing Cupertino icon font warning.

The local database, API and web server were restarted for verification. Android
SDK/device checks and actual provider operations remain unverified. The earlier
approval gates and not-started statuses in `IMPLEMENTATION_PLAN.md` are historical;
the connected workspace scope above supersedes them.
