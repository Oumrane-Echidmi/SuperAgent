const T = "Today";
const Y = "Yesterday";
const W = "This week";

function thread(mail) {
  return [
    {
      who: mail.name === "Tom Vasquez" ? "Tom Vasquez" : mail.name,
      time: "2 days ago",
      text:
        mail.id === "m-tom"
          ? "Following up on the mobile signup issue I mentioned on the call. Two of our accounts still get sent in a loop when they try to connect a data source."
          : "Following up on the thread below. Let me know what you need from our side to move this forward.",
    },
    {
      who: mail.id === "m-tom" ? "Nim" : "Nim",
      time: "1 day ago",
      text:
        mail.id === "m-tom"
          ? "Thanks Tom — the team reproduced it on mobile only. We are scoping a fix now and I will send the timeline once it is in review."
          : "Thanks for the note — I have it with the right person and will reply with a clear next step today.",
    },
  ];
}

function make(mail) {
  return {
    status: "Read",
    channel: "Gmail",
    connection: "support@winterfruit.example",
    ...mail,
    thread: thread(mail),
    to: mail.id === "m-tom" ? "tom@brightpath.io" : "support@winterfruit.example",
    received: mail.time,
    threadId: `19b4e7a755c1af${mail.id.slice(-2)}`,
  };
}

export const initialEmails = [
  make({
    id: "m-karen",
    name: "Karen Holt",
    email: "karen@northstar.example",
    group: T,
    time: "8 min ago",
    subject: "Status on PO-48291 — gasket kit for Line 3",
    preview: "Status on PO-48291 — gasket kit ...",
    flagged: true,
    unread: true,
    body:
      "Hi Nim,\n\nDo we have a confirmed ship date for PO-48291? Line 3 is scheduled to restart Monday and we need the gasket kit on site before the weekend.\n\nIf the date has moved, please send the revised schedule and I will update the production plan.\n\nBest,\nKaren",
    draft:
      "Hi Karen,\n\nPO-48291 is still on track to leave the warehouse Friday, which puts it on site Saturday morning — ahead of the Monday restart.\n\nI will send the tracking number as soon as the pallet is picked up. If anything changes before then, you will hear from me the same day.\n\nBest,\nNim",
  }),
  make({
    id: "m-priya",
    name: "Priya Raman",
    email: "priya@lumenlabs.example",
    group: T,
    time: "14 min ago",
    subject: "Re: Winterfruit pricing for 40 seats",
    preview: "Re: Winterfruit pricing for 40 seats",
    flagged: true,
    unread: true,
    body:
      "Hi Nim,\n\nThanks for the updated pricing. The 40-seat annual plan looks close to what we need, but I need clarity on the onboarding seats and whether the growth add-on is included.\n\nCould you send a revised quote that spells out both?\n\nThanks,\nPriya",
    draft:
      "Hi Priya,\n\nThanks for the note. The 40-seat annual plan includes onboarding for up to five seats, and the growth add-on is not included in the base quote.\n\nI have attached a revised quote that lists both line items separately so finance can compare them. It stays valid for 14 days.\n\nHappy to walk through it on a call if useful.\n\nBest,\nNim",
  }),
  make({
    id: "m-mike",
    name: "Mike Sanders",
    email: "mike@harborfab.example",
    group: T,
    time: "22 min ago",
    subject: "Wrong fasteners on PO-39017 — need M12, received M10",
    preview: "Wrong fasteners on PO-39017 — need M12, received M10",
    flagged: true,
    unread: true,
    body:
      "Nim,\n\nThe crate arrived this morning but the fasteners are M10, not the M12 we ordered. We cannot run the assembly line with the wrong size.\n\nCan you send the correct fasteners overnight and arrange a return label for this kit?\n\nMike",
    draft:
      "Hi Mike,\n\nApologies — the crate should have contained M12 fasteners and it did not. I have arranged an overnight replacement shipment for the correct kit, at no charge.\n\nA return label for the M10 crate is attached. The courier can collect it whenever suits you.\n\nI am sorry for the disruption to the line.\n\nNim",
  }),
  make({
    id: "m-tom",
    name: "Tom Vasquez",
    email: "tom@brightpath.io",
    group: T,
    time: "38 min ago",
    subject: "Mobile onboarding fix — what is the timeline?",
    preview: "Mobile onboarding fix — what is th...",
    flagged: false,
    unread: true,
    body:
      "Hi Tom,\n\nThanks for the detail — it matched what the funnel was showing, so we could act on it quickly.\n\nThe connect-data step on mobile is fixed in AI-251 and is in review now. It ships with Thursday's release, and the change also restores form recovery, so a half-finished signup survives a page reload.\n\nI would like to take you up on the beta build. Reply with the two accounts that got stuck and I will put them on the build tomorrow morning.\n\nNim",
    draft:
      "Hi Tom,\n\nThanks for the detail — it matched what the funnel was showing, so we could act on it quickly.\n\nThe connect-data step on mobile is fixed in AI-251 and is in review now. It ships with Thursday's release, and the change also restores form recovery, so a half-finished signup survives a page reload.\n\nI would like to take you up on the beta build. Reply with the two accounts that got stuck and I will put them on the build tomorrow morning.\n\nNim",
    signature: "Nim",
  }),
  make({
    id: "m-github",
    name: "GitHub",
    email: "notifications@github.example",
    group: T,
    time: "52 min ago",
    subject: "Review requested on PR #482 — restore mobile form recovery",
    preview: "Review requested on PR #482...",
    flagged: false,
    unread: true,
    body:
      "Marco Vidal requested your review on pull request #482.\n\nRestore mobile form recovery after the connect-data step.\n\n3 commits · 12 files changed · all checks passing.",
    draft:
      "On it — I will review #482 this afternoon and leave notes in the PR.",
  }),
  make({
    id: "m-susan",
    name: "Susan Park",
    email: "susan@freightline.example",
    group: T,
    time: "1 hour ago",
    subject: "Duplicate freight line on INV-2024-118",
    preview: "Duplicate freight line on INV-2024-...",
    flagged: false,
    unread: false,
    body:
      "Hi,\n\nInvoice INV-2024-118 appears to carry the freight charge twice. Could you confirm and issue a credit note if so?\n\nThanks,\nSusan",
    draft:
      "Hi Susan,\n\nYou are right — the freight line was billed twice. I have asked finance to issue a credit note today and will send the reference once it is available.\n\nSorry for the extra work on your side.\n\nNim",
  }),
  make({
    id: "m-concierge",
    name: "Inbox Concierge finished a task",
    email: "agent@winterfruit.example",
    group: T,
    time: "2 hours ago",
    subject: "Generated return labels for three POs",
    preview: "Generated return labels for three P...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "I generated return labels for the three open RMA requests and attached them to the matching tickets.\n\nAll three are ready for collection tomorrow morning. No external action was taken.",
    draft:
      "Thanks — I will check the three labels and confirm the collection window with the warehouse.",
  }),
  make({
    id: "m-hannah",
    name: "Hannah Okafor",
    email: "hannah@meridian.example",
    group: T,
    time: "3 hours ago",
    subject: "Security questionnaire before the pilot",
    preview: "Security questionnaire before the pl...",
    flagged: true,
    unread: false,
    body:
      "Nim,\n\nBefore we can start the pilot, our security team needs the completed questionnaire and a copy of your SOC 2 report.\n\nCould you send both by Friday?\n\nThanks,\nHannah",
    draft:
      "Hi Hannah,\n\nAttached are the completed security questionnaire and our current SOC 2 report. The data-processing addendum is included at the end.\n\nIf your team needs anything else, send it over and I will turn it around quickly.\n\nBest,\nNim",
  }),
  make({
    id: "m-james",
    name: "James Okonkwo",
    email: "james@riversidemill.example",
    group: T,
    time: "4 hours ago",
    subject: "RMA request — batch of PS-118",
    preview: "RMA request — batch of PS-118...",
    flagged: true,
    unread: false,
    body:
      "Nim,\n\nWe need to raise an RMA for the latest batch of PS-118 — three units are out of tolerance.\n\nCan you send the form and the return instructions?\n\nJames",
    draft:
      "Hi James,\n\nThe RMA form is attached. Please include the three affected serial numbers and we will arrange collection within two business days.\n\nOnce the units arrive, quality will confirm the replacement timeline.\n\nBest,\nNim",
  }),
  make({
    id: "m-growth",
    name: "Growth Analyst proposes an update",
    email: "agent@winterfruit.example",
    group: T,
    time: "5 hours ago",
    subject: "Group the last 30 days of mobile trials",
    preview: "Group the last 30 days of mobile tri...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "I grouped the last 30 days of mobile trial activity by activation step and deployment window.\n\nThe connect-data step accounts for 9 of the 11-point drop. The full report is in AI-251.",
    draft:
      "Good find. Keep the report in AI-251 and re-run it 24 hours after Thursday's release.",
  }),
  make({
    id: "m-marco",
    name: "Marco Vidal",
    email: "marco@winterfruit.example",
    group: T,
    time: "7 hours ago",
    subject: "Re: Q3 growth review deck",
    preview: "Re: Q3 growth review deck",
    flagged: false,
    unread: true,
    body:
      "Nim,\n\nI added the onboarding funnel to the Q3 review deck and left two comments on the activation slide.\n\nCan we review before Thursday?\n\nMarco",
    draft:
      "Hi Marco,\n\nThanks — I will resolve the comments this afternoon and send the updated deck back before end of day.\n\nNim",
  }),
  make({
    id: "m-carlos",
    name: "Carlos Mendez",
    email: "carlos@spokaneindustrial.example",
    group: T,
    time: "9 hours ago",
    subject: "Need PN-4420 at the Spokane warehouse",
    preview: "Need PN-4420 at the Spokane ...",
    flagged: false,
    unread: true,
    body:
      "Hi Nim,\n\nCan you confirm availability and lead time for PN-4420 shipped to Spokane? We need 24 units by the end of the month.\n\nCarlos",
    draft:
      "Hi Carlos,\n\nWe have 24 units of PN-4420 available. Shipped today, they reach Spokane in four business days — inside your month-end needed-by date.\n\nI will hold the stock for 48 hours while you confirm.\n\nBest,\nNim",
  }),
  make({
    id: "m-jordan",
    name: "Jordan Lee",
    email: "jordan@winterfruit.example",
    group: T,
    time: "11 hours ago",
    subject: "Re: Warehouse pick accuracy — week 46",
    preview: "Re: Warehouse pick accuracy — w...",
    flagged: false,
    unread: false,
    body:
      "Nim,\n\nPick accuracy for week 46 is 99.2%, up from 98.7%. The two misses were both bin location errors, now corrected.\n\nJordan",
    draft:
      "Nice — 99.2% is the best week this quarter. I will note the bin corrections in the ops review.\n\nNim",
  }),
  make({
    id: "m-backorder",
    name: "Backorder alert workflow",
    email: "automations@winterfruit.example",
    group: T,
    time: "18 hours ago",
    subject: "The agent could not match Pacer stock to a supplier",
    preview: "The agent could not match Pac...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "Backorder customer alerts ran for 200 SKUs.\n\nOne supplier match failed: Pacer stock did not resolve to a known supplier record. No email was drafted for the affected customers.",
    draft:
      "Thanks. I will add the Pacer supplier record and re-run the affected SKUs.",
  }),
  make({
    id: "m-weekly",
    name: "Weekly growth audit status",
    email: "automations@winterfruit.example",
    group: T,
    time: "22 hours ago",
    subject: "The PostHog query timed out after 30 seconds",
    preview: "The PostHog query timed out after ...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "The weekly growth audit could not complete. The PostHog query timed out after 30 seconds while reading mobile activation events.\n\nThe run will not retry automatically. The last successful audit is still available.",
    draft:
      "Please retry with the narrower event window used for the mobile trial report.",
  }),
  make({
    id: "m-portal",
    name: "Portal inventory sync failed",
    email: "automations@winterfruit.example",
    group: Y,
    time: "1 day ago",
    subject: "The nightly WMS → ordering portal sync did not finish",
    preview: "The nightly WMS → ordering portal...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "The nightly inventory sync stopped after 612 of 1,284 SKUs. The portal is serving yesterday's stock levels for the remaining SKUs.\n\nNo writes were made after the interruption.",
    draft:
      "I will re-run the sync from the last checkpoint and verify the affected SKUs before publishing.",
  }),
  make({
    id: "m-growth2",
    name: "Growth Analyst proposes an update",
    email: "agent@winterfruit.example",
    group: Y,
    time: "1 day ago",
    subject: "Email buyers when a stocked SKU returns",
    preview: "Email buyers when a stocked SKU ...",
    flagged: false,
    unread: false,
    agent: true,
    body:
      "I found 18 buyers who asked about SKUs that are now back in stock.\n\nI can draft a short restock note per buyer and hold them for approval.",
    draft:
      "Draft the 18 notes and group them by product. I will approve them in one pass.",
  }),
  make({
    id: "m-nina",
    name: "Nina Kowalski",
    email: "nina@brightbay.example",
    group: W,
    time: "2 days ago",
    subject: "Portal login loops after password reset",
    preview: "Portal login loops after passwor...",
    flagged: false,
    unread: true,
    body:
      "Hi,\n\nAfter resetting my password the portal sends me back to the login screen in a loop. I have tried two browsers.\n\nCan you help?\n\nNina",
    draft:
      "Hi Nina,\n\nSorry about the loop — it is a known cookie issue on the login redirect. Clearing the site cookies fixes it.\n\nIf that does not work, reply here and I will reset the session from our side.\n\nBest,\nNim",
  }),
  make({
    id: "m-raymond",
    name: "Raymond Cho",
    email: "raymond@cascade.example",
    group: W,
    time: "3 days ago",
    subject: "Bulk quote — 500 stainless hydraulic fittings",
    preview: "Bulk quote — 500 stainless hydrau...",
    flagged: false,
    unread: false,
    body:
      "Nim,\n\nPlease quote 500 stainless hydraulic fittings, 3/8 inch, delivered to Portland.\n\nRaymond",
    draft:
      "Hi Raymond,\n\nFor 500 units of the 3/8 inch stainless fitting, delivered to Portland, the quote is attached. Volume pricing applies above 400 units.\n\nThe quote holds for 30 days.\n\nBest,\nNim",
  }),
  make({
    id: "m-morgan",
    name: "Morgan Ellis",
    email: "morgan@northstar.example",
    group: W,
    time: "4 days ago",
    subject: "Lead time slip — 304 stainless rod",
    preview: "Lead time slip — 304 stainless rod ...",
    flagged: false,
    unread: false,
    body:
      "Nim,\n\nOur supplier moved the 304 stainless rod lead time from 3 to 5 weeks. Is there any stock available sooner?\n\nMorgan",
    draft:
      "Hi Morgan,\n\nWe have 1.2 tons of 304 rod in stock that can ship this week. After that, the next mill run is five weeks out.\n\nI can reserve the stock for you until Friday.\n\nBest,\nNim",
  }),
];

export const filterTabs = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "archived", label: "Archived" },
  { id: "snoozed", label: "Snoozed" },
];
