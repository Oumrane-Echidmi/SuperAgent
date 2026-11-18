# SuperAgent

**One workspace for your shop’s orders, customer decisions, and daily outcomes.**

SuperAgent helps Moroccan shops manage cash-on-delivery operations through a React web app and a Flutter mobile client, backed by a shared TypeScript API and PostgreSQL database. The platform also provides scenario validation, Builder draft review, and optional Google Sheets delivery.

[Getting started](#getting-started) · [Screenshots](#screenshots) · [API reference](docs/API.md) · [Developer guide](docs/DEVELOPMENT.md) · [Architecture](ARCHITECTURE.md)

## What you can do

| Area | Available today |
| --- | --- |
| Business workspace | Register, sign in, select a business, and manage its language, timezone, and description |
| Cash-on-delivery orders | Record orders, review saved summaries, and capture customer decisions against the exact reviewed revision |
| Daily outcomes | View pending, confirmed, and declined orders, confirmation rate, confirmed order value, and outstanding spreadsheet sync |
| Spreadsheet delivery | Review a confirmed order’s row, select an existing destination, explicitly queue delivery, and reconcile uncertain outcomes |
| Workflow foundation | Discover versioned capabilities, validate graphs and bindings, release admin scenarios, and simulate and approve tenant drafts through the API |
| Scoped AI Builder | Optional queued scenario matching and Builder chat, with explicit consent and a separate worker |

The mobile app exposes connected Home, Orders, and Business profile screens. The web app also retains clearly labelled preview pages. Builder/catalog screens, Google account/file setup, verified WhatsApp intake, and automated Business Agent execution remain future work. Workflow approval does not activate a running agent.

## Screenshots

Actual local app captures using synthetic shop and order data. The mobile captures show the Flutter web build at a phone viewport; they are not Android device captures.

### Web workspace

![SuperAgent web dashboard showing daily COD outcomes](docs/screenshots/web-dashboard.png)

![SuperAgent web order board with pending, confirmed, and declined orders](docs/screenshots/web-orders.png)

### Mobile workspace

<p>
  <img src="docs/screenshots/mobile-dashboard.png" width="300" alt="Flutter mobile dashboard with live shop outcomes" />
  <img src="docs/screenshots/mobile-order.png" width="300" alt="Flutter mobile order details with reviewed prices and confirmed status" />
</p>

## Technology

| Layer | Stack | Source |
| --- | --- | --- |
| Web | React 19, Vite, React Router | [`frontend/`](frontend/) |
| Mobile | Flutter, Dart | [`mobile flutter/`](mobile%20flutter/) |
| API | Node.js 24+, Express 5, TypeScript, Zod | [`backend/src/`](backend/src/) |
| Data | PostgreSQL 18, tenant row policies, numbered SQL migrations | [`backend/migrations/`](backend/migrations/) |
| Optional services | Google OAuth / Sheets, OpenAI-backed Builder, separate workers | [API configuration](docs/API.md#background-sheets-delivery-jobs) |

## Getting started

### 1. Start the database and API

Install Node.js 24 or newer, npm, and Docker with Compose. From the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
```

In `backend/.env`, replace `POSTGRES_PASSWORD` and `APP_DATABASE_PASSWORD` with separate random passwords and update the matching credentials in `ADMIN_DATABASE_URL` and `DATABASE_URL`. Keep optional provider flags disabled for a local workspace without external services. Real environment files are ignored by Git.

```sh
docker compose --env-file backend/.env up -d --wait
npm run db:migrate
npm run dev
```

The API runs at `http://127.0.0.1:3000`; PostgreSQL is exposed on loopback port `5433`. `GET /healthz` checks process liveness. Migrations use an administrative connection; the API requires its separate restricted runtime role.

On PowerShell, use `Copy-Item backend/.env.example backend/.env` instead of `cp` if needed. On machines where PowerShell blocks npm scripts, use `npm.cmd`.

### 2. Run the web app

In another terminal:

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run dev
```

Open **http://127.0.0.1:4173** and create a workspace. Vite proxies `/v1/` to the local API. Sessions stay in memory, so refreshing requires signing in again. See the [web guide](frontend/README.md) for production proxy requirements and test setup.

### 3. Run the Flutter app

Install Flutter, then run:

```sh
cd "mobile flutter"
flutter pub get
flutter build web --release --no-web-resources-cdn
node tool/serve-web.mjs
```

Open **http://127.0.0.1:8080**. The local server forwards `/v1/` to the same backend. For Android, use the [mobile setup guide](mobile%20flutter/README.md#android), `adb reverse` during local development, and an HTTPS API URL for releases. Android APK/device verification is still pending.

## API and development documentation

| Document | Use it for |
| --- | --- |
| [API reference](docs/API.md) | Authentication, permissions, endpoint contracts, request examples, errors, retries, provider configuration, and worker behavior |
| [Developer guide](docs/DEVELOPMENT.md) | Finding the right files, tracing requests, changing backend or client code, migrations, and validation commands |
| [Architecture](ARCHITECTURE.md) | Target platform design, execution boundaries, and future scope |
| [Backend security](backend/SECURITY.md) | Tenant isolation, credentials, service roles, and data handling |
| [Web guide](frontend/README.md) | Connected pages, previews, proxy setup, and browser tests |
| [Mobile guide](mobile%20flutter/README.md) | Flutter setup, Android connectivity, Docker, and integration checks |

### Quality checks

```sh
# Backend: unit/protocol tests, type checking, compilation
npm test
npm run typecheck
npm run build

# Web: unit tests and production build
npm --prefix frontend test
npm --prefix frontend run build
```

Database integration and browser tests require a separate migrated `superagent_test` database. Flutter has its own test and analysis commands. See [testing and verification](docs/DEVELOPMENT.md#testing-and-verification) before running those suites.

## Project status

The connected order workspace is available for local development. Optional provider features require explicit configuration, consent, and worker processes. Google setup UI, WhatsApp automation, and durable automated workflow execution are not complete. Existing development-tool findings and Flutter verification limits are recorded in the [web guide](frontend/README.md#dependency-finding) and [mobile verification log](mobile%20flutter/docs/VERIFICATION.md).

## Team

Built by the SuperAgent team. Special thanks to:

- [Oumrane Echidmi · @Oumrane-Echidmi](https://github.com/Oumrane-Echidmi)
- [Salah Makboul · @salahmakboul](https://github.com/salahmakboul)

## License

Released under the [MIT License](LICENSE).
