import 'package:flutter/material.dart';
import '../theme.dart';

// Demo fixtures (labelled): mirrors the website's Workflows demo data.
class _Wf {
  final String name, desc, kind; // kind: active | paused | table
  final String? schedule, nodes, last, source, error, runStatus, runNote, cadence;
  final Color tint;
  const _Wf(this.name, this.desc, this.kind, this.tint,
      {this.schedule, this.nodes, this.last, this.source, this.error, this.runStatus, this.runNote, this.cadence});
}

class _Approval {
  final String title, age, body;
  const _Approval(this.title, this.age, this.body);
}

const _demoApprovals = [
  _Approval('Mobile onboarding recovery', '25m ago', '6 recovery emails are drafted for trials that stalled on mobile. Send them?'),
  _Approval('Signup enrichment', '3h ago', '12 enriched contacts look like duplicates of rows already on the board. Merge them?'),
];

const _demoWorkflows = [
  _Wf('Competitor pricing crawl', 'Fills Competitor pricing', 'table', SA.card,
      source: 'Table source',
      schedule: 'Every day at 05:00 UTC',
      cadence: 'Scheduled',
      last: 'about 11 hours ago',
      runStatus: 'Succeeded',
      runNote: 'Import finished and rows were written to the table.'),
  _Wf('Weekly growth audit', 'Reviews activation, retention and revenue, then files what needs a human.', 'active', SA.pink,
      schedule: 'Weekly Mon 9:00 AM UTC', last: '7h ago'),
  _Wf('Inbound reply triage', 'Reads new mail in the shared inbox, drafts a reply, and asks before it sends.', 'active', SA.amber,
      schedule: 'When a connected inbox receives email', last: '7m ago'),
  _Wf('Failed payment watch', 'Checks Stripe each morning for failed charges and flags the accounts at risk.', 'active', SA.green,
      schedule: 'Daily 8:00 AM UTC', last: '4h ago'),
  _Wf('Trial reactivation nudges', 'Emails trials that stalled before their first integration. Off while the mobile fix lands.', 'paused', SA.green,
      schedule: 'Weekly Tue 3:00 PM UTC', last: '9d ago'),
  _Wf('Backorder customer alerts',
      'Watches inventory levels for the top 200 SKUs and drafts a buyer email when stock falls below reorder point with no PO within five days.',
      'active', SA.pink,
      schedule: 'Daily 6:00 AM UTC', last: '18h ago'),
  _Wf('Mobile onboarding recovery', 'Finds trials that stalled on the connect-data step, drafts a recovery email, and waits for approval.', 'active', SA.green,
      nodes: '8 nodes', schedule: 'Daily 7:00 AM UTC', last: '3m ago'),
  _Wf('Churn-risk digest', 'Scores accounts on usage and payment health, then posts the top ten to the team.', 'active', SA.amber,
      nodes: '6 nodes', schedule: 'Weekly Fri 4:00 PM UTC', last: '21h ago'),
  _Wf('Signup enrichment', 'Enriches every new signup with company, role and stack before it reaches the board.', 'active', SA.green,
      nodes: '7 nodes', schedule: 'Webhook trigger', last: '42m ago'),
  _Wf('Investor update draft', "Pulls the month's revenue and activation numbers into a draft update.", 'paused', SA.pink,
      nodes: '7 nodes',
      schedule: 'Monthly · 1st at 6:00 AM UTC',
      last: '3d ago',
      error: 'Paused automatically after 3 failed runs — the revenue step timed out.'),
];

class WorkflowsScreen extends StatefulWidget {
  const WorkflowsScreen({super.key});
  @override
  State<WorkflowsScreen> createState() => _WorkflowsScreenState();
}

class _WorkflowsScreenState extends State<WorkflowsScreen> {
  int tab = 0;
  int filter = 0;
  final List<_Approval> pending = List.of(_demoApprovals);
  final Map<String, String> decided = {};
  static const filters = ['All', 'Autopilots', 'Workflows', 'Archived (2)'];

  void _decide(_Approval a, String v) => setState(() {
        pending.remove(a);
        decided[a.title] = v;
      });

  Widget _approvals() => Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
        child: SACard(
          color: SA.sidebar,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.schedule, size: 15, color: SA.muted),
              const SizedBox(width: 8),
              Text('Approvals waiting', style: SA.t(14, w: FontWeight.w600)),
              const SizedBox(width: 8),
              Pill('${pending.length}'),
            ]),
            const SizedBox(height: 10),
            if (pending.isEmpty)
              Text(decided.isEmpty ? 'Nothing waiting.' : 'All caught up.', style: SA.t(12, c: SA.muted)),
            for (final a in pending)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SACard(
                  color: SA.bg,
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(a.title, style: SA.t(14, w: FontWeight.w600))),
                      const SizedBox(width: 8),
                      Text(a.age, style: SA.t(12, c: SA.muted)),
                    ]),
                    const SizedBox(height: 4),
                    Text(a.body, style: SA.t(12, c: SA.muted, h: 1.35)),
                    const SizedBox(height: 10),
                    Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                      OutlinedButton.icon(
                        onPressed: () => _decide(a, 'Rejected'),
                        icon: const Icon(Icons.close, size: 14),
                        label: const Text('Reject'),
                        style: OutlinedButton.styleFrom(
                            foregroundColor: SA.fg, side: const BorderSide(color: SA.border), textStyle: SA.t(12, w: FontWeight.w600)),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.icon(
                        onPressed: () => _decide(a, 'Approved'),
                        icon: const Icon(Icons.check, size: 14),
                        label: const Text('Approve'),
                        style: FilledButton.styleFrom(
                            backgroundColor: SA.primary, foregroundColor: SA.bg, textStyle: SA.t(12, w: FontWeight.w600)),
                      ),
                    ]),
                  ]),
                ),
              ),
          ]),
        ),
      );

  Widget _card(_Wf w) {
    final paused = w.kind == 'paused';
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: SACard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: w.tint.withValues(alpha: .35), borderRadius: BorderRadius.circular(SA.radius)),
              child: Icon(w.kind == 'table' ? Icons.storage_outlined : Icons.alt_route, size: 20, color: SA.fg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(w.name, style: SA.t(15, w: FontWeight.w600)),
                const SizedBox(height: 3),
                Text(w.desc, style: SA.t(12, c: SA.muted, h: 1.35)),
              ]),
            ),
            const SizedBox(width: 8),
            if (w.source != null)
              Text(w.source!, style: SA.t(11, c: SA.muted))
            else
              Text(paused ? 'PAUSED' : 'ACTIVE', style: SA.t(11, c: paused ? SA.amber : SA.muted, w: FontWeight.w600)),
            const Icon(Icons.more_vert, size: 16, color: SA.muted),
          ]),
          if (w.error != null) ...[
            const SizedBox(height: 10),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.warning_amber_rounded, size: 14, color: SA.amber),
              const SizedBox(width: 6),
              Expanded(child: Text(w.error!, style: SA.t(12, c: SA.amber, h: 1.3))),
            ]),
          ],
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            if (w.cadence != null) Pill(w.cadence!, color: SA.green),
            if (w.nodes != null) Text(w.nodes!, style: SA.t(11, c: SA.muted, f: SA.fontMono)),
            if (w.schedule != null) Pill(w.schedule!, outlined: true),
            if (w.last != null)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(w.error != null ? Icons.error_outline : Icons.check_circle_outline,
                    size: 12, color: w.error != null ? SA.red : SA.green),
                const SizedBox(width: 4),
                Text(w.last!, style: SA.t(12, c: SA.muted)),
              ]),
            if (w.runStatus != null) Pill(w.runStatus!, color: SA.green),
          ]),
          if (w.runNote != null) ...[
            const SizedBox(height: 6),
            Text(w.runNote!, style: SA.t(11, c: SA.muted)),
          ],
        ]),
      ),
    );
  }

  Widget _empty(String s) => Padding(padding: const EdgeInsets.all(32), child: Center(child: Text(s, style: SA.t(13, c: SA.muted))));

  List<Widget> _list() {
    if (tab == 3) return [_empty('No templates yet (demo).')];
    if (tab == 1) return _demoWorkflows.where((w) => w.last != null).map(_card).toList();
    if (tab == 2) return _demoWorkflows.where((w) => w.kind != 'paused' && w.schedule != null).map(_card).toList();
    final items = _demoWorkflows.where((w) {
      if (filter == 3) return false;
      if (filter == 1) return w.nodes == null && w.kind != 'table';
      if (filter == 2) return w.nodes != null || w.kind == 'table';
      return true;
    }).toList();
    if (items.isEmpty) return [_empty('Nothing here.')];
    return items.map(_card).toList();
  }

  @override
  Widget build(BuildContext context) => SAPage(
        title: 'Workflows',
        icon: Icons.alt_route,
        actions: [
          const Pill('Beta', outlined: true),
          const SizedBox(width: 8),
          FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.add, size: 14),
            label: const Text('New'),
            style: FilledButton.styleFrom(
                backgroundColor: SA.primary,
                foregroundColor: SA.bg,
                visualDensity: VisualDensity.compact,
                textStyle: SA.t(12, w: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
        ],
        body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Text('9 · Reusable automations your agents can run on schedule or on demand. (demo data)', style: SA.t(12, c: SA.muted)),
          ),
          TabStrip(const ['Workflows', 'Runs', 'Upcoming', 'Templates'], onChanged: (i) => setState(() => tab = i)),
          if (tab == 0)
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, k) => GestureDetector(
                  onTap: () => setState(() => filter = k),
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                          color: filter == k ? SA.card : null,
                          border: Border.all(color: SA.border),
                          borderRadius: BorderRadius.circular(99)),
                      child: Text(filters[k], style: SA.t(12, c: filter == k ? SA.fg : SA.muted, w: FontWeight.w500)),
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 8),
          _approvals(),
          const SizedBox(height: 12),
          ..._list(),
        ]),
      );
}
