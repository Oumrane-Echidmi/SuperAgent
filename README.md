# SuperAgent

Business assistants for Moroccan shops. See [ARCHITECTURE.md](ARCHITECTURE.md) for the target architecture.

## Run locally

Requires Node.js 24 or newer and npm.

```sh
npm install
npm run dev
```

The development API listens on `127.0.0.1:3000`. Set `PORT` to change the port.

```sh
npm test
npm run typecheck
npm run build
npm start --workspace backend
```

## Implemented first slice

Express 5 / TypeScript backend with health checks and stateless structural graph validation. No accounts, secrets, persistence or external effects are involved. The server binds to loopback because authentication is not implemented yet.

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

1. PostgreSQL migrations, tenant membership, authenticated API and cross-tenant denial tests.
2. Versioned capability contracts, typed data bindings and compiler policy checks.
3. Admin scenario drafts, immutable releases and mocked COD fixtures.
4. Persistent Builder revisions, simulation and exact-revision approval.
5. Connection onboarding, publication and durable runtime, then React/Flutter client flows.

WhatsApp and Sheets adapters, inference, order records and dashboards remain unimplemented. The architecture's release acceptance criteria still apply to those increments.
