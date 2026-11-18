import 'package:flutter/material.dart';
import '../theme.dart';
import 'cod_state.dart';

class CodReview extends StatefulWidget {
  const CodReview({super.key});
  @override
  State<CodReview> createState() => _CodReviewState();
}

class _CodReviewState extends State<CodReview> {
  final s = CodState.i;
  String phase = 'draft'; // draft | activating | active

  @override
  void initState() {
    super.initState();
    for (final n in [s.approved, s.revision, s.whatsappConnected, s.sheetsConnected]) {
      n.addListener(_r);
    }
  }

  @override
  void dispose() {
    for (final n in [s.approved, s.revision, s.whatsappConnected, s.sheetsConnected]) {
      n.removeListener(_r);
    }
    super.dispose();
  }

  void _r() {
    if (mounted) setState(() {});
  }

  Widget row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 100, child: Text(k, style: SA.t(12, c: SA.muted))),
          Expanded(child: Text(v, style: SA.t(13))),
        ]),
      );

  Future<void> publish() async {
    setState(() => phase = 'activating');
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => phase = 'active');
  }

  @override
  Widget build(BuildContext context) {
    final healthy = s.whatsappConnected.value && s.sheetsConnected.value;
    final canPublish = s.approved.value && healthy && phase == 'draft';
    const sims = [
      ['Normal', 'Customer says "Nam" -> confirmed, row appended', SA.green],
      ['Missing data', 'No address -> AI asks follow-up, no row yet', SA.amber],
      ['Timeout', 'No reply in 24h -> handoff to staff', SA.amber],
      ['Failure', 'Sheets error -> retry queued, owner alerted', SA.red],
    ];
    return SAPage(
      title: 'Review & Publish',
      icon: Icons.rocket_launch_outlined,
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          const Pill('Demo data - not live', color: SA.amber),
          const SizedBox(width: 8),
          Pill('Revision ${s.revision.value}', color: SA.blue),
        ]),
        const SectionLabel('Draft preview'),
        SACard(
          child: Column(children: [
            row('Trigger', 'New COD order received'),
            row('Sample reply', 'Salam Youssef, confirmi commande #1042 (349 MAD)? Jawb b Nam / La.'),
            row('Sheet row', 'order_id | customer | phone | total_MAD | status | timestamp'),
            row('Handoff', 'Customer asks question, 24h timeout, or low confidence -> staff'),
            row('Services', 'WhatsApp Business number, Google Sheets tab'),
          ]),
        ),
        const SectionLabel('Simulation (simulated, not real traffic)'),
        for (final x in sims)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: SACard(
              child: Row(children: [
                Pill('${x[0]} - simulated', color: x[2] as Color),
                const SizedBox(width: 10),
                Expanded(child: Text(x[1] as String, style: SA.t(12, c: SA.muted))),
              ]),
            ),
          ),
        const SectionLabel('Approval'),
        SACard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                s.approved.value
                    ? 'Approved for revision ${s.revision.value}'
                    : 'Not approved for revision ${s.revision.value}',
                style: SA.t(13)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              FilledButton(
                onPressed: s.approved.value || phase != 'draft' ? null : () => s.approved.value = true,
                child: const Text('Approve'),
              ),
              OutlinedButton(
                onPressed: phase != 'draft'
                    ? null
                    : () {
                        s.revision.value += 1;
                        s.approved.value = false;
                      },
                child: const Text('Request change'),
              ),
            ]),
            const SizedBox(height: 6),
            Text('Editing bumps the revision and resets approval.', style: SA.t(11, c: SA.muted)),
          ]),
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: canPublish ? publish : null, child: const Text('Publish')),
        if (!healthy)
          Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Publish needs both connections healthy.', style: SA.t(11, c: SA.red))),
        if (phase != 'draft')
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Pill(phase == 'activating' ? 'Activating...' : 'Active', color: phase == 'active' ? SA.green : SA.amber),
          ),
      ]),
    );
  }
}
