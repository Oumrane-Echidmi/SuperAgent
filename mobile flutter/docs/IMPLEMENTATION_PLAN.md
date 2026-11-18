# Implementation plan and status

> Historical demo-port plan. The user's later request to follow the React
> frontend and connect Flutter to the backend supersedes the gates and progress
> below. See [CONNECTED_WORKSPACE.md](CONNECTED_WORKSPACE.md) for current scope,
> [HANDOFF.md](HANDOFF.md) for current implementation, and
> [VERIFICATION.md](VERIFICATION.md) for completed checks and remaining limits.

## Approval gates

1. Establish Flutter/Android toolchain and inspect source references.
2. Set up isolated app and source-derived design tokens/assets.
3. Implement **Home only** as the representative existing screen.
4. Compare Home at compact and large Android phone viewports. Record each difference and adaptation.
5. Stop for explicit user visual approval before porting the remaining eight existing screens.
6. Present proposed layouts and obtain approval before coding any architecture-required screen absent from the website.
7. Verify per-screen behavior, accessibility, platform build, and visual fidelity; update handoff.

## Existing-screen matrix

All nine existing pages are included. Desktop references live in `../previews/`; phone captures are in the session files folder recorded in `docs/VERIFICATION.md`.

| Screen | Source | Desktop reference | Preserve | Phone adaptation proposal | Status / conflict |
|---|---|---|---|---|---|
| Home | `../index.html` | `../previews/home.png` | Greeting, composer controls, suggested steps, Widgets, Todo, Needs to know; order and copy | Approved drawer; fit composer; stack widget columns | First representative. Keep separate from COD dashboard. |
| Chat | `../views/chat.html` | `../previews/chat.png` | Chat/agent list, selected agent, work log, read-only composer | List-to-conversation navigation instead of clipped panes | Builder chat is a separate new flow. |
| Inbox | `../views/inbox.html` | `../previews/inbox.png` | Filters, search, message list, email thread, reply editor, properties | List-to-thread navigation; preserve all details/actions | Captured Gmail Inbox remains distinct from new WhatsApp operations inbox. |
| Board | `../views/board.html` | `../previews/board.png` | Filters, Kanban columns, tickets, tags, assignees, dates, progress | Horizontally pannable columns | Keep team board distinct from orders. |
| Agents | `../views/agents.html` | `../previews/agents.png` | Tabs, status filters, agent descriptions, workload, activity, runs | Compact rows preserving every field and order | Captured demo catalog is not proof of live agents. |
| Docs | `../views/docs.html` | `../previews/docs.png` | Source tabs, headings, names/descriptions, type, status, updated times | Compact source rows retaining all columns | Live retrieval/upload requires API. |
| Company Brain | `../views/company-brain.html` | `../previews/company-brain.png` | DNA cards, review strip, observations, graph | Stack cards; preserve a navigable/pannable graph | Keep distinct from onboarding. |
| Workflows | `../views/workflows.html` | `../previews/workflows.png` | Tabs, filters, approvals, cards, schedules, statuses, errors | One-column cards and responsive filters | Existing approval queue differs from revision-bound Builder approval. |
| Canvas | `../views/canvas.html` | `../previews/canvas.png` | Media nodes, prompts, images, branches, edges, metadata | Pannable/zoomable canvas, not a linear list | Preserve media canvas; workflow admin studio is separate. |

At 390×844, captured pages hide the desktop sidebar without showing a menu and exhibit significant clipping/overflow. No usable alternate mobile navigation was found. The approved drawer is a deliberate adaptation. Re-evaluate only if new source evidence reveals an existing mobile navigation.

## Architecture-required new screens

These are not present in the website and must not be described as exact reproductions. Present proposed layout and obtain approval before implementation:

- Authentication/session and tenant entry (auth UI and backend contract unspecified).
- Business profile and goal setup.
- Builder conversation, scenario match, and clarification (not the existing Chat screen).
- Draft/workflow review, simulation, and revision-bound approval (not the existing Workflows screen).
- WhatsApp Business and Google Sheets account/destination setup (not the existing Gmail Inbox).
- Publish confirmation and activation status.
- COD outcomes dashboard (separate from existing Home).
- WhatsApp operational inbox/conversation and human takeover.
- COD order/run detail, sheet-sync state, and safe recovery.
- Published workflow pause/edit controls where the Phase 1 API supports them.

The architecture assigns the Platform Admin Workflow Studio to a React admin console. Its exclusion from Flutter is proposed and should be confirmed if scope changes. Phase 2 and Phase 3 remain outside the selected Phase 1 scope; this does not exclude any existing website screen.

## Progress

- Source inventory, desktop/phone reference capture, and toolchain preflight: complete.
- Isolated project folders and source font copies: started.
- Flutter app scaffold and representative Home: not started; waiting on SDK downloads/toolchain installation.
- Visual comparison and approval: not started.
- Other existing screens: not started (must wait for Home approval).
- New architecture screens: not started (must wait for proposed-layout approval).
- Live integrations: blocked until the shared backend/API and provider configuration are available.
