export const initialAgents = [
  {
    name: "Assistant",
    system: true,
    description: "Answers questions about the workspace and routes the work.",
    status: "idle",
    workload: "0/1",
    activity: [12, 18, 10, 22, 16, 9, 20, 14, 8, 17],
    runs: 214,
    palette: ["#f0abfc", "#d946ef", "#a21caf"],
    prompt:
      "Answer workspace questions with citations. Route work to the agent that owns it, and never take an external action without approval.",
  },
  {
    name: "Revenue Watch",
    description: "Watches Stripe for failed payments and churn signals.",
    status: "idle",
    workload: "0/1",
    activity: [8, 10, 14, 9, 18, 22, 16, 12, 19, 9],
    runs: 61,
    palette: ["#c084fc", "#a855f7", "#6b21a8"],
    prompt:
      "Monitor failed payments and dunning events. Draft a recovery note when an account is at risk and route refunds to a human.",
  },
  {
    name: "Inbox Concierge",
    description: "Reads the shared inbox and drafts replies for review.",
    status: "idle",
    workload: "0/1",
    activity: [14, 9, 18, 21, 12, 16, 10, 22, 14, 8],
    runs: 132,
    palette: ["#fbbf24", "#f59e0b", "#c2410c"],
    prompt:
      "Triage the shared inbox. Draft replies in the customer's language, attach order references, and leave every send for review.",
  },
  {
    name: "Growth Analyst",
    description: "Finds activation drop-offs and drafts evidence-backed tickets.",
    status: "idle",
    workload: "0/1",
    activity: [7, 12, 9, 15, 10, 18, 7, 11, 13, 6],
    runs: 46,
    palette: ["#fde047", "#facc15", "#b45309"],
    prompt:
      "Trace funnel changes against product and deployment events. Cite the data source for every claim and open a ticket with a scoped fix.",
  },
];

export const initialArchivedAgents = [
  {
    name: "Legacy Support Bot",
    description: "Answered common questions before Inbox Concierge.",
    status: "archived",
    workload: "0/0",
    activity: [3, 4, 2, 5, 3, 2, 4, 3, 2, 1],
    runs: 1284,
    archivedAt: "12 days ago",
    palette: ["#a8a29e", "#78716c", "#57534e"],
    prompt: "Retired — the Inbox Concierge owns customer replies now.",
  },
  {
    name: "Billing Scout",
    description: "Scanned invoices before Revenue Watch existed.",
    status: "archived",
    workload: "0/0",
    activity: [2, 3, 2, 4, 2, 3, 1, 2, 1, 1],
    runs: 320,
    archivedAt: "1 month ago",
    palette: ["#94a3b8", "#64748b", "#334155"],
    prompt: "Retired — invoice review moved to Revenue Watch.",
  },
];

export const squads = [
  {
    name: "Revenue pod",
    description: "Watches revenue and activation together, then files the follow-up.",
    members: ["Revenue Watch", "Growth Analyst"],
    runs: 107,
    activity: 0.82,
  },
  {
    name: "Front of house",
    description: "Keeps the inbox moving and answers workspace questions.",
    members: ["Inbox Concierge", "Assistant"],
    runs: 346,
    activity: 0.64,
  },
];

export const skills = [
  { name: "Read shared inbox", agent: "Inbox Concierge", uses: 132 },
  { name: "Draft customer replies", agent: "Inbox Concierge", uses: 96 },
  { name: "Query PostHog funnels", agent: "Growth Analyst", uses: 46 },
  { name: "Summarise Stripe events", agent: "Revenue Watch", uses: 61 },
  { name: "Check order readiness", agent: "Growth Analyst", uses: 38 },
  { name: "Route approvals", agent: "Assistant", uses: 214 },
];

export const connections = [
  { name: "Gmail", detail: "support@winterfruit.example", status: "Connected", kind: "mail" },
  { name: "PostHog", detail: "Winterfruit production project", status: "Connected", kind: "analytics" },
  { name: "Stripe", detail: "Live account · read only", status: "Connected", kind: "billing" },
  { name: "Google Sheets", detail: "Order sync spreadsheet", status: "Needs attention", kind: "sheet" },
  { name: "Slack", detail: "Not connected", status: "Missing", kind: "chat" },
];
