# SuperAgent Flutter workspace

Flutter mobile and web client based on the React app in `../frontend`, connected
to the existing Express/PostgreSQL API in `../backend`.

## Connected screens

- Registration, sign-in, business selection and sign-out; sessions stay in memory.
- Home: actual daily outcomes in the business timezone, confirmation rate,
  confirmed value and spreadsheet sync counts.
- Orders: paginated pending/confirmed/declined board, new-order form, saved
  summary review and customer decisions tied to the reviewed revision and hash.
- Business profile: language, timezone and description; staff have read-only access.
- Spreadsheet delivery for owners: existing destinations, row review, explicit
  job queueing, job status and read-only reconciliation for uncertain deliveries.

The mobile menu contains Home, Orders and Business profile. Example and preview
screens have been removed from app navigation and routing; each remaining screen
uses the authenticated backend. Automated WhatsApp operations and Google
account/file setup are not implemented by this client.

The UI uses the frontend's Inter font, stone palette, field borders and button
shapes. Phones use a drawer, stacked order groups and responsive metric cards.
Inter's license is included in `assets/fonts/Inter-LICENSE.txt` and the app bundle.

## Run the backend

Follow the [repository setup](../README.md#getting-started): install Node dependencies,
configure the ignored `backend/.env`, start PostgreSQL, apply migrations and run
the API on `127.0.0.1:3000`. Provider-dependent operations also need the existing
backend configuration and workers described there. Never put provider secrets or
database credentials in Flutter defines or assets.

## Run Flutter web locally

From this directory, with Flutter installed:

```sh
flutter pub get
flutter build web --release --no-web-resources-cdn
node tool/serve-web.mjs
```

Open **http://127.0.0.1:8080** and create a workspace or sign in. The Node server
serves `build/web` and proxies `/v1/` to `http://127.0.0.1:3000`. This keeps API
requests on the same browser origin without changing backend CORS settings.
`PORT` changes the web port; `SUPERAGENT_PROXY_TARGET` changes the trusted upstream
origin. It accepts HTTPS or loopback HTTP and does not log credentials or bodies.
The web build serves its own rendering assets rather than requiring a CDN.

For hot reload, a separate `flutter run -d chrome` origin needs an equivalent
development proxy; the compiled-build command above works without CORS changes.

## Android

With the Android SDK/JDK, a connected device or emulator and the API running:

```sh
adb reverse tcp:3000 tcp:3000
flutter run --dart-define=SUPERAGENT_API_URL=http://127.0.0.1:3000/v1/
```

`adb reverse` makes device loopback reach the local API. Only the debug manifest
allows cleartext requests to `127.0.0.1`/`localhost`; release builds need a trusted
HTTPS endpoint:

```sh
flutter build apk --dart-define=SUPERAGENT_API_URL=https://your-api.example/v1/
```

The URL must end with `/v1/`. Native requests use the bearer API directly; web
deployments should use the same-origin proxy. No Android build or device run has
been verified in this workspace because the Android SDK is unavailable.

## Docker web build

```sh
docker build -t superagent-mobile .
docker run --rm -p 127.0.0.1:8080:80 superagent-mobile
```

The nginx template proxies `/v1/` to `http://host.docker.internal:3000` by default.
Set `API_UPSTREAM` to the trusted API origin for your deployment. On Linux, use
`--add-host=host.docker.internal:host-gateway` when targeting the Docker host and
ensure the API is reachable from the container. Use HTTPS for external access.

## Checks

```sh
flutter test
flutter analyze lib/account lib/workspace lib/main.dart lib/theme.dart test tool/live_api_test.dart
flutter build web --release --no-web-resources-cdn
```

The explicit real-backend check creates synthetic accounts and orders in your
configured development database:

```sh
flutter test tool/live_api_test.dart
```

Set `--dart-define=SUPERAGENT_TEST_API=https://your-test-api.example/v1/` to use a
different dedicated test API. It is intentionally outside unit-test discovery.

For isolated headless Chrome verification, install the frontend's locked tools
with `npm --prefix ../frontend ci --ignore-scripts`, start the backend and web
server, then run `node tool/browser-smoke.mjs`. This creates a synthetic account
and order and stores phone screenshots under ignored `build/verification/`.

See [connected workspace scope](docs/CONNECTED_WORKSPACE.md),
[API/session details](docs/ACCOUNT_INTEGRATION.md) and
[verification evidence](docs/VERIFICATION.md).
