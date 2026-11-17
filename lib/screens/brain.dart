import 'package:flutter/material.dart';
import '../theme.dart';

// Demo fixtures (from views/company-brain.html; observation log is illustrative).
const _dna = [
  ('Product DNA', "What you sell and who it's for", Icons.inventory_2_outlined),
  ('Company DNA', 'Mission, positioning, audience', Icons.apartment_outlined),
  ('Brand identity', 'Logo, colors, fonts, and tone of voice', Icons.palette_outlined),
  ('Voice', 'Organization voice and your personal writing style', Icons.record_voice_over_outlined),
];

const _review = ['Headcount 74%', 'Pricing model 84%', 'Personas 68%'];

const _log = [
  ('Customer asked twice for SSO in Q3 calls', '3h ago'),
  ('Meridian pricing page changed', '1h ago'),
  ('Trial activation definition updated', '9h ago'),
];

// name, x, y, color
const _nodes = [
  ('Customer', 200.0, 200.0, SA.blue),
  ('Order', 380.0, 120.0, SA.blue),
  ('SKU', 540.0, 200.0, SA.blue),
  ('Supplier', 700.0, 120.0, SA.amber),
  ('Trial signup', 60.0, 90.0, SA.blue),
  ('Support thread', 60.0, 320.0, SA.pink),
  ('Competitor pricing', 380.0, 340.0, SA.green),
  ('Lead', 220.0, 40.0, SA.blue),
  ('Content calendar', 560.0, 340.0, SA.muted),
  ('Competitor watch', 220.0, 400.0, SA.green),
];
const _edges = [
  (0, 1), (1, 2), (2, 3), (4, 0), (5, 0), (7, 0), (6, 9), (8, 7), (2, 6),
];

class _GraphPainter extends CustomPainter {
  const _GraphPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = SA.muted.withValues(alpha: .4)
      ..strokeWidth = 1.2;
    for (final e in _edges) {
      canvas.drawLine(Offset(_nodes[e.$1].$2, _nodes[e.$1].$3), Offset(_nodes[e.$2].$2, _nodes[e.$2].$3), line);
    }
    for (final n in _nodes) {
      final c = Offset(n.$2, n.$3);
      canvas.drawCircle(c, 9, Paint()..color = n.$4.withValues(alpha: .25));
      canvas.drawCircle(c, 5, Paint()..color = n.$4);
      final tp = TextPainter(
        text: TextSpan(text: n.$1, style: const TextStyle(fontSize: 11, color: SA.fg)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(c.dx - tp.width / 2, c.dy + 12));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class BrainScreen extends StatelessWidget {
  const BrainScreen({super.key});

  @override
  Widget build(BuildContext context) => SAPage(
        title: 'Company Brain',
        icon: Icons.psychology_outlined,
        actions: const [Pill('Updated 3h ago', outlined: true), SizedBox(width: 12)],
        body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text("Your organization's trusted profile, grounded in evidence.  (demo data)",
                style: SA.t(12, c: SA.muted)),
          ),
          for (final d in _dna)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: SACard(
                onTap: () {},
                child: Row(children: [
                  Icon(d.$3, size: 20, color: SA.muted),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(d.$1, style: SA.t(14, w: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(d.$2, style: SA.t(12, c: SA.muted)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Text('Updated 9h ago', style: SA.t(11, c: SA.muted)),
                ]),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: SACard(
              color: SA.amber.withValues(alpha: .12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('3 things to review', style: SA.t(14, w: FontWeight.w600, c: SA.amber)),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [for (final r in _review) Pill(r, color: SA.amber)]),
                const SizedBox(height: 8),
                Text('Review in Inbox', style: SA.t(12, w: FontWeight.w600)),
              ]),
            ),
          ),
          const SectionLabel('What the brain noticed'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('The running log of observations from your conversations.', style: SA.t(12, c: SA.muted)),
          ),
          const SizedBox(height: 8),
          for (final l in _log)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: SACard(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(child: Text(l.$1, style: SA.t(13))),
                  const SizedBox(width: 8),
                  Text(l.$2, style: SA.t(11, c: SA.muted)),
                ]),
              ),
            ),
          const SectionLabel('Knowledge graph'),
          Container(
            height: 320,
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: SA.sidebar,
              borderRadius: BorderRadius.circular(SA.radius + 4),
              border: Border.all(color: SA.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: InteractiveViewer(
              constrained: false,
              minScale: .5,
              maxScale: 3,
              boundaryMargin: const EdgeInsets.all(120),
              child: const SizedBox(width: 800, height: 460, child: CustomPaint(painter: _GraphPainter())),
            ),
          ),
        ]),
      );
}
