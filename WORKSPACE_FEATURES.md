# Persistent workspace

Replace the example routes with tenant-scoped, empty-by-default screens. Keep the
existing dark visual language. Records in Docs, Company Brain, Agents, Canvas and
Workflows are saved drafts; they do not publish agents, retrieve knowledge or run
external effects. Inbox lists actual COD conversations and links to their orders.

Chat supports logical model choices Opus, Sonnet, Astra and Sol. These are product
aliases, not provider API model identifiers. Save user messages and their selected
alias with `AWAITING_PROVIDER`; do not generate simulated assistant replies or
automatically submit stored messages when a provider is added later. All aliases
are initially unconfigured. Provider credentials stay on the server.

## API contract

- Authenticated `GET /v1/chat-models`: catalog with `configured: false`.
- `/v1/tenants/:tenantId/workspace-records`: POST `{id,kind,title,content}`;
  GET `?kind=...&page=1&pageSize=25`. Kinds: document, knowledge, agent, canvas,
  workflow, chat. Strict kind-specific content schemas; immutable kind and ID.
- GET/PUT `.../:id`: PUT `{expectedRevision,title,content,archived}` replaces
  editable fields and advances the revision. Conflicting revisions return 409.
  Creation is UUID-idempotent; replay compares the original intent, even after edits.
- GET/POST `.../:id/messages`: paginated history; POST `{id,model,text}` returns
  a stored user message in `AWAITING_PROVIDER`. Same UUID and payload replays;
  changed payload conflicts. Only active chat records accept messages.
- GET `/v1/tenants/:tenantId/conversations`: paginated real inbox records.

All members may read business records and contribute to shared business chat.
Only owners edit other records. Forced PostgreSQL RLS independently enforces these
boundaries. Records are archived rather than deleted. Lists are bounded. Text is
rendered as plain text. Workflow graphs are bounded visual drafts, not executable
compiler manifests; publishing still requires the existing scenario pipeline.

## Acceptance checks

Verify persistence across navigation, model selection on saved messages, no fake
assistant reply, graph node/edge preview and selection, archive and revision
conflicts, idempotent retries, staff restrictions and cross-tenant denial through
both HTTP and direct runtime-role SQL. Exercise real browser flows and mobile
layout with provider integrations disabled.
