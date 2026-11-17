export const chatAgents = [
  {
    name: "Assistant",
    description: "Answers questions about the workspace and routes the work.",
    palette: ["#f0abfc", "#d946ef", "#a21caf"],
  },
  {
    name: "Growth Analyst",
    description: "Finds activation drop-offs and drafts evidence-backed tickets.",
    palette: ["#fde047", "#facc15", "#b45309"],
  },
  {
    name: "Inbox Concierge",
    description: "Reads the shared inbox and drafts replies for review.",
    palette: ["#fbbf24", "#f59e0b", "#c2410c"],
  },
  {
    name: "Revenue Watch",
    description: "Watches failed payments and churn signals.",
    palette: ["#c084fc", "#a855f7", "#6b21a8"],
  },
];

export const workLogEight = [
  "Pulled the PostHog mobile funnel for the last 21 days",
  "Compared abandon spikes against the Tuesday deploy",
  "Checked Brand Profile activation gate",
  "Reviewed 214 mobile trials in the window",
  "Confirmed Stripe paid conversion against baseline",
  "Opened AI-251 and moved it into progress",
  "Scoped the connect-data recovery patch",
  "Queued a 24-hour activation re-run",
];

export const workLogThree = [
  "Searched progressive onboarding patterns",
  "Searched visible retry state patterns",
  "Synthesised both fixes against the mobile funnel",
];

export const citations = [
  {
    tag: "K1",
    title: "Progressive onboarding: verify later, not first",
    source: "example.com",
    text: "Deferring an identity or account check until after a user's first successful action recovers most of what a hard gate loses.",
  },
  {
    tag: "K2",
    title: "Visible retry states outperform silent failure",
    source: "example.com",
    text: "A stalled connection that shows retry progress keeps more users than one that just goes quiet.",
  },
];

export const questionOptions = [
  { id: "defer", label: "Defer verification until after first run" },
  { id: "retry", label: "Add visible retry with progress state" },
  { id: "both", label: "Both — retry now, defer verification next sprint" },
  { id: "other", label: "Something else" },
];

export const comparison = {
  title: "Connect-data fix comparison",
  subtitle: "3 records · Modelled against the last 21 days of mobile trials",
  columns: ["Fix", "Connect-data pts", "Trial → paid pts", "Eng days"],
  rows: [
    ["Defer verification", "6", "1.1", "2"],
    ["Visible retry + progress", "3", "0.5", "1"],
    ["Both, staged", "6", "1.1", "3"],
  ],
};

export const liveSuggestions = [
  "Summarise what my agents did today",
  "What in my inbox needs attention?",
  "Draft replies to anything waiting",
];

export function buildLiveReply(prompt) {
  const value = prompt.toLowerCase();

  if (value.includes("inbox") || value.includes("attention")) {
    return {
      intro: "Three threads need a human before anything else:",
      bullets: [
        "Karen Holt is waiting on PO-48291 — the gasket kit for Line 3 ships Friday if we confirm.",
        "Priya Raman asked for updated pricing on 40 seats; the last quote expires this week.",
        "Mike Sanders received M10 fasteners instead of M12 on PO-39017 and needs a replacement commitment.",
      ],
      outro:
        "I can draft all three replies and route them to the shared inbox for review. The rest of the queue is marketing and can wait.",
      log: ["Read 18 inbox threads", "Ranked by reply age and deal risk", "Drafted three response options"],
    };
  }

  if (value.includes("draft") || value.includes("repl")) {
    return {
      intro: "I drafted three replies and left each one in the shared inbox for review:",
      bullets: [
        "Karen Holt — confirmation that PO-48291 is unchanged, with a Friday ship date.",
        "Priya Raman — a refreshed 40-seat quote with the annual discount applied.",
        "Mike Sanders — an apology, a replacement M12 shipment, and a return label for the M10 kit.",
      ],
      outro:
        "Nothing has been sent. Open the inbox to edit or approve any of the drafts; the ticket references are already attached.",
      log: ["Read the three open threads", "Matched each request to an order", "Prepared reply drafts"],
    };
  }

  if (value.includes("feature") || value.includes("people using") || value.includes("usage")) {
    return {
      intro: "Usage over the last 30 days is concentrated in four workflows:",
      bullets: [
        "Inbox triage — 132 runs, 61% of all agent activity.",
        "Growth audits — 46 runs, with a 24% week-over-week increase.",
        "Failed payment watch — 61 runs, recovering $18.2k in at-risk revenue.",
        "Mobile onboarding recovery — 8 runs since the new fix landed.",
      ],
      outro:
        "The long tail is quiet. I would keep the four active agents and archive the two experiments that have not run in 14 days.",
      log: ["Read agent run history", "Grouped the last 30 days", "Compared week-over-week activity"],
    };
  }

  if (value.includes("stall") || value.includes("day-3") || value.includes("trial")) {
    return {
      intro: "Day-3 is the right cut-off. Here is the sequence I would ship:",
      bullets: [
        "Day 3 — a short nudge from the owner with one concrete setup step.",
        "Day 5 — offer a 15-minute setup call, not another email.",
        "Day 7 — close the loop with a plain-language reason and an easy restart link.",
      ],
      outro:
        "That recovers 38 stalled mobile trials without touching the activation definition. I can draft the three messages and add them to Mobile onboarding recovery.",
      log: ["Read 214 mobile trials", "Found 38 day-3 stalls", "Mapped a three-touch sequence"],
    };
  }

  return {
    intro: "Here is what I found across the workspace:",
    bullets: [
      "Mobile trials are still 9 points below baseline on the connect-data step; AI-251 is in review with the fix.",
      "The shared inbox has three threads that need a human, all inside the last hour.",
      "Revenue Watch recovered one failed payment and flagged two accounts for follow-up.",
    ],
    outro:
      "I have kept everything within the workspace for review. Tell me which thread you want me to take first and I will open a scoped run.",
    log: ["Read workspace activity", "Checked open agent runs", "Grouped the open decisions"],
  };
}
