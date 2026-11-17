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

## Next increments

1. Versioned capability contracts, typed data bindings and compiler policy checks.
2. Admin scenario drafts, immutable releases and mocked COD fixtures.
3. Persistent Builder revisions, simulation and exact-revision approval.
4. Connection onboarding, publication and durable runtime, then React/Flutter client flows.

WhatsApp and Sheets adapters, inference, order records and dashboards remain unimplemented. The architecture's release acceptance criteria still apply to those increments.
