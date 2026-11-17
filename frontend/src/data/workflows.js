export const initialWorkflows = [
  {
    id: "competitor-pricing",
    title: "Competitor pricing crawl",
    fill: "Competitor pricing",
    art: "database",
    icon: "database",
    status: "ACTIVE",
    kind: "autopilot",
    meta: [
      { type: "scheduled", label: "Scheduled" },
      { type: "pill", label: "Every day at 05:00 UTC" },
      { type: "ok", label: "about 11 hours ago" },
    ],
  },
  {
    id: "weekly-growth",
    title: "Weekly growth audit",
    description: "Reviews activation, retention and revenue, then files what needs a human.",
    art: "purple",
    status: "ACTIVE",
    kind: "autopilot",
    meta: [
      { type: "pill", label: "Weekly Mon 9:00 AM UTC" },
      { type: "ok", label: "7h ago" },
    ],
  },
  {
    id: "inbound-triage",
    title: "Inbound reply triage",
    description:
      "Reads new mail in the shared inbox, drafts a reply, and asks before it sends.",
    art: "sun",
    status: "ACTIVE",
    kind: "workflow",
    meta: [
      { type: "plain", label: "When a connected inbox receives email" },
      { type: "ok", label: "7m ago" },
    ],
  },
  {
    id: "failed-payment",
    title: "Failed payment watch",
    description:
      "Checks Stripe each morning for failed charges and flags the accounts at risk.",
    art: "green",
    status: "ACTIVE",
    kind: "workflow",
    meta: [
      { type: "pill", label: "Daily 8:00 AM UTC" },
      { type: "ok", label: "4h ago" },
    ],
  },
  {
    id: "trial-reactivation",
    title: "Trial reactivation nudges",
    description:
      "Emails trials that stalled before their first integration. Off while the mobile fix lands.",
    art: "lime",
    status: "PAUSED",
    kind: "autopilot",
    meta: [
      { type: "pill", label: "Weekly Tue 3:00 PM UTC" },
      { type: "ok", label: "9d ago" },
    ],
  },
  {
    id: "backorder-alerts",
    title: "Backorder customer alerts",
    description:
      "Watches inventory levels for the top 200 SKUs and drafts a buyer email when stock falls below reorder point with no PO within five days.",
    art: "violet",
    status: "ACTIVE",
    kind: "workflow",
    meta: [
      { type: "pill", label: "Daily 6:00 AM UTC" },
      { type: "warn", label: "18h ago" },
    ],
  },
  {
    id: "mobile-onboarding",
    title: "Mobile onboarding recovery",
    description:
      "Finds trials that stalled on the connect-data step, drafts a recovery email, and waits for approval.",
    art: "mint",
    icon: "users",
    status: "ACTIVE",
    kind: "workflow",
    meta: [
      { type: "node", label: "8 nodes" },
      { type: "pill", label: "Daily 7:00 AM UTC" },
      { type: "info", label: "3m ago" },
    ],
  },
  {
    id: "churn-digest",
    title: "Churn-risk digest",
    description:
      "Scores accounts on usage and payment health, then posts the top ten to the team.",
    art: "amber",
    icon: "grid",
    status: "ACTIVE",
    kind: "autopilot",
    meta: [
      { type: "node", label: "6 nodes" },
      { type: "pill", label: "Weekly Fri 4:00 PM UTC" },
      { type: "ok", label: "2h ago" },
    ],
  },
  {
    id: "signup-enrichment",
    title: "Signup enrichment",
    description:
      "Enriches every new signup with company, role and stack before it reaches the board.",
    art: "chartreuse",
    icon: "grid",
    status: "ACTIVE",
    kind: "workflow",
    meta: [
      { type: "node", label: "7 nodes" },
      { type: "trigger", label: "Webhook trigger" },
      { type: "ok", label: "42m ago" },
    ],
  },
  {
    id: "investor-update",
    title: "Investor update draft",
    description:
      "Pulls the month's revenue and activation numbers into a draft update.",
    art: "pink",
    icon: "grip",
    status: "PAUSED",
    kind: "autopilot",
    note: "Paused automatically after 3 failed runs — the revenue step timed out.",
    meta: [
      { type: "node", label: "7 nodes" },
      { type: "pill", label: "Monthly · 1st at 6:00 AM UTC" },
      { type: "warn", label: "3d ago" },
    ],
  },
];

export const initialArchivedWorkflows = [
  {
    id: "legacy-lead-router",
    title: "Legacy lead router",
    description: "The old form-to-rep router. Replaced by Signup enrichment in October.",
    art: "violet",
    icon: "grid",
    status: "ARCHIVED",
    kind: "workflow",
    archivedAt: "3 weeks ago",
    meta: [
      { type: "node", label: "4 nodes" },
      { type: "plain", label: "Form submission" },
      { type: "warn", label: "Archived 3 weeks ago" },
    ],
  },
  {
    id: "weekly-pipeline-email",
    title: "Weekly pipeline email",
    description: "A Monday digest of open pipeline. The growth audit now covers it.",
    art: "lime",
    status: "ARCHIVED",
    kind: "autopilot",
    archivedAt: "2 months ago",
    meta: [
      { type: "pill", label: "Weekly Mon 6:00 AM UTC" },
      { type: "warn", label: "Archived 2 months ago" },
    ],
  },
];

export const initialApprovals = [
  {
    id: "approve-mobile",
    title: "Mobile onboarding recovery",
    time: "25m ago",
    description:
      "6 recovery emails are drafted for trials that stalled on mobile. Send them?",
    success: "6 recovery emails approved.",
  },
  {
    id: "approve-signup",
    title: "Signup enrichment",
    time: "3h ago",
    description:
      "12 enriched contacts look like duplicates of rows already on the board. Merge them?",
    success: "12 contacts merged into existing rows.",
  },
];

export const runs = [
  {
    id: "r1",
    workflow: "Competitor pricing crawl",
    status: "Succeeded",
    started: "Today, 05:00",
    duration: "1m 12s",
    trigger: "Schedule",
  },
  {
    id: "r2",
    workflow: "Mobile onboarding recovery",
    status: "Waiting",
    started: "Today, 07:03",
    duration: "—",
    trigger: "Manual",
  },
  {
    id: "r3",
    workflow: "Failed payment watch",
    status: "Succeeded",
    started: "Today, 08:00",
    duration: "42s",
    trigger: "Schedule",
  },
  {
    id: "r4",
    workflow: "Signup enrichment",
    status: "Succeeded",
    started: "Today, 09:41",
    duration: "8s",
    trigger: "Webhook",
  },
  {
    id: "r5",
    workflow: "Weekly growth audit",
    status: "Succeeded",
    started: "Mon, 09:00",
    duration: "3m 48s",
    trigger: "Schedule",
  },
  {
    id: "r6",
    workflow: "Investor update draft",
    status: "Failed",
    started: "Fri, 06:00",
    duration: "1m 04s",
    trigger: "Schedule",
  },
  {
    id: "r7",
    workflow: "Churn-risk digest",
    status: "Succeeded",
    started: "Fri, 16:00",
    duration: "1m 31s",
    trigger: "Schedule",
  },
  {
    id: "r8",
    workflow: "Trial reactivation nudges",
    status: "Paused",
    started: "Tue, 15:00",
    duration: "1m 09s",
    trigger: "Schedule",
  },
  {
    id: "r9",
    workflow: "Backorder customer alerts",
    status: "Succeeded",
    started: "Yesterday, 06:00",
    duration: "55s",
    trigger: "Schedule",
  },
  {
    id: "r10",
    workflow: "Competitor pricing crawl",
    status: "Failed",
    started: "Yesterday, 05:00",
    duration: "2m 17s",
    trigger: "Schedule",
  },
];

export const upcoming = [
  {
    day: "Today",
    count: 3,
    items: [
      {
        id: "u1",
        time: "12:00",
        title: "Inbound reply triage",
        meta: "Waiting for a new inbox thread",
        trigger: "Event",
      },
      {
        id: "u2",
        time: "15:30",
        title: "Competitor watch refresh",
        meta: "Every 4 hours",
        trigger: "Schedule",
      },
      {
        id: "u3",
        time: "17:00",
        title: "Churn-risk digest",
        meta: "Top ten accounts to the team",
        trigger: "Schedule",
      },
    ],
  },
  {
    day: "Tomorrow",
    count: 2,
    items: [
      {
        id: "u4",
        time: "05:00",
        title: "Competitor pricing crawl",
        meta: "Every day at 05:00 UTC",
        trigger: "Schedule",
      },
      {
        id: "u5",
        time: "08:00",
        title: "Failed payment watch",
        meta: "Stripe failed charges",
        trigger: "Schedule",
      },
    ],
  },
  {
    day: "This week",
    count: 4,
    items: [
      {
        id: "u6",
        time: "Wed 07:00",
        title: "Mobile onboarding recovery",
        meta: "8 nodes · trials stalled on connect-data",
        trigger: "Schedule",
      },
      {
        id: "u7",
        time: "Thu 06:00",
        title: "Backorder customer alerts",
        meta: "Top 200 SKUs · reorder point",
        trigger: "Schedule",
      },
      {
        id: "u8",
        time: "Fri 16:00",
        title: "Churn-risk digest",
        meta: "Weekly account health post",
        trigger: "Schedule",
      },
      {
        id: "u9",
        time: "Sun 18:00",
        title: "Weekly growth audit",
        meta: "Activation, retention and revenue",
        trigger: "Schedule",
      },
    ],
  },
];

export const templates = [
  {
    id: "tpl-renewal",
    title: "Renewal risk digest",
    description:
      "Scores accounts before renewal, drafts a save plan, and routes the top risks to the owner.",
    art: "purple",
    icon: null,
    category: "Revenue",
    nodes: 6,
    cadence: "Weekly",
  },
  {
    id: "tpl-lead",
    title: "Lead routing",
    description:
      "Enriches a new lead, checks for duplicates, and assigns the right owner in seconds.",
    art: "chartreuse",
    icon: "grid",
    category: "Sales",
    nodes: 4,
    cadence: "Webhook",
  },
  {
    id: "tpl-pipeline",
    title: "Weekly pipeline review",
    description:
      "Pulls the week's movement, flags stalled deals, and posts a summary to the team.",
    art: "sun",
    icon: null,
    category: "Revenue",
    nodes: 5,
    cadence: "Weekly",
  },
  {
    id: "tpl-support",
    title: "Support macro refresh",
    description:
      "Finds repeated questions in support, drafts new macros, and asks for approval.",
    art: "mint",
    icon: "users",
    category: "Support",
    nodes: 7,
    cadence: "Monthly",
  },
  {
    id: "tpl-teardown",
    title: "Competitor teardown",
    description:
      "Watches competitor pages and turns every meaningful change into a reviewed teardown.",
    art: "amber",
    icon: "grid",
    category: "Marketing",
    nodes: 5,
    cadence: "Weekly",
  },
  {
    id: "tpl-invoice",
    title: "Invoice follow-up",
    description:
      "Drafts polite reminders for overdue invoices and escalates the ones older than 30 days.",
    art: "pink",
    icon: "grip",
    category: "Finance",
    nodes: 4,
    cadence: "Daily",
  },
];
