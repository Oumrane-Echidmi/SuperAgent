import 'package:flutter/material.dart';
import '../theme.dart';

// Demo fixtures (from views/docs.html).
class _Src {
  final String name, desc, type, status, updated;
  const _Src(this.name, this.desc, this.type, this.status, this.updated);
}

const _sources = [
  _Src('Brand Profile', 'Positioning + ICP', 'manual', 'ready', '4h ago'),
  _Src('ICP — mid-market RevOps', 'Segments, trigger events, disqualifiers', 'manual', 'ready', '2d ago'),
  _Src('Q3 discovery — call notes', 'Three customer calls, one repeated ask', 'manual', 'ready', '51m ago'),
  _Src('Teardown — Meridian', 'Where they win, where we win, objection handling', 'manual', 'ready', '5d ago'),
  _Src('Activation — metric definitions', 'The definitions every report must use', 'manual', 'ready', '19h ago'),
  _Src('Pricing and packaging v3', 'Plans, what changed from v2, discount policy', 'manual', 'ready', '9d ago'),
  _Src('docs.superagent.com', '84 public docs pages, refreshed nightly', 'website', 'ready', '9h ago'),
  _Src('Security and DPA one-pager.pdf', 'SOC 2, residency, sub-processors, retention', 'file', 'ready', '17d ago'),
  _Src('Support escalations — Gmail', 'Threads tagged escalation, rolling 30 days', 'connection', 'indexing', '4m ago'),
  _Src('Q4 content calendar — campaign brief', 'Which Content calendar rows double as sales follow-up', 'manual', 'ready', '7h ago'),
];

const _csvs = [('Supplier', '12 rows', '', '4d ago')];

const _tables = [
  ('Customer', '1,284 rows', 'scheduled', '23m ago'),
  ('Order', '9,640 rows', 'scheduled', '15m ago'),
  ('SKU', '412 rows', 'manual', '5h ago'),
  ('Trial signup', '2,106 rows', 'scheduled', '8m ago'),
  ('Support thread', '583 rows', 'agent', '42m ago'),
  ('Competitor pricing', '10 rows', 'scheduled', '11h ago'),
  ('Lead', '18 rows', 'scheduled', '3h ago'),
  ('Content calendar', '18 rows', 'manual', '7h ago'),
  ('Competitor watch', '18 rows', 'scheduled', '1h ago'),
];

const _competitors = [
  ('Meridian', 'https://meridian.example', '11h ago'),
  ('Loopwise', 'https://loopwise.example', '3d ago'),
  ('Cadence CRM', 'https://cadencecrm.example', '8d ago'),
  ('Northstar Labs', 'https://northstarlabs.example', '3h ago'),
];

class DocsScreen extends StatefulWidget {
  const DocsScreen({super.key});
  @override
  State<DocsScreen> createState() => _DocsScreenState();
}

class _DocsScreenState extends State<DocsScreen> {
  int tab = 0;

  Widget _row(String title, String sub, List<Widget> pills, String updated) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: SACard(
          padding: const EdgeInsets.all(12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: SA.t(14, w: FontWeight.w600)),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(sub, style: SA.t(12, c: SA.muted)),
                ],
                if (pills.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 4, children: pills),
                ],
              ]),
            ),
            const SizedBox(width: 8),
            Text(updated, style: SA.t(11, c: SA.muted)),
          ]),
        ),
      );

  List<Widget> _content() {
    switch (tab) {
      case 0:
        return [
          for (final s in _sources)
            _row(s.name, s.desc, [
              Pill(s.type, outlined: true),
              s.status == 'ready' ? const Pill('ready', color: SA.green) : const Pill('indexing', color: SA.amber),
            ], s.updated),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Ready sources can be used by your agents. Indexing sources are not available yet.',
                style: SA.t(11, c: SA.muted)),
          ),
        ];
      case 1:
        return [for (final c in _csvs) _row(c.$1, c.$2, const [], c.$4)];
      case 2:
        return [for (final t in _tables) _row(t.$1, t.$2, [Pill(t.$3, outlined: true)], t.$4)];
      default:
        return [for (final c in _competitors) _row(c.$1, c.$2, const [], c.$3)];
    }
  }

  @override
  Widget build(BuildContext context) => SAPage(
        title: 'Docs',
        icon: Icons.content_copy_outlined,
        actions: [
          TextButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.add, size: 16, color: SA.fg),
            label: Text('Add source', style: SA.t(12, w: FontWeight.w600)),
          ),
        ],
        body: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text('Sources, CSVs, and competitors your agents can cite.  (demo data)', style: SA.t(12, c: SA.muted)),
          ),
          TabStrip(const ['Sources', 'CSVs', 'Tables', 'Competitors'], onChanged: (i) => setState(() => tab = i)),
          Expanded(child: ListView(padding: const EdgeInsets.all(16), children: _content())),
        ]),
      );
}
