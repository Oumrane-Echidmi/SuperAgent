# Connected account and API layer

The account/session foundation is wired into the Flutter application. The user's
instruction to follow `frontend/` supplies the screen and behavior reference;
the earlier isolated account-screen proposal is superseded.

`lib/account/business_api.dart` provides bounded JSON transport. It accepts a
trusted HTTPS base URL ending in `/v1/`, or loopback HTTP for development. Paths
remain relative; query values are encoded separately. Redirects are rejected,
requests abort after 20 seconds, and response bodies are limited to 1 MiB. There
are no automatic retries or raw diagnostic messages exposed to the user.

`lib/account/business_session.dart` exposes a `ChangeNotifier` with `signedIn`,
`email`, `tenants`, `tenant`, `busy` and `notice`. The bearer token is private and
memory-only. Registration/sign-in establishes identity through `GET /v1/me`.
Local expiry and authenticated 401 responses clear identity and memberships;
late requests cannot restore expired sessions. Failed sign-out preserves the
session for an explicit revocation retry. Business actions are serialized and
the app disables navigation/business switching while pending.

`request(resource, method:, body:, query:)` scopes operations to the selected
business. `createOrder(intent)` holds the action guard across conversation and
attempt creation. The form retains both UUIDs and immutable details across
uncertain retries. Decision requests retain their UUID, evidence, reviewed
revision and summary hash; delivery retries retain the same job UUID. Staff
profile edits are blocked locally, and the backend enforces all permissions.

`api_config.dart` reads compile-time `SUPERAGENT_API_URL`; web defaults to the
current origin's `/v1/`, and native defaults to local loopback. The local Node
server and Docker nginx template provide the web proxy. Android's main manifest
includes Internet access; cleartext loopback is allowed only in debug resources.

The app resets its navigator when the account or business changes, discarding
loaded profiles, order views and forms. `WorkspaceScope` exposes the session to
screens and navigation. The mobile app exposes only connected workspace screens;
auxiliary demo imports, routes and menu entries have been removed.

Source contracts: `../backend/src/identity-routes.ts`, `cod-routes.ts`,
`cod-dashboard.ts`, `sheet-delivery-routes.ts` and `sheet-job-routes.ts`.
UI references live under `../frontend/src/pages/` and `components/DeliveryPanel.jsx`.
See [CONNECTED_WORKSPACE.md](CONNECTED_WORKSPACE.md) for the capability map.

Implementation references: [Flutter networking](https://docs.flutter.dev/cookbook/networking/fetch-data),
[HTTP client cancellation and testing](https://pub.dev/packages/http),
[timezone data](https://pub.dev/packages/timezone), and
[UUID generation](https://pub.dev/packages/uuid).
