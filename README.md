# SuperAgent

Business assistants for Moroccan shops. See [ARCHITECTURE.md](ARCHITECTURE.md) for the target architecture.

## Run locally

Requires Node.js 24 or newer and npm.

For the database-backed API, also install Docker, copy `backend/.env.example` to `backend/.env`, and replace the two passwords and matching URL credentials with separate random values. The real `.env` is ignored by Git.

```sh
npm install
docker compose --env-file backend/.env up -d --wait
npm run db:migrate
npm run dev
```

The development API listens on `127.0.0.1:3000`. Set `PORT` to change the port.

```sh
npm test
npm run test:integration
npm run typecheck
npm run build
npm start --workspace backend
```

## Backend capabilities

Express 5 / TypeScript backend with PostgreSQL tenant identity, business profiles and stateless structural graph validation. The API and local database bind to loopback. The runtime refuses privileged database credentials; migrations use a separate administrative connection. `GET /healthz` checks process liveness, not database readiness.

### Identity and business profiles

| Endpoint | Request | Result |
|---|---|---|
| `POST /v1/auth/registrations` | `{ "email": "owner@example.com", "password": "a long unique passphrase", "businessName": "My Shop" }` | `201` with `user`, owner `tenant`, opaque `token` and `expiresAt` |
| `POST /v1/auth/sessions` | `{ "email": "owner@example.com", "password": "a long unique passphrase" }` | `201` with `token` and `expiresAt` |
| `GET /v1/me` | Bearer session | User and tenant memberships |
| `DELETE /v1/auth/session` | Bearer session | Revokes this token, returns `{ "signedOut": true }` |
| `GET /v1/tenants/:tenantId/profile` | Bearer session | Tenant profile; members only |
| `PUT /v1/tenants/:tenantId/profile` | Bearer session, `{ "language": "darija", "timezone": "Africa/Casablanca", "description": "Shop policies and facts" }` | Replaces profile fields; owners only |

Send sessions using `Authorization: Bearer <token>`. Tokens expire after 24 hours, are stored as SHA-256 digests in the database, and are returned only on registration/login. Passwords are salted with scrypt; use 12–128 characters. Emails are normalized to lowercase. Never log tokens or passwords. Browser clients must keep bearer tokens in memory, never localStorage; a secure cookie flow will be needed before shipping the web login experience. Native clients should use OS secure storage. HTTPS is required outside loopback development.

Registration atomically creates the user, tenant, owner membership, initial profile and session. Repeating registration with an existing email returns `409 REGISTRATION_UNAVAILABLE`; it does not replay the original response. Repeating login creates a new independent session. Profile replacement can be retried; it refreshes `updatedAt`. Missing/expired sessions return `401`, non-members receive `404` for tenant resources, staff writes return `403`, invalid fields return `422`, and auth throttling returns `429` with `Retry-After`. Limits are shared in PostgreSQL: 10 registration/login attempts per IP and email per 15-minute window. The API does not trust forwarded client-IP headers; keep that setting until proxy topology is configured explicitly.

The default test command runs unit and HTTP protocol tests without PostgreSQL. For integration tests, copy `backend/.env.test.example` to `backend/.env.test` and use the same local role passwords as `.env`, with both database URLs pointing to `superagent_test`. Run `npm run db:setup:test --workspace backend` once, then `npm run test:integration`. The suite refuses other database names. It exercises actual row policies, role restrictions, rollback, session revocation/expiry, staff denial and concurrent rate counters. It creates UUID-named accounts, removes those fixtures and their rate counters, and clears the loopback-IP test counter; use a dedicated local test database with no live traffic.

Schedule `npm run db:cleanup --workspace backend` at least every 15 minutes to delete expired session records and inactive rate-limit counters. This initial identity slice does not implement email verification, password reset, self-service account deletion, invitations or production deployment. See [backend/SECURITY.md](backend/SECURITY.md) for boundaries and data handling.

### Structural graph validation

- `GET /healthz` → `200 { "status": "ok" }` (process liveness only).
- `POST /v1/graph-validations` accepts the graph below as JSON. It is safe to retry and does not save anything.
- Success: `200 { "stage": "structure", "valid": true, "issues": [] }`.
- Rejected graphs: `422 { "error": { "code": "GRAPH_INVALID", "message": "...", "details": { "stage": "structure", "valid": false, "issues": [{ "code": "...", "message": "...", "nodeId": "optional" }] } } }`.
- Other errors use the same `error.code` / `error.message` envelope: malformed JSON `400`, oversized body `413`, unsupported encoding `415`, missing route `404`, unexpected failure `500`.

```json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "receive", "type": "trigger" },
    { "id": "decision", "type": "condition" },
    { "id": "confirmed", "type": "end" },
    { "id": "pending", "type": "end" }
  ],
  "edges": [
    { "from": "receive", "to": "decision", "route": "next" },
    { "from": "decision", "to": "confirmed", "route": "match" },
    { "from": "decision", "to": "pending", "route": "default" }
  ]
}
```

This describes topology only; the decision does not execute business logic. Supported structural types are `trigger`, `condition` and `end`. Every node must be reachable from exactly one root trigger; all paths must terminate. Joins and cycles are rejected. Inputs are strict, limited to 100 nodes, 200 edges and 64kb JSON. Structural acceptance does **not** produce an execution manifest or permit publication.

Implementation references: [Express JSON middleware](https://expressjs.com/en/5x/api/express/) and [error handling](https://expressjs.com/en/5x/guide/error-handling/).

### Capability registry and typed bindings

`GET /v1/capabilities?page=1&pageSize=50` returns `{ data, pagination: { page, pageSize, totalItems, totalPages } }`. The catalog is code-owned and read-only; each entry pins a stable name/version and includes its family, required input/output fields, trigger event fields, connection requirements, scopes, risk, timeout, retry/idempotency policy, implementation reference and local fixtures. Page size is bounded to 100. Invalid pagination returns `422 INVALID_INPUT`.

The initial local adapters are `manual.text@1.0.0` (receives a manual text event), `text.copy@1.0.0` (copies text), `text.equals@1.0.0` (exact, case-sensitive comparison), and `workflow.end@1.0.0`. They perform no external effects. Contracts and nested metadata are frozen; changing a contract requires a new registered version. Every registered adapter has passing fixture tests. `executeLocalCapability` validates its inputs, trigger event and outputs; it is an internal local adapter entry point, not a workflow scheduler or provider gateway. These operations do not determine whether an order is confirmed.

`POST /v1/workflow-validations` accepts the [version 2 example](backend/examples/typed-workflow.json). Unlike the version 1 structural format, every node has `{ id, capability: { name, version }, inputs }`; its family comes from the registry. Inputs bind either `{ "kind": "literal", "value": "some text" }` or `{ "kind": "output", "nodeId": "receive", "field": "text" }`. Scalars are strings (at most 4000 characters), finite numbers or booleans. All declared input fields are required. No expressions, templates, nested object values, coercion or arbitrary code execute. Literal text is treated as text, including any braces it contains.

The compiler validates exact capability pins, topology, required/unknown inputs and matching scalar types. References must name a declared output on a strict ancestor of the consuming node. Self, forward and sibling-branch references are unavailable; request-array order does not matter. Joins/cycles remain unsupported. The limits are 100 nodes, 200 edges, 32 inputs per node and 64kb JSON. Trigger/action nodes use `next`; conditions require `match` and `default`; terminal nodes have no outgoing routes. The built-in adapters are pure and have no fallible external calls; external error routes and connection policies will be added with provider adapters.

Success returns `200 { "stage": "bindings", "valid": true, "issues": [], "resolvedCapabilities": [{ "nodeId": "receive", "name": "manual.text", "version": "1.0.0" }, ...] }`. Invalid workflows return `422 { "error": { "code": "WORKFLOW_INVALID", "message": "...", "details": { "stage": "bindings", "valid": false, "issues": [{ "code": "MISSING_INPUT", "nodeId": "end", "input": "reason", "message": "..." }], "resolvedCapabilities": [] } } }`. Other issue codes include `INVALID_SCHEMA`, `UNKNOWN_CAPABILITY`, `UNSUPPORTED_VERSION`, `UNKNOWN_INPUT`, `TYPE_MISMATCH`, `UNKNOWN_SOURCE`, `UNKNOWN_OUTPUT`, `UNAVAILABLE_OUTPUT` and the structural validation codes.

Both discovery and validation are public, bounded, stateless endpoints containing no tenant records; validation is safe to retry. A valid binding report does not save a draft, generate an execution manifest, authorize tool use or permit publication. Tenant authorization, approval, connector slots/scopes, destination bindings and execution budgets must be checked by later publication gates. The existing `/v1/graph-validations` format and response remain unchanged. Schema implementation follows the [Zod API](https://zod.dev/api).

### Admin scenario catalog

After pulling this change, run `npm run db:migrate`; the migration runner applies numbered SQL files in order and records each once. Run `npm run db:setup:test --workspace backend` to update the separate test database.

Platform admins are separate from tenant owners. Register a local account, read its user ID from `/v1/me`, then an operator with the administrative database credentials can explicitly grant catalog access using `npm run admin:grant --workspace backend -- <user-uuid>`. Signup never grants this role and the HTTP API cannot grant it. No existing user is promoted automatically. To revoke it, a maintenance operator deletes that user's row in `platform_admins`; subsequent catalog requests recheck the role. Keep maintenance credentials outside the API process in deployment.

All following endpoints require a live bearer session. `/admin/...` requires the platform-admin role; tenant owners receive `403` there.

| Endpoint | Body / result |
|---|---|
| `POST /v1/admin/scenarios` | `{ id: UUID, definition }`; creates revision 1, returns `201 { id, revision, definition, updatedAt }` |
| `GET /v1/admin/scenarios/:id` | Returns the current draft |
| `PUT /v1/admin/scenarios/:id/draft` | `{ expectedRevision, definition }`; saves the next draft revision |
| `POST /v1/admin/scenarios/:id/simulations` | `{ expectedRevision }`; returns `200 { scenarioId, revision, report }` without publishing, including reports where `valid` is false |
| `POST /v1/admin/scenarios/:id/releases` | `{ expectedRevision }`; reruns validation/fixtures and returns an immutable release |
| `GET /v1/admin/scenarios/:id/audit` | Paginated actor, action, revision, time and release test results |
| `GET /v1/scenarios` | Paginated released-version summaries (`scenarioId`, `revision`, `name`, `description`, `createdAt`); no drafts |
| `GET /v1/scenarios/:id/releases/:revision` | Full released `definition`, `validationReport`, `simulationReport`, revision and creation time |

Use the [complete creation example](backend/examples/scenario.json), replacing its UUID when creating a different scenario. A definition contains a name (1–120 characters), matching description (1–1000), version 2 `workflow`, and 1–20 uniquely named fixtures. Each fixture supplies `event`, `expectedPath` and `expectedReason`. The simulator resolves actual bindings, runs the registered pure local adapters and records the actual path and terminal reason. Release requires a valid compiler report, matching fixture expectations, and traversal of every graph edge across the suite. A wrong trigger shape fails a fixture. No provider calls occur. The existing 64kb request limit still applies.

Schema-valid drafts may contain compiler errors or failing fixtures so admins can repair them. Text unsupported by PostgreSQL (such as a NUL character), or a definition exceeding 64kb in PostgreSQL's normalized JSON representation, returns `422 INVALID_INPUT`. Simulation is bound to the returned revision but does not reserve it; editing invalidates that preview. A stale edit, simulation or new release returns `409 STALE_REVISION`. A failed release returns `422 SCENARIO_NOT_READY` with the simulation report in `error.details`; nothing is released. Preview reports include `valid`, `validationReport`, per-fixture `cases` (`name`, `passed`, actual `path`, `reason` and optional safe `error`), `uncoveredEdges` and schema-level `issues`.

Creation is retryable with the same UUID and original definition: it returns `200` and the current resource, including after later edits. Reusing the UUID for another definition returns `409 SCENARIO_ID_REUSED`. Edits use optimistic revision checks; after an ambiguous response, GET the draft before deciding whether to retry. Releasing the same scenario/revision returns the original release (`200` on replay, `201` on creation), even after the draft advances. Releases use draft revision numbers, so version numbers can have gaps. Database row locks serialize edits/releases; release snapshots and audit records commit in one transaction. Later draft edits never modify an earlier snapshot. Runtime SQL grants prohibit modifying/deleting releases or audit history; platform-admin writes also have row policies. Privileged database maintenance remains a separate trust boundary.

This is the backend catalog foundation for local capabilities. COD scenarios, prompt customization schemas, connector slots, release retirement, cloning and the React admin editor remain future work. Releasing a catalog scenario does not activate any tenant workflow.

## Next increments

1. Persistent Builder drafts pinned to a released scenario, simulation and exact-revision approval.
2. COD capability contracts, scoped inference, connector adapters and provider-failure fixtures.
3. Connection onboarding, publication and durable runtime, then React/Flutter client flows.

WhatsApp and Sheets adapters, inference, order records and dashboards remain unimplemented. The architecture's release acceptance criteria still apply to those increments.
