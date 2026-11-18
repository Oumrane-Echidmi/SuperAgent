# Flutter workspace aligned with the React frontend

## Scope and contract

The user requested that Flutter follow `frontend/` and connect to the backend.
This supersedes the earlier proposal to add only an isolated account screen:
the existing React screens now supply the layouts and behavior to adapt.

| Slice | React reference | Flutter behavior |
| --- | --- | --- |
| Identity | `SignInPage`, `WorkspaceContext` | Registration/sign-in gate, memory-only sessions, tenant selection and sign-out |
| Home | `LiveHomePage` | Today's outcomes in the business timezone, six metrics and quick actions |
| Profile | `BusinessProfilePage` | Language, timezone and description; staff read-only |
| Orders | `OrdersPage`, `NewOrderPage`, `OrderDetailsPage` | Paginated board, record order, review saved summary, revision-bound decisions |
| Delivery | `DeliveryPanel` | Existing destinations, reviewed row, explicit queueing, job status, read-only reconciliation |
| Mobile navigation | `App`, `Sidebar` | Home, Orders and Business profile only; examples and preview routes removed at the user's request |

Build in that order, reusing `lib/account/` and the existing dark theme, fonts
and drawer. Keep React and backend contracts unchanged. Add Flutter workspace
screens under `lib/workspace/`; put behavioral tests under `test/`.

Requests use the existing `/v1` API with bearer tokens and no stored passwords,
tokens or provider credentials. Reset navigation and loaded content when the
account/tenant changes. Prevent business switching and sign-out during writes.
Retain UUIDs and payloads across uncertain order/decision/job retries. Do not
automatically dispatch spreadsheet writes or infer customer decisions.

## Connection configuration

Web uses a same-origin `/v1/` proxy; native uses `SUPERAGENT_API_URL` or local
loopback development with `adb reverse`. No backend CORS changes are required.
Use HTTPS beyond loopback and keep Android cleartext allowances in debug builds.

## Acceptance and checks

- A user can register/sign in, select a business, edit an owner profile and sign out.
- Home uses actual outcomes and the saved business timezone, including midnight boundaries.
- Recording an order creates one conversation and attempt with stable UUIDs on retries.
- Decisions carry the reviewed revision/hash and evidence; incomplete orders cannot be confirmed.
- Staff cannot edit profiles or initiate spreadsheet delivery.
- Tenant changes/session expiry discard visible business data and stale responses.
- Empty, loading, permission, network and API-conflict states have visible recovery actions.
- Phone layouts fit 320px and 430px, with keyboard-accessible form controls.
- `flutter test`, scoped `flutter analyze` and `flutter build web --release` pass.
- Verify browser rendering and request routing; distinguish fixture tests from a real PostgreSQL-backed API run.
