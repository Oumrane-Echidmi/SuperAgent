# OpenAI and MCP setup

The Builder uses OpenAI's Responses API through its dedicated background worker. API keys stay in `backend/.env` or the worker's secret environment; they are never sent to the frontend or MCP servers. MCP support connects SuperAgent to remote public reference servers. It does not expose SuperAgent as an MCP server or run local commands.

## Configure AI

Keep the existing database configuration in `backend/.env` and set:

```dotenv
BUILDER_AI_ENABLED=true
BUILDER_AI_MODEL=gpt-4.1-mini
BUILDER_AI_MODELS=gpt-4.1-mini,gpt-4.1
OPENAI_API_KEY=your-real-api-key
BUILDER_WORKER_DATABASE_PASSWORD=your-separate-random-password-at-least-24-characters
BUILDER_WORKER_DATABASE_URL=postgresql://superagent_builder_worker:your-worker-password@127.0.0.1:5433/superagent
BUILDER_MCP_SERVERS_JSON=[]
```

Use OpenAI models that support Responses, structured outputs and remote MCP. The example uses the [GPT-4.1 family](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-4.1). `BUILDER_AI_MODELS` is a comma-separated allowlist of up to eight IDs and must include `BUILDER_AI_MODEL`. If omitted, only the default model is offered. Set the same model configuration in the API and worker environments, and restart both after changes. The API and worker validate the allowlist independently. Never commit `.env` or put the key in a `VITE_` variable. Both processes must use the same migrated database; only the worker needs the API key and worker database credentials.

From the repository root:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

In a separate terminal:

```powershell
npm.cmd run worker:builder
```

Migration `015_builder_mcp.sql` adds MCP consent, defaulting existing sessions to false. Apply it before restarting the API and worker. Do not deploy the new API or worker against an unmigrated database. The prompt version changes to `builder-1.1.0`; previously queued turns fail with `PROMPT_VERSION_CHANGED` instead of silently running under new instructions. Submit a new message after reviewing that failure.

## Add MCP servers

For example, configure the public OpenAI documentation server in the worker environment:

```dotenv
BUILDER_MCP_SERVERS_JSON=[{"label":"openai_docs","url":"https://developers.openai.com/mcp","tools":["search_openai_docs"]}]
```

The configuration accepts up to four unique labels, public HTTPS URLs on port 443 and up to 20 explicit tool names per server. Wildcards, credentials, query strings, IP literals, local hostnames and arbitrary extra settings are rejected. Restart the worker after configuration changes. URLs and tool names are operator configuration, never values taken from chat text.

Only add servers you trust and tools you have reviewed as reading information without modifying data. OpenAI also filters the listed tools by their server-declared read-only annotation. A server's annotation is a trust claim, not a sandbox guarantee. Each consenting request allows at most four tool calls within the existing 20-second provider timeout. No retries are made automatically. Authenticated MCP servers, local stdio servers and write tools are outside this implementation.

Before enabling consent, tell the owner which servers and tools are configured and that setup conversation data may be sent to them. The model is instructed to exclude credentials and customer personal data from arguments; do not include those in setup messages. Consent covers the configured servers for the session, so obtain fresh consent in a new session when changing the server list. To stop tool access immediately, set the server list to `[]` and restart the worker.

Create an authenticated Builder session through the existing API:

```http
POST /v1/tenants/:tenantId/builder/sessions
Authorization: Bearer <owner-session-token>
Content-Type: application/json

{
  "id": "<new-uuid>",
  "language": "fr",
  "consentToOpenAI": true,
  "consentToMcp": true
}
```

Then POST `{ "id": "<new-message-uuid>", "expectedRevision": 0, "text": "Describe the assistant you want" }` to `/v1/tenants/:tenantId/builder/sessions/:id/messages`. Poll GET `/v1/tenants/:tenantId/builder/sessions/:id` for the worker result. These endpoints require owner membership for writes and retain the existing tenant isolation, durable message IDs and 20-request daily quota.

Omit `consentToMcp` or set it to false for AI without MCP. Reusing a session UUID with changed language or consent returns `409 SESSION_ID_REUSED`; create a new session to change consent. Neither MCP nor AI can create, approve or publish a workflow through this integration. Unexpected tool names, server labels, approval requests, provider errors and invalid responses fail closed with safe error codes.

## Choose a model in the frontend

Sign in and open **Chat** (`/chat`). Select **AI model**, consent to OpenAI processing, describe the assistant and send. Each message includes the selected model ID, which the backend validates and saves on the queued turn. Changing models affects your next message and preserves the conversation. Replies show the actual provider model. Only owners can send; staff can view saved conversations.

The authenticated `GET /v1/tenants/:tenantId/builder/models` endpoint provides model choices, the default, enable state and public MCP disclosures. It never includes API keys. Messages accept an optional `model`; omitted values use the configured default. Reusing a message UUID with an explicitly changed model returns `409 MESSAGE_ID_REUSED`. The worker uses the saved model and rejects models removed from its allowlist with `MODEL_NOT_ALLOWED`, without a provider call. Existing turns with no pinned model continue to use the worker default.

Apply migration `016_builder_models.sql` before starting the updated API and worker. The UI polls queued replies, preserves message IDs across uncertain transport retries and blocks model changes until the pending message is resolved. The original example Chat remains available at `/preview/chat`.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:integration
npm.cmd run test:e2e --prefix frontend -- --config playwright.ai.config.js
```

Integration tests require the dedicated PostgreSQL test database, configured worker login and all migrations applied using `npm.cmd run db:setup:test --workspace backend`. The separate AI browser suite uses a real browser and controlled HTTP fixtures without PostgreSQL. It covers model changes, history, pending replies, retry identity, roles and mobile layout. Provider tests use synthetic data and a fake transport, with no paid API requests. Live OpenAI/MCP verification requires a real API key and reachable configured servers.

Implementation follows the [OpenAI remote MCP documentation](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) and [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create).
