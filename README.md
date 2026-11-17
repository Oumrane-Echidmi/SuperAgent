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

This is the backend catalog foundation for local capabilities. COD scenarios, model prompt customization, connector slots, release retirement, cloning and the React admin editor remain future work. Releasing a catalog scenario does not activate any tenant workflow.

### Tenant Builder draft review

Run `npm run db:migrate` after pulling to add the Builder tables; update the test database with `npm run db:setup:test --workspace backend`. The API persists tenant setup drafts and revision-specific review evidence. Clients explicitly select an immutable catalog release, optionally using phrase matching or the opt-in AI chat below. Business Agent prompt generation remains unimplemented. Stored `name`, `goal` and `language` describe setup intent; permitted `content.parameters` can change only admin-declared literal settings.

All endpoints below require a live bearer session and tenant membership. Staff can read; owners can create, edit, simulate and approve. Platform-admin catalog access does not bypass tenant membership. Another shop receives `404`. Draft IDs are scoped by tenant, so independent shops may safely use the same client UUID.

| Endpoint | Request / result |
|---|---|
| `POST /v1/tenants/:tenantId/drafts` | [Creation example](backend/examples/builder-draft.json): `{ id, scenarioId, scenarioRevision, content: { name, goal, language } }`; `201` on creation, `200` on replay |
| `GET /v1/tenants/:tenantId/drafts` | Paginated current draft summaries |
| `GET /v1/tenants/:tenantId/drafts/:id` | Current setup, exact scenario definition, revision/hash, current simulation and current approval |
| `PUT /v1/tenants/:tenantId/drafts/:id` | `{ expectedRevision, content }`; appends a new revision, returning the new review record |
| `GET /v1/tenants/:tenantId/drafts/:id/revisions` | Paginated immutable content/hash history with actor and time, oldest first |
| `POST /v1/tenants/:tenantId/drafts/:id/simulations` | `{ expectedRevision }`; persists the scenario's fixture report for this revision (`201`, or `200` on replay) |
| `POST /v1/tenants/:tenantId/drafts/:id/approve` | `{ expectedRevision }`; records owner approval (`201`, or `200` on replay) |

Use a released scenario ID/revision from `/v1/scenarios`; an unreleased or missing version returns `404`. Setup requires a nonblank name up to 120 characters, a nonblank goal up to 4000 characters, and `language` set to `darija` or `fr`. Graph, fixture, account and actor overrides are rejected. Creation retries must reuse the same tenant/UUID and original setup intent, including the pin; replay returns the current resource even after edits. Different creation intent with that UUID returns `409 DRAFT_ID_REUSED`. A new scenario selection requires a new draft.

The current review response includes `id`, `tenantId`, `revision`, `content`, `scenarioId`, `scenarioRevision`, `scenarioDefinition`, `revisionHash`, `editedBy`, `updatedAt`, `simulatorVersion`, `simulation` and `approval`. An absent current simulation/approval is `null`. Each SHA-256 revision hash binds tenant, draft, revision, scenario pin and all setup fields in a fixed serialization order. Successful approval returns `{ tenantId, draftId, revision, simulatorVersion, revisionHash, approvedBy, approvedAt }`. Approval records evidence of review; it does not publish or activate anything.

Approval requires a persisted passing simulation for exactly this revision and the current server-owned simulator version (`local-1.1.0`). This version adds declared-parameter resolution; drafts reviewed under `local-1.0.0` must be simulated and approved again. Old evidence remains historical. The server reruns the pinned release fixtures with the selected settings before approving and compares the report with stored evidence. Missing evidence returns `409 SIMULATION_REQUIRED`, failed evidence returns `422 DRAFT_NOT_READY`, and changed results without a version bump return `409 SIMULATOR_CHANGED`. Simulation semantics changes require a simulator version bump. Client-supplied reports or simulator versions are never accepted.

Edits always append history and invalidate the current approval, including edits that repeat the same setup. Old revisions and approvals remain immutable in PostgreSQL. Stale edits/simulations/approvals return `409 STALE_REVISION`; after an ambiguous edit response, reload before retrying. Row locks serialize edits and approvals. The mutable head and immutable revision append commit together; a deferred foreign key prevents a head without its revision. New catalog releases do not upgrade existing pins. Runtime SQL cannot update/delete revision, simulation or approval history. The three PostgreSQL integration suites exercise tenant isolation, staff denial, repeated/concurrent operations, approval invalidation and transaction rollback.

### Declared scenario customizations

The [customizable scenario example](backend/examples/customizable-scenario.json) adds optional `parameters` and `matching` fields to the existing admin definition. Old definitions remain accepted without changing their original creation intent. A parameter declares `{ key, label, nodeId, input, values }`. Keys and target inputs must be unique. Targets must already be literal inputs of registered capabilities; choices must match the input type, be distinct and include the released literal default. Each parameter has 1–4 choices, at most 4 parameters are supported, and their total Cartesian product must not exceed 16 combinations. Violations block release with `SCENARIO_NOT_READY` and contract issues in the report.

Admin fixtures may use `{ "parameter": "matchedReason" }` as an event field value or expected terminal reason. References must resolve to declared settings; terminal reasons must resolve to strings. Before release, the server runs the full fixture suite for **every** allowed combination, including branch coverage. A passing default cannot hide a failing alternative. The release report includes `variants` with each parameter map and fixture report. This is parameter substitution, with no expression evaluation or model-generated code.

Tenant draft `content` may include `parameters`, for example `{ "matchedReason": "شكرا" }`. Omitted keys use released defaults; undeclared keys or unlisted/wrongly typed values return `422 INVALID_CUSTOMIZATION`. Tenants cannot change declarations, graph topology, capability versions, output references or fixture expectations. GET/create/edit draft responses include `effectiveParameters`, `effectiveWorkflow` and `effectiveFixtures` beside the unchanged `scenarioDefinition`. Simulations and approvals use these effective artifacts. Selected values are included in the revision hash with sorted keys; omitting the optional map preserves the previous content serialization. Parameter edits append a revision and invalidate approval as other edits do.

### Builder phrase matching and unsupported requests

Admins may declare `matching: { phrases: [...], languages: ["darija", "fr"] }` on a scenario. Matching uses only the latest **released** version per scenario and only explicitly declared phrases for the selected language. It normalizes Unicode width, case and punctuation and matches complete phrase boundaries. It does not translate, infer intent, certify full capability coverage or invoke an AI model. Candidates always require review; the client explicitly selects a returned scenario pin when creating a draft. Scenarios without matching metadata remain manually selectable from the catalog.

- Owner: `POST /v1/tenants/:tenantId/builder/matches` with `{ "id": "<request-uuid>", "goal": "Je veux trier les messages", "language": "fr" }`.
- Member: `GET /v1/tenants/:tenantId/builder/matches/:id` retrieves a stored request for that tenant.
- Platform admin: `GET /v1/admin/builder-requests?page=1&pageSize=50` lists unsupported requests for review.

A matching request returns `{ id, tenantId, goal, language, result, createdBy, createdAt }` with `201` on creation or `200` on replay. `result` contains `state` (`CANDIDATES` or `UNSUPPORTED`), `requiresReview: true`, up to 10 ranked `candidates`, `totalCandidates` and `gaps`. Each candidate contains a scenario pin, name, description and the actual `matchedPhrases`; no confidence score or draft is generated. No match returns `NO_RELEASED_MATCH` and places the goal in the admin review queue. Partial phrase matches are suggestions, not proof that every requested action is supported.

Goals are trimmed, 2–4000 characters, and language must be `darija` or `fr`. Repeating a tenant/request UUID with the original goal/language replays the stored result even if the catalog later changes; different input returns `409 REQUEST_ID_REUSED`. A fresh UUID performs a new search. Concurrent retries persist one request. Processing is bounded to 200 latest released scenarios; overflow returns `503 CATALOG_LIMIT`, without falsely logging an unsupported goal. Staff cannot submit matches. Ordinary tenants cannot read others' requests. Platform admins can read unsupported goals through the review queue, but do not gain access to other tenant drafts or candidate-result requests.

Matching goals and results are retained for 30 days plus cleanup lag. Schedule `npm run db:cleanup:builder --workspace backend` daily using separate maintenance credentials; it deletes only requests older than 30 days. This also bounds request-ID replay retention; deleted requests return `404` and a later POST is treated as a new request. The runtime cannot mutate or delete these records. Goals can include business/personal information, so submit only setup facts needed for scenario matching. Unsupported goals are shared with platform admins for catalog planning; no third-party service receives them.

### Scoped AI Builder chat

AI chat is opt-in and disabled by default. No live model is called by the test suite. To enable local inference, set `BUILDER_AI_ENABLED=true`, an explicit `BUILDER_AI_MODEL` supporting Responses structured outputs, and `OPENAI_API_KEY` in the worker environment. Set a separate random `BUILDER_WORKER_DATABASE_PASSWORD` (at least 24 characters) and `BUILDER_WORKER_DATABASE_URL=postgresql://superagent_builder_worker:<password>@127.0.0.1:5433/superagent`, then rerun `npm run db:migrate`. The migration initially creates the dedicated worker role with NOLOGIN and enables login when a password is supplied. Use the same worker-role password across databases on this local PostgreSQL instance. Update `backend/.env.test` from its example and rerun test setup for the integration suite.

Run `npm run dev` for the API and `npm run worker:builder` in a separate terminal. Production builds include `backend/dist/builder-worker.js`. The API only needs the enable flag and its existing runtime database credentials. The worker needs the provider/model configuration and its separate database credentials; it cannot read password/session tables, business profiles, connector credentials, draft records or approvals. Keep privileged migration/retention credentials outside both deployed processes. The worker polls queued turns; inference happens outside HTTP requests and database transactions.

| Endpoint | Request / result |
|---|---|
| `POST /v1/tenants/:tenantId/builder/sessions` | [Session example](backend/examples/builder-chat-session.json): `{ id, language, consentToOpenAI: true }`; `201` or `200` on replay |
| `GET /v1/tenants/:tenantId/builder/sessions` | Paginated session summaries |
| `GET /v1/tenants/:tenantId/builder/sessions/:id` | Current revision and ordered turns, including status, validated result, safe error code and available token usage |
| `POST /v1/tenants/:tenantId/builder/sessions/:id/messages` | [Message example](backend/examples/builder-chat-message.json): `{ id, expectedRevision, text }`; `202` for a queued turn, `200` for an identical retry |
| `GET /v1/admin/builder-chat-gaps` | Paginated unsupported chat goals and gaps for platform-admin catalog review |

Owners can create sessions and submit messages; members can read their tenant's sessions. Another tenant receives `404`, and staff writes receive `403`. Consent to OpenAI processing is explicitly required when creating a session. Reusing a session UUID with another language returns `409 SESSION_ID_REUSED`. Message IDs bind the exact trimmed text and expected revision; changed input returns `409 MESSAGE_ID_REUSED`. A completed or pending duplicate returns the existing turn without another reservation or inference. New messages while a turn is pending return `409 TURN_PENDING`; stale revisions return `409 STALE_REVISION`. Disabled inference returns `503 BUILDER_AI_DISABLED` for new turns while stored history/retries remain readable.

There are at most 20 accepted turns per session and 20 accepted turns per tenant per UTC day. Message text is 1–2000 characters. Request reservations and queue inserts commit together; concurrent requests cannot overrun the daily cap. Failed, cancelled, expired or uncertain attempts retain their reservation. Quota exhaustion returns `429 BUILDER_LIMIT`, and a full session returns `429 SESSION_LIMIT`. These limits count requests, not currency. Actual input/output/total tokens and provider response/model identifiers are saved when available; billing totals and price estimates are not implemented.

Turns move through QUEUED, RUNNING and SUCCEEDED/FAILED. Workers claim with SKIP LOCKED and a 60-second lease. Ownership is rechecked before inference and before saving a result. Late results cannot overwrite a failed/expired lease. Expired running work becomes `MODEL_OUTCOME_UNKNOWN` and is never automatically retried. Queued work from a prior UTC day expires before inference. A new explicit message with the current session revision is required to try again. A worker crash can leave usage unavailable; its request reservation remains consumed. Prompt version `builder-1.0.0`, catalog snapshot, actor and provider metadata preserve provenance.

The provider receives the latest message, up to five previous successful turns from the same tenant/session and summaries of at most 20 latest released scenarios. No graph, fixture, business profile, connection or credential is included. Serialized context is limited to 32kb, response bodies to 128kb and the request to 1800 output tokens with a 20-second timeout. Oversized catalogs/context fail explicitly. The fixed HTTPS endpoint disables redirects, tools and automatic retries, and sends `store:false`. Refusal, incomplete responses, unknown tool outputs, malformed JSON and unregistered pins/settings never produce successful proposals. HTTP authorization/rate/configuration failures have safe provider error codes; provider diagnostics and secrets are not returned.

Validated results contain `reply`, `spec` (name, goal, language, requested fields and constraints), an optional exact scenario `selection`, declared `parameters`, `questions`, `gaps`, a derived `status` and optional `draftSuggestion`. Status is READY, NEEDS_DETAILS or UNSUPPORTED. Missing facts produce questions; unsupported tools produce gaps. READY is a suggestion for review, not proof of semantic fit or an activated workflow. To adopt it, the owner explicitly POSTs its scenario pin/content with a new draft UUID through the existing draft API, then simulates and approves that revision. Chat never edits drafts, approves, publishes, executes tools or generates executable code. Its reply and extracted facts remain untrusted model text.

Unsupported turns are visible to platform admins through the dedicated gap queue, without access to other turns/session history. Chat sessions and turns are retained for 30 days from session creation plus cleanup lag. Schedule `npm run db:cleanup:chat --workspace backend` daily with maintenance credentials; it cascades expired sessions/turns and removes old request counters. Provider account data controls apply to externally processed text; configure them when enabling this flow. Synthetic tests verify French/Darija text survives HTTP, PostgreSQL and provider-context assembly, isolation, duplicate suppression, lease fencing, role revocation, retention and concurrent quota reservations. Live model quality, grounding and the proposed held-out Darija/French evaluation set still need evaluation with the chosen model before real onboarding.

Implementation references: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [PostgreSQL queue locking](https://www.postgresql.org/docs/18/explicit-locking.html).

### COD order foundation

Run `npm run db:migrate` after pulling to add the COD tables, and update the test database with `npm run db:setup:test --workspace backend`. This slice supports **staff-recorded manual** conversations and decisions. It does not accept WhatsApp webhooks, infer confirmation from customer text, dispatch to Google Sheets or activate an automated COD workflow. The pure workflow capability catalog remains unchanged; provider-backed COD actions will need registered adapters and publication checks.

Owners and staff may operate their tenant's records using a live bearer session. All records have tenant row policies. Another shop receives `404`; the AI Builder worker has no COD table privileges.

| Endpoint under `/v1/tenants/:tenantId` | Request / result |
|---|---|
| `POST /conversations` | [Conversation example](backend/examples/cod-conversation.json); creates a MANUAL, HUMAN_ACTIVE conversation |
| `GET /conversations/:id` | Manual conversation reference, language and ownership |
| `POST /order-attempts` | [Attempt example](backend/examples/cod-attempt.json): `{ id, conversationId, details }`; creates one pending attempt |
| `GET /order-attempts` | Paginated current attempts and their readiness reviews |
| `GET /order-attempts/:id` | Current details, revision, summary hash, status and missing requirements |
| `PUT /order-attempts/:id` | `{ expectedRevision, details }`; replaces the collected details and appends immutable revision history |
| `GET /order-attempts/:id/revisions` | Paginated immutable reviewed details and actor/time |
| `POST /order-attempts/:id/decisions` | [Decision example](backend/examples/cod-decision.json): replace its zero hash with the current `summaryHash`; requires decision ID, expected revision and evidence |
| `GET /order-attempts/:id/decisions` | Paginated staff evidence, source and immutable outcomes |
| `GET /orders` / `GET /orders/:id` | Confirmed orders, review provenance and separate sheet-sync intent |
| `GET /dashboard/outcomes?from=2026-11-17&to=2026-11-17` | Current attempt outcomes grouped by start date in the configured business timezone |

Conversation references never merge customers by display name. A new conversation/attempt requires an explicit client UUID. Creation retries with the same UUID and original fields return the current resource (`200`, versus `201` on creation); changed intent returns `409`. Each conversation permits one PENDING attempt. `OPEN_ATTEMPT_EXISTS` indicates a competing open attempt. New attempts after a final decision require new IDs and represent new purchase intent.

Collected `details` may omit unknown fields but rejects malformed supplied fields. Required confirmation fields are `item` (1–200 characters), `quantity` (integer 1–1000), `recipient` (1–120), `phone` (a `+` and 8–15 digits), `address` (1–500), `unitAmountMinor` and `deliveryAmountMinor` (integers 0–1,000,000,000). Phone validation checks syntax, not ownership or reachability. Amounts use 100 minor units per MAD. Zero is an explicit amount, never a missing price. Missing customer fields produce focused Darija/French questions. Missing shop prices appear separately in `staffRequirements`; they must come from the shop's current pricing, not a customer's claim or retrieved prose. This initial order shape supports one item/quantity and a delivery fee; tax, stock and fulfillment integrations remain separate work.

The server computes `quantity * unitAmountMinor + deliveryAmountMinor` with bounded integer arithmetic. Reviewed hashes bind tenant, conversation, attempt, normalized details and `cod-1.0.0` policy. Content revisions and hashes are immutable; edits replace the full partial details object, so include earlier collected fields you want to retain. Stale edits/decisions return `409 STALE_REVISION`; a wrong hash returns `409 SUMMARY_CHANGED`. Missing facts block CONFIRM with `422 ORDER_INCOMPLETE`. A future policy change requires resaving/reviewing old pending details before a new decision.

Decision values are CONFIRM, DECLINE or AMBIGUOUS. Each requires nonblank staff evidence (up to 500 characters) and records the authenticated actor as the source `STAFF_RECORDED`; it is not cryptographic proof of a customer message. AMBIGUOUS preserves PENDING. DECLINE closes the attempt without an order. CONFIRM creates exactly one immutable order, with its ID equal to the attempt ID. Final decisions do not change the content revision, and closed attempts cannot be edited/reopened through API or runtime row policies. Delivery and cash collection are not inferred from confirmation.

The decision UUID is tenant-scoped and permanently binds its attempt, revision, hash, decision and evidence while the record is retained. Identical retries replay the original outcome (`200`, versus `201` on creation). Reuse with other parameters returns `409 EVENT_ID_REUSED`. The stable order identity and `cod:sheet:<order-id>` operation key do not contain workflow versions. Concurrent calls serialize by decision and attempt. The order, decision receipt, terminal attempt state and sheet-sync request commit together; a failed insert rolls everything back. No network call is made in that transaction.

Each confirmed order has one immutable `sheet_sync_requests` projection with a versioned payload, stable order ID, exact two-decimal `amountMad`, details and COD status. Its status is **AWAITING_CONNECTION**: this is durable intent, not a completed write. No spreadsheet destination or credential is bound yet, and nothing dispatches it. Order APIs return per-order `amountMinor` as a decimal integer string and expose the separate `sheetSync`. Later connector recovery must retain this operation identity and reconcile ambiguous writes before retrying.

Dashboard query dates are inclusive and span at most 366 days. The server uses `business_profiles.timezone`, groups attempts by their original start date and counts each attempt's current state once. `confirmationRate` is a fraction (`confirmed / (confirmed + declined)`), or `null` without a decision. Monetary totals are exact decimal integer strings. `confirmedOrderValueMinor` is confirmed purchase value, not cash collected; `sheetSyncWaiting` is a separate count. A confirmed, declined and pending attempt yield counts of one each and a 0.5 confirmation rate. Duplicate decision replay preserves those counts. There are no run/fulfillment metrics yet.

Recipient, phone, address, staff evidence and historical summaries are tenant business/personal data. Current records remain until privileged tenant deletion, which cascades orders, receipts, revision history and pending projections. Production-specific retention, export/deletion, backups and provider-side projection deletion must be configured before onboarding real customer data; this local foundation makes no compliance-retention claim.

## Google Sheets protocol foundation

`backend/src/credentials.ts` provides server-only AES-256-GCM credential envelopes with a random 96-bit nonce, authenticated version/key ID and tenant/provider/connection context. Keys are exactly 32 random bytes encoded as base64, supplied by the calling service from its secret manager. The active key encrypts new values; retained keys decrypt older envelopes for rotation. Copying an envelope to a different tenant or connection fails authentication. This primitive does not authorize access: the calling service must check ownership before decrypting. No key, token or envelope is exposed through an API in this increment.

`backend/src/google-sheets.ts` implements bounded Google refresh-token and single-row append requests. Provider URLs are fixed, redirects are rejected, calls have a 15-second deadline and response bodies have a 64 KiB limit. Sheets writes accept 1–26 string cells (up to 4,000 characters each), quote the selected tab name and use RAW input to preserve literal customer text, phone prefixes and exact decimal amounts. This follows Google's [append contract](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), [RAW input behavior](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption) and [refresh-token protocol](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

Append success requires matching spreadsheet ID, one updated row, exact cell/column counts and a matching returned tab/range. Transport errors, server errors, malformed responses and cancellation after dispatch produce `OUTCOME_UNKNOWN`. There are no automatic retries. The eventual delivery worker must persist the operation and dispatch attempt first, bind an owner-authorized destination, include the stable order ID in the row, and reconcile uncertain writes before another append. Even valid returned range evidence is not an exactly-once guarantee and can later be edited by a spreadsheet user. Authorization failure, rate limiting and rejected requests have separate safe error codes; provider response bodies are never exposed in errors.

Provider protocol tests use mocked requests only. Existing COD intents remain AWAITING_CONNECTION: destination selection, reconciliation and a delivery worker remain to be implemented. No additional dependencies are required to run the existing server.

## Google account connection API

Apply migration 008 with `npm run db:migrate` and update the dedicated test database with `npm run db:setup:test --workspace backend`. Google connection creation/completion is disabled by default. To enable it, set `GOOGLE_CONNECTIONS_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CREDENTIAL_ACTIVE_KEY_ID` and `CREDENTIAL_KEYS_JSON` (a JSON object mapping key IDs to random 32-byte base64 keys). Keep real configuration outside git. Startup rejects incomplete enabled configuration with a safe error. Disabling new setup still permits owners to inspect or locally disconnect previous connections.

Register a Google **Web application** OAuth client and its exact trusted client callback URL. This backend increment supplies the start/complete API; it does not include a browser callback page or mobile deep-link flow. HTTPS callback URLs are required except `http://localhost` / `http://127.0.0.1` for local development. URLs cannot contain userinfo, query parameters or fragments and cannot be overridden by a request. The trusted callback client must preserve the selected connection ID, verify the returned state against the authorization it started, remove code/state from its address bar, and submit them to the API using the initiating owner's bearer session. Do not log codes, state, authorization URLs or credentials, or include third-party scripts on that callback page. A missing/cancelled authorization can be locally disconnected and restarted.

| Endpoint under `/v1/tenants/:tenantId/connections/google` | Request / result |
|---|---|
| `POST /` | `{}` → `201 { connection, authorizationUrl }`; open the returned URL for consent |
| `POST /:id/complete` | `{ state, code }` → safe CONNECTED metadata; same initiating user must still be an owner |
| `GET /` | Paginated owner-only metadata (`limit` 1–100, default 20; `offset` 0–10000) |
| `GET /:id` | Current safe connection metadata |
| `DELETE /:id` | Clears local credentials and pending authorization data, returns DISCONNECTED metadata; repeatable |

All endpoints require a live session. Nonmembers receive `404`; staff receive `403`, and PostgreSQL policies also exclude them from connection rows. Responses contain only connection ID, status, granted scopes, initiating actor and timestamps. Tokens, PKCE verifiers and encrypted envelopes are never returned. Connection metadata does not identify a Google email/account: profile scopes are not requested.

Each start creates a fresh connection identity and is limited to five starts per tenant per 15 minutes. It requests offline `drive.file` consent with S256 PKCE, following the [Google authorization flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [PKCE support](https://github.com/googleapis/google-auth-library-nodejs/blob/main/samples/oauth2-codeVerifier.js). Google's [recommended per-file scope](https://developers.google.com/workspace/sheets/api/scopes) will require a later file picker or app-created spreadsheet; connecting alone gives no access to an arbitrary pasted spreadsheet ID.

Authorization attempts expire after ten minutes and bind tenant, initiating user, client ID, redirect URI, state hash and encrypted PKCE verifier. Completion atomically consumes state/verifier before the bounded Google exchange runs outside a database transaction. Concurrent/repeated completion cannot exchange the same attempt twice. A refresh token and required granted scope are mandatory. Only the encrypted refresh token persists, bound to tenant and connection; temporary access tokens and authorization codes do not persist. The API rechecks ownership, expiry and EXCHANGING status before storing a credential. Disconnecting during exchange prevents late results from reconnecting it. Failed, abandoned or uncertain exchanges require a fresh authorization attempt (`409 AUTHORIZATION_UNAVAILABLE` for consumed/expired attempts, `502 GOOGLE_AUTHORIZATION_FAILED` for provider failures).

States are AUTHORIZING, EXCHANGING, CONNECTED, FAILED and DISCONNECTED. Reads report EXPIRED for elapsed pending attempts. CONNECTED means a usable offline grant was received at that time; it is not a continuous health check, spreadsheet permission check or completed sync. Local disconnect deletes the stored credential, but does not revoke the Google-side grant or delete remote files. Users can remove that grant through their Google Account permissions. Reconnection creates a new identity.

Run `npm run db:cleanup:google --workspace backend` every 15 minutes using privileged maintenance credentials. It erases expired pending verifier/state data and removes FAILED/DISCONNECTED metadata after 30 days. Connected credentials persist until local disconnect or privileged tenant deletion. Configure production backup retention and secret-manager key rotation separately; retained backups may contain encrypted historical credentials. No live Google authorization or sheet write was performed by the test suite.

## Next increments

1. Google file selection, tenant destination binding and durable Sheets delivery/reconciliation using the connection API.
2. Verified WhatsApp intake.
3. Registered COD scenario actions, publication and durable runtime, then React/Flutter client flows.

Automated WhatsApp/Sheets workflows and Business Agent inference remain unimplemented. Manual order records and outcome dashboards are available. The architecture's release acceptance criteria still apply to future increments.
