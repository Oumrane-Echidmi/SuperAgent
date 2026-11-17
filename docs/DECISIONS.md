# Decisions

## Approved scope and constraints

- Target Android only.
- Keep the website as the exact visual source of truth for all nine existing screens.
- Do not modify the source website, including branding.
- Port every existing screen; no omission because of the architecture's narrower COD workflow.
- Use a compact drawer derived from the existing sidebar; no bottom tabs.
- Implement Home first, then stop for visual approval based on compact and large phone comparisons before porting other existing screens.
- Present layouts for architecture-required screens absent from the website for approval before implementation.

## Architecture and implementation

- Keep all app code/assets under `superagent/`; the website snapshot remains independently runnable.
- Keep the React/admin Workflow Studio out of Flutter unless the user approves changed scope.
- Backend owns authentication authorization, credentials, workflow compilation/execution, external side effects, tenant isolation, idempotency, and recovery.
- Use visibly labeled fixtures only while API access is unavailable.

## Environment setup

- User authorized installation of Flutter/Android tools in user-local locations under `%LOCALAPPDATA%\SuperAgentToolchain`.
- Official Flutter stable 3.50.0 archive, Eclipse Temurin JDK 17, and Android SDK command-line packages are being downloaded/installed there. Validate published hashes before using archives.
