export const sources = [
  {
    id: "s1",
    name: "Brand Profile",
    description: "Positioning + ICP",
    type: "manual",
    status: "Ready",
    updated: "4h ago",
  },
  {
    id: "s2",
    name: "ICP — mid-market RevOps",
    description: "Segments, trigger events, disqualifiers",
    type: "manual",
    status: "Ready",
    updated: "2d ago",
  },
  {
    id: "s3",
    name: "Q3 discovery — call notes",
    description: "Three customer calls, one repeated ask",
    type: "manual",
    status: "Ready",
    updated: "5h ago",
  },
  {
    id: "s4",
    name: "Teardown — Meridian",
    description: "Where they win, where we win, objection handling",
    type: "manual",
    status: "Ready",
    updated: "5d ago",
  },
  {
    id: "s5",
    name: "Activation — metric definitions",
    description: "The definitions every report must use",
    type: "manual",
    status: "Ready",
    updated: "19h ago",
  },
  {
    id: "s6",
    name: "Pricing and packaging v3",
    description: "Plans, what changed from v2, discount policy",
    type: "manual",
    status: "Ready",
    updated: "9d ago",
  },
  {
    id: "s7",
    name: "docs.winterfruit.com",
    description: "84 public docs pages, refreshed nightly",
    type: "website",
    status: "Ready",
    updated: "9h ago",
  },
  {
    id: "s8",
    name: "Security and DPA one-pager.pdf",
    description: "SOC 2, residency, sub-processors, retention",
    type: "file",
    status: "Ready",
    updated: "17d ago",
  },
  {
    id: "s9",
    name: "Support escalations — Gmail",
    description: "Threads flagged escalation, rolling 30 days",
    type: "connection",
    status: "Indexing",
    updated: "4m ago",
  },
  {
    id: "s10",
    name: "Q4 content calendar — campaign brief",
    description: "Which content calendar rows double as sales follow-up",
    type: "manual",
    status: "Ready",
    updated: "7h ago",
  },
];

export const csvs = [
  {
    id: "c1",
    name: "Supplier",
    rows: 12,
    updated: "4d ago",
  },
];

export const tables = [
  { id: "t1", name: "Customer", rows: 1284, source: "scheduled", updated: "23m ago" },
  { id: "t2", name: "Order", rows: 9640, source: "scheduled", updated: "15m ago" },
  { id: "t3", name: "SKU", rows: 412, source: "manual", updated: "5h ago" },
  { id: "t4", name: "Trial signup", rows: 2106, source: "scheduled", updated: "8m ago" },
  { id: "t5", name: "Support thread", rows: 583, source: "agent", updated: "42m ago" },
  { id: "t6", name: "Competitor pricing", rows: 10, source: "scheduled", updated: "1h ago" },
  { id: "t7", name: "Lead", rows: 18, source: "scheduled", updated: "3h ago" },
  { id: "t8", name: "Content calendar", rows: 18, source: "manual", updated: "7h ago" },
  { id: "t9", name: "Competitor watch", rows: 18, source: "scheduled", updated: "1h ago" },
];

export const competitors = [
  { id: "p1", name: "Meridian", url: "https://meridian.example", updated: "1h ago" },
  { id: "p2", name: "Loopwise", url: "https://loopwise.example", updated: "3d ago" },
  { id: "p3", name: "Cadence CRM", url: "https://cadencecrm.example", updated: "8d ago" },
  { id: "p4", name: "Northstar Labs", url: "https://northstarlabs.example", updated: "3h ago" },
];
