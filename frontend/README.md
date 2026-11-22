# SuperAgent workspace frontend

The React workspace connects to Express for registration/sign-in, business profiles, manual COD orders, customer decisions, dashboard outcomes and spreadsheet delivery jobs. It preserves the dark workspace shell. Screens without a connected API are labelled **Preview** and show examples.

## Run locally

Requires Node.js 24+, the migrated database and backend configuration described in the root README. From the repository root, start the API:

```sh
npm install
npm run db:migrate
npm run dev
```

In a second terminal:

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run dev
```

Open **http://127.0.0.1:4173**. The API runs on `127.0.0.1:3000`. Vite proxies `/v1` and `/healthz` to it without weakening backend CORS. `API_PROXY_TARGET` changes that trusted development/preview target; it is not bundled into browser code. Both servers bind to loopback.

```sh
npm --prefix frontend run build
npm --prefix frontend run preview
```

Preview inherits the API proxy. Production must separately serve the SPA and reverse-proxy `/v1` on the same HTTPS origin; Vite is not the production hosting plan.

## Connected flows

| Route | Behavior |
|---|---|
| Signed-out workspace | Registration/sign-in, validation/rate-limit/network errors |
| `/` | Daily order outcomes in the shop timezone, exact confirmed value and waiting sync count |
| `/settings` | Description, language and timezone; owners save, staff read |
| `/board` | Paginated pending/confirmed/declined attempts from PostgreSQL |
| `/orders/new` | Manual conversation/attempt creation with stable UUIDs and integer prices |
| `/orders/:id` | Saved summary and staff-recorded confirm/decline/unclear evidence bound to revision/hash |
| Confirmed order detail | Owners select an existing destination, review its exact row, queue a job and reconcile uncertainty without resending |
| `/inbox` and `/inbox/:id` | Saved customer conversations and their linked order history |
| `/docs` and `/brain` | Owner-editable documents and business knowledge notes; members can read |
| `/agents` | Saved instructions and a model chosen from the backend allowlist |
| `/workflows` | Persistent node/connection graph drafts with revision checks |

The sidebar uses the actual account/business. Multiple memberships enable workspace switching; reads are aborted and stale responses discarded. Switching is disabled during a write. Sign-out revokes the session and expiry clears the connected workspace. Tokens stay only in React memory, never localStorage/sessionStorage; refreshing requires signing in again. This is a local development login, not a persistent production cookie/session implementation.

Order/decision retries reuse their original IDs and payloads after transport failures. Requests have a 20-second deadline, reject redirects and never retry writes automatically. Backend constraints remain authoritative. The browser suite simulates losing a confirmation response after the real server commits, then checks one receipt/order.

Sheet jobs require an existing configured destination and enabled backend/worker flags. The destination and literal row are displayed before queueing. Active jobs refresh every three seconds. Google consent/callback and file picker UI are not connected yet. Disabled delivery returns a real error, not simulated success; tests never call Google or a model.

## AI chat and remaining previews

`/chat` connects to the AI Builder API. Owners select a backend-configured model for each message, consent to OpenAI processing and optionally enable configured public MCP reference tools. The chosen model is persisted by the backend and used by the worker. Saved conversations can be reopened; changing models preserves history. The UI polls queued replies and reuses the original message ID/model when retrying an uncertain request. See [AI_MCP.md](../AI_MCP.md) for configuration and migrations 015/016.

The five connected workspace pages use real, business-scoped records and no example banners. See [WORKSPACE_FEATURES.md](../WORKSPACE_FEATURES.md) for behavior, permissions, API contracts and persistence tests. Saving a workflow/agent configuration does not activate automation; Inbox entries do not send external messages.

`/canvas` remains a labelled preview. Original visual examples remain at `/preview/home`, `/preview/board`, `/preview/chat`, `/preview/inbox`, `/preview/docs`, `/preview/agents`, `/preview/brain` and `/preview/workflows`. Catalog release review, AI knowledge retrieval and Google setup remain separate integration work.

Run `npm.cmd run test:e2e -- --config playwright.ai.config.js` from `frontend` for the standalone AI browser suite. It uses controlled HTTP fixtures and requires no PostgreSQL or API key; it covers model switching, history, pending replies, retry identity, roles and mobile layout.

## Verification

```sh
npm --prefix frontend test
npm --prefix frontend exec playwright install chromium
npm --prefix frontend run test:e2e
```

Browser tests require `backend/.env.test` pointing exclusively to migrated `superagent_test`. Playwright starts an isolated API on 3199 and Vite on 4189, refuses existing servers and uses dedicated Chromium contexts. Run serially, without overlapping the backend integration suite. Tests create synthetic accounts/shops, clean their own fixtures and preserve/restore the shared loopback auth counter; server rate-limit thresholds are unchanged.

Scenarios cover profile persistence, real COD arithmetic, confirmation replay, revocation/logout, memory-only refresh, expiry, delayed reads across business switching, staff access, proxy errors, row preview, disabled delivery and 390px mobile layout. Screenshots/errors are ignored by git and traces disabled to avoid credential capture. Use synthetic data only.

## Dependency finding

Production dependency audit passes. Full dev audit reports the unpatched [picomatch repeated-extglob ReDoS advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), inherited through Vite/tinyglobby/fdir; five audit entries represent that chain. No patched release was available during this change. No suppressions, forced downgrades or reduced thresholds were applied. Dev servers remain loopback-only and user input is not used as glob patterns. Recheck/update tooling when a fix is available. See [SECURITY.md](SECURITY.md).
