# Connected workspace pages

`/inbox`, `/docs`, `/agents`, `/brain` and `/workflows` use authenticated backend data and no longer display example banners or seeded demo records. The black shared UI and branding are retained. Original visual examples remain under `/preview/…`; Canvas remains a separately labelled preview.

| Page | Saved behavior |
|---|---|
| Inbox | Create/list actual customer conversations, open their details and see only linked order attempts |
| Docs | Create, read, edit and archive titled documents |
| Company Brain | Create, read, edit and archive business knowledge notes |
| Agents | Save instructions and an explicitly allowed backend model ID |
| Workflows | Save graph drafts, edit node labels/types, add/remove nodes and connections, and inspect/zoom the graph |

Saved configurations do not deploy an agent or execute workflows. Business knowledge is not automatically inserted into AI prompts. Inbox entries do not send WhatsApp/email messages. These are persistent business records, with their actual activation/delivery boundaries described in the UI.

## API and storage

Apply migrations with `npm.cmd run db:migrate`; the workspace schema is migration `013_workspace.sql`. It is reused from the existing workspace implementation so previously stored records remain compatible. Startup checks for the records table. The API and AI worker continue to use their separate database roles.

- `GET /v1/tenants/:tenantId/workspace-records?kind=document|knowledge|agent|workflow&page=1&pageSize=24` returns unarchived records and pagination.
- `POST /v1/tenants/:tenantId/workspace-records` accepts `{id,kind,title,content}`. Creation UUIDs bind the normalized original intent; replay returns the current record without another insertion. Changed intent returns `409 ID_REUSED`.
- `GET /v1/tenants/:tenantId/workspace-records/:id` returns a saved record.
- `PUT /v1/tenants/:tenantId/workspace-records/:id` accepts `{expectedRevision,title,content,archived}`. Locked revision checks reject stale edits with `409 REVISION_CHANGED`; content/kind/tenant/actor cannot be injected into immutable columns.
- `GET /v1/tenants/:tenantId/conversations?page=1&pageSize=25` lists stored conversations. Existing conversation creation and detail endpoints are used by Inbox.
- `GET /v1/tenants/:tenantId/order-attempts?conversationId=:id` filters the paginated order list to one conversation within the authorized business.

Content is strict and bounded: documents/knowledge use `{body}`, agents use `{instructions,model}`, and workflow drafts use `{nodes,edges}`. Agent models must be present in the API's configured model allowlist for creation or edits; archived configurations may retain a no-longer-available model. Graph drafts permit up to 50 uniquely identified nodes and 100 unique valid connections. Draft graphs do not bypass the separate workflow compiler, scenario release or approval pipeline.

All reads require a live session and business membership. Owners may create/edit/archive workspace records; staff may read. Inbox creation follows existing member-level manual order permissions. Forced PostgreSQL row policies, parameterized SQL and explicit response columns enforce business isolation. The browser keeps pending creation IDs and frozen payloads when a network response is uncertain. Archived records remain stored; tenant deletion cascades records. Establish production retention/deletion policy before real onboarding, consistent with the existing backend security notes.

## Verification

Unit contract tests and real PostgreSQL integration tests cover input bounds, malformed graphs, allowed models, creation replay, concurrent revision conflicts, owner/staff rights, business isolation, archival, Inbox pagination and conversation-specific order filtering.

`frontend/tests/browser/connected-pages.spec.js` creates all five kinds of content through the UI, refreshes/signs in again, reopens persisted values, edits/archives a document and checks a mobile workflow graph. It uses the dedicated test database and synthetic records, and removes its fixtures. No live Google, WhatsApp or paid AI calls are made.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
npm.cmd run test:e2e --prefix frontend
npm.cmd run test:e2e --prefix frontend -- --config playwright.ai.config.js
```
