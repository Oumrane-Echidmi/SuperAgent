import 'package:flutter/material.dart';
import '../theme.dart';

// ---- DEMO FIXTURES (ported from the website preview; not live data) ----
class _Agent {
  final String name, desc, initials, workload;
  final int runs;
  final Color color;
  final bool system;
  final List<double> activity;
  const _Agent(this.name, this.desc, this.initials, this.color, this.runs, this.activity, {this.system = false})
      : workload = '0/1';
}

const _agents = <_Agent>[
  _Agent('Assistant', 'Answers questions about the workspace and routes the work.', 'A', SA.pink, 214,
      [.2, .5, .4, .8, .6, .9, .5], system: true),
  _Agent('Revenue Watch', 'Watches Stripe for failed payments and churn signals.', 'R', Color(0xFFA855F7), 61,
      [.7, .3, .5, .9, .4, .8, .6]),
  _Agent('Inbox Concierge', 'Reads the shared inbox and drafts replies for review.', 'I', SA.amber, 132,
      [.6, .5, .4, .7, .3, .8, .4]),
  _Agent('Growth Analyst', 'Finds activation drop-offs and drafts evidence-backed tickets.', 'G', SA.amber, 46,
      [.4, .2, .5, .9, .3, .5, .2]),
];

class AgentsScreen extends StatefulWidget {
  const AgentsScreen({super.key});
  @override
  State<AgentsScreen> createState() => _AgentsScreenState();
}

class _AgentsScreenState extends State<AgentsScreen> {
  int tab = 0;
  bool archived = false;

  @override
  Widget build(BuildContext context) {
    return SAPage(
      title: 'Agents',
      icon: Icons.person_outline,
      actions: [
        Pill('+ New agent', color: SA.primary),
        const SizedBox(width: 12),
      ],
      body: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Text('4 agents · Agents that turn approved work into updates, comments, and status changes.',
              style: SA.t(12, c: SA.muted)),
        ),
        TabStrip(const ['Agents', 'Squads', 'Skills', 'Connections'], onChanged: (i) => setState(() => tab = i)),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          child: Row(children: [
            _seg('Active', !archived, () => setState(() => archived = false)),
            const SizedBox(width: 4),
            _seg('Archived 2', archived, () => setState(() => archived = true)),
            const Spacer(),
            const Icon(Icons.search, size: 18, color: SA.muted),
            const SizedBox(width: 4),
          ]),
        ),
        Expanded(child: _content()),
      ]),
    );
  }

  Widget _seg(String t, bool on, VoidCallback f) => GestureDetector(
        onTap: f,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
              color: on ? SA.card : null,
              border: Border.all(color: SA.border),
              borderRadius: BorderRadius.circular(99)),
          child: Text(t, style: SA.t(12.5, w: FontWeight.w500, c: on ? SA.fg : SA.muted)),
        ),
      );

  Widget _content() {
    if (tab != 0 || archived) {
      final label = tab == 0 ? 'archived agents' : ['', 'squads', 'skills', 'connections'][tab];
      return Center(
          child: Text(archived && tab == 0 ? '2 archived agents (demo)' : 'No $label yet', style: SA.t(13, c: SA.muted)));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
      itemCount: _agents.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _row(_agents[i]),
    );
  }

  Widget _row(_Agent a) {
    return SACard(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Avatar(a.initials, color: a.color, size: 34),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(a.name, style: SA.t(14, w: FontWeight.w600))),
                if (a.system) ...[const SizedBox(width: 6), const Pill('system', outlined: true)],
              ]),
              const SizedBox(height: 2),
              Text(a.desc, style: SA.t(12, c: SA.muted, h: 1.3)),
            ]),
          ),
          const Icon(Icons.more_vert, size: 18, color: SA.muted),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Container(width: 7, height: 7, decoration: const BoxDecoration(color: SA.muted, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text('Idle', style: SA.t(11.5, c: SA.muted)),
          const SizedBox(width: 14),
          Text('Workload ', style: SA.t(11.5, c: SA.muted)),
          Text(a.workload, style: SA.t(11.5, f: SA.fontMono)),
          const SizedBox(width: 14),
          Text('7d ', style: SA.t(11.5, c: SA.muted)),
          SizedBox(
            width: 56,
            height: 18,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final v in a.activity)
                Padding(
                  padding: const EdgeInsets.only(right: 2),
                  child: Container(width: 5, height: 3 + 15 * v, color: SA.muted),
                ),
            ]),
          ),
          const Spacer(),
          Text('${a.runs} runs', style: SA.t(11.5, c: SA.amber, f: SA.fontMono)),
        ]),
      ]),
    );
  }
}
