import 'package:flutter/material.dart';
import '../theme.dart';

// ---- DEMO FIXTURES (ported from the website preview; not live data) ----
class _Ticket {
  final String id, title;
  final List<String> tags;
  final String who, date, progress;
  final bool agent;
  final String? flag;
  const _Ticket(this.id, this.title, this.tags, this.who, this.date,
      {this.progress = '', this.agent = false, this.flag});
}

class _Col {
  final String name;
  final int count;
  final Color color;
  final IconData icon;
  final List<_Ticket> items;
  const _Col(this.name, this.count, this.color, this.icon, this.items);
}

const _tagColors = <String, Color>{
  'Experiment': SA.green,
  'Customer': SA.green,
  'Billing': SA.red,
  'Analytics': SA.pink,
  'Lifecycle': SA.amber,
  'Activation': SA.pink,
  'Mobile': SA.blue,
};

const _cols = <_Col>[
  _Col('Backlog', 12, SA.muted, Icons.circle_outlined, [
    _Ticket('AI-228', 'Test a self-serve trial extension offer', ['Experiment'], '?', ''),
    _Ticket('AI-227', 'Draft portal RMA policy for distributor returns', ['Customer'], 'Marco Vidal', ''),
    _Ticket('AI-226', 'Consolidate duplicate contacts from the June import', ['Customer'], 'Marco Vidal', ''),
    _Ticket('AI-225', 'Document wire-transfer approval matrix for POs over \$10k', ['Billing'], 'Jordan Lee', ''),
    _Ticket('AI-224', 'Add usage-based upgrade nudges in-app', ['Billing', 'Experiment'], '?', ''),
  ]),
  _Col('To do', 17, SA.amber, Icons.circle_outlined, [
    _Ticket('AI-271', 'Issue RMA for PS-118 sensors â€” Harbor Forge lot HF-4417', ['Customer'], 'Inbox Concierge', 'Nov 12', agent: true),
    _Ticket('AI-269', "Audit our ERP export gap after Boltline's NetSuite integration launch", ['Customer'], 'Jordan Lee', 'Nov 16'),
    _Ticket('AI-268', 'Follow up with Ironclad Rigging Co on the per-seat pricing objection', ['Customer'], 'Marco Vidal', 'Nov 15'),
    _Ticket('AI-267', 'Move Granite Peak Mining Supply to a net-45 proposal', ['Customer'], 'Marco Vidal', 'Nov 14'),
    _Ticket('AI-246', 'Ship the activation-lift experiment', ['Activation', 'Experiment'], 'Growth Analyst', 'Nov 16',
        progress: '0/2', agent: true, flag: 'Needs you'),
  ]),
  _Col('In progress', 13, SA.amber, Icons.timelapse, [
    _Ticket('AI-270', 'Expedite correct M12x40 bolts for Atlas Plant (PO-39017)', ['Customer'], 'Jordan Lee', 'Nov 11'),
    _Ticket('AI-255', 'Add supplier lead-time field to portal product API', ['Analytics'], 'Marco Vidal', 'Nov 16'),
    _Ticket('AI-254', 'Investigate partial refund for duplicate shipment', ['Billing', 'Customer'], 'Revenue Watch', 'Nov 11 â€” Nov 13',
        progress: '2/3', agent: true),
    _Ticket('AI-253', 'Approve PO-7721 for titanium fasteners (\$18.4k)', [], 'Nim', 'Nov 11', progress: '0/2'),
    _Ticket('AI-251', 'Fix mobile onboarding drop-off', ['Activation', 'Mobile'], 'Growth Analyst', 'Nov 10 â€” Nov 13',
        progress: '2/5', agent: true, flag: 'Working'),
  ]),
  _Col('In review', 9, SA.green, Icons.check_circle_outline, [
    _Ticket('AI-260', 'Contract redlines from Ridgefield Equipment', ['Customer', 'Billing'], 'Marco Vidal', 'Nov 14'),
    _Ticket('AI-259', 'Update KB article for portal bulk CSV upload', ['Customer'], 'Jordan Lee', ''),
    _Ticket('AI-258', 'September supplier invoice accruals', ['Billing'], 'Revenue Watch', 'Nov 12', agent: true),
    _Ticket('AI-257', 'Review case study draft â€” Lakeside valve retrofit', ['Lifecycle', 'Customer'], 'Marco Vidal', 'Nov 13'),
    _Ticket('AI-256', 'Confirm Acme Bearings lead time slipped to six weeks', ['Customer'], '', ''),
  ]),
  _Col('Done', 0, SA.blue, Icons.check_circle, []),
];

class BoardScreen extends StatelessWidget {
  const BoardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SAPage(
      title: 'Board',
      icon: Icons.view_kanban_outlined,
      actions: const [
        Icon(Icons.filter_alt_outlined, size: 18, color: SA.muted),
        SizedBox(width: 8),
        Icon(Icons.add, size: 20, color: SA.fg),
        SizedBox(width: 12),
      ],
      body: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Text('68 tickets Â· Track and manage your team\'s work.', style: SA.t(12, c: SA.muted)),
        ),
        const TabStrip(['Work', 'Projects']),
        const TabStrip(['All', 'Members', 'Agents', 'My work', 'Needs you', 'Active', 'Archived (3)']),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
          child: SACard(
            color: SA.blue.withValues(alpha: .08),
            padding: const EdgeInsets.all(12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.auto_awesome, size: 14, color: SA.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('1 starter suggestion from your signup', style: SA.t(13, c: SA.blue, w: FontWeight.w500)),
                  const SizedBox(height: 4),
                  Text(
                      'AI Agent drafted this from your website so the board was not empty. It is a suggestion, not your own work â€” keep what fits, or clear the board.',
                      style: SA.t(11.5, c: SA.blue, h: 1.35)),
                ]),
              ),
              const SizedBox(width: 8),
              Text('Dismiss', style: SA.t(11.5, c: SA.blue)),
            ]),
          ),
        ),
        Expanded(
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            itemCount: _cols.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _Column(_cols[i]),
          ),
        ),
      ]),
    );
  }
}

class _Column extends StatelessWidget {
  final _Col col;
  const _Column(this.col);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 290,
      decoration: BoxDecoration(
        color: col.color.withValues(alpha: .07),
        borderRadius: BorderRadius.circular(SA.radius + 4),
        border: Border.all(color: col.color.withValues(alpha: .25)),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: Row(children: [
            Icon(col.icon, size: 14, color: col.color),
            const SizedBox(width: 6),
            Text(col.name, style: SA.t(12.5, c: col.color, w: FontWeight.w600)),
            const SizedBox(width: 6),
            Text('${col.count}', style: SA.t(12, c: SA.muted)),
            const Spacer(),
            const Icon(Icons.add, size: 16, color: SA.muted),
            const SizedBox(width: 8),
            const Icon(Icons.more_horiz, size: 16, color: SA.muted),
          ]),
        ),
        Expanded(
          child: col.items.isEmpty
              ? Center(child: Text('No tickets', style: SA.t(12, c: SA.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                  itemCount: col.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _TicketCard(col.items[i]),
                ),
        ),
      ]),
    );
  }
}

class _TicketCard extends StatelessWidget {
  final _Ticket t;
  const _TicketCard(this.t);

  @override
  Widget build(BuildContext context) {
    return SACard(
      color: SA.bg,
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.signal_cellular_alt, size: 13, color: SA.muted),
          const SizedBox(width: 6),
          Text(t.id, style: SA.t(12, c: SA.muted, f: SA.fontMono)),
          const Spacer(),
          if (t.flag != null) Pill(t.flag!, color: t.flag == 'Working' ? SA.amber : SA.amber),
        ]),
        const SizedBox(height: 6),
        Text(t.title, style: SA.t(13.5, w: FontWeight.w600, h: 1.3)),
        if (t.tags.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final g in t.tags) Pill(g, color: _tagColors[g] ?? SA.muted),
          ]),
        ],
        const SizedBox(height: 8),
        Row(children: [
          if (t.who.isNotEmpty) ...[
            Avatar(t.who == '?' ? '?' : t.who.substring(0, 1), color: t.agent ? SA.amber : SA.pink, size: 20),
            const SizedBox(width: 6),
            Flexible(
                child: Text(t.who == '?' ? 'Unassigned' : t.who,
                    overflow: TextOverflow.ellipsis, style: SA.t(11.5, c: SA.muted))),
          ],
          const Spacer(),
          if (t.date.isNotEmpty) ...[
            const Icon(Icons.event_outlined, size: 12, color: SA.muted),
            const SizedBox(width: 4),
            Text(t.date, style: SA.t(11.5, c: SA.muted)),
          ],
          if (t.progress.isNotEmpty) ...[
            const SizedBox(width: 8),
            const Icon(Icons.timelapse, size: 12, color: SA.muted),
            const SizedBox(width: 3),
            Text(t.progress, style: SA.t(11.5, c: SA.muted)),
          ],
        ]),
      ]),
    );
  }
}
