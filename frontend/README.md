# Winterfruit workspace (frontend)

React recreation of the nine Winterfruit workspace screens. All data is local mock
data; there is no backend integration.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (by default `http://localhost:4173`).

## Build

```bash
npm run build
npm run preview
```

## Routes

| Route        | Screen        |
| ------------ | ------------- |
| `/`          | Home          |
| `/chat`      | Chat          |
| `/inbox`     | Inbox         |
| `/board`     | Board         |
| `/agents`    | Agents        |
| `/docs`      | Docs          |
| `/brain`     | Company Brain |
| `/workflows` | Workflows     |
| `/canvas`    | Canvas        |

## Structure

- `src/pages` — one component per workspace screen.
- `src/data` — mock workspace data (agents, docs, workflows, canvas nodes, etc.).
- `src/styles` — shared shell plus one stylesheet per screen.
- `src/components` — page shell, modal, tabs, dropdown, and other shared UI.
- `public/canvas-art` — painterly Canvas artwork crops.
- `assets` — original reference screenshots used while matching the design.
