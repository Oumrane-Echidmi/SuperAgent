# Web integration boundaries

Connected screens render API/form values as React text and convert decimal prices to bounded integer minor units. They never interpret returned text as code, HTML, workflow authority or credentials. Server membership, revision/hash and database policies remain authoritative.

The client uses relative `/v1` paths, rejects redirects/arbitrary destinations, omits cookies and sends opaque bearers only to the same-origin API proxy. Tokens stay in React memory, never localStorage/sessionStorage, URLs or persisted caches. Refreshing requires signing in again. Client timeouts do not prove rollback; orders/decisions preserve IDs and payloads for explicit retries. Writes are never automatically retried. Production still requires HTTPS, verified recovery/signup controls and a deliberate persistent cookie/BFF design before public onboarding.

Tenant selection uses `/me` memberships. Requests include the selected tenant; stale reads are aborted/discarded and page state resets on switching. Writes disable workspace switching. Role controls are convenience only; the backend checks every call. Failed live requests never fall back to example data.

Spreadsheet delivery displays the pinned destination and exact row before an explicit queue request. Jobs/uncertain outcomes use backend state, not optimistic success messages. Google consent/file selection UI remains pending. Never put refresh tokens, vault keys, client secrets or database credentials in browser/VITE environment variables.

Vite binds to loopback with a trusted server-side API proxy. Production must serve static assets with a same-origin HTTPS reverse proxy, security headers and appropriate logging. Do not expose the dev server publicly. The production bundle does not contain database/vault configuration.

Full development audit reports unpatched [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): picomatch 4.0.7 is inherited through Vite's glob tooling. Production dependencies audit clean. This application does not accept user-supplied glob patterns; the finding is not suppressed or claimed fixed. Update tooling when an upstream fix is available.

Browser tests use a dedicated disposable database, synthetic identities and isolated Chromium. They never call Google or a model. Traces are off and artifacts ignored because even fixture request/DOM data may include credentials. Tests restore the pre-existing test-loopback counter and remove only their own tenants/users/email counters; do not overlap them with other database suites.
