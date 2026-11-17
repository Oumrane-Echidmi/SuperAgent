import 'package:flutter/material.dart';
import '../theme.dart';

// ---- DEMO FIXTURES (copied from website views/inbox.html) ----
class _Mail {
  final String initials, from, time, subject;
  final String? preview;
  final bool flagged, unread, agent;
  const _Mail(this.initials, this.from, this.time, this.subject,
      {this.flagged = false, this.unread = false, this.agent = false}) : preview = null;
}

class _Group {
  final String label;
  final List<_Mail> items;
  const _Group(this.label, this.items);
}

const _groups = [
  _Group('Today', [
    _Mail('KH', 'Karen Holt', '8 min ago', 'Status on PO-48291 â€” gasket kit for Line 3', flagged: true, unread: true),
    _Mail('PR', 'Priya Raman', '14 min ago', 'Re: SuperAgent pricing for 40 seats', flagged: true, unread: true),
    _Mail('MS', 'Mike Sanders', '22 min ago', 'Wrong fasteners on PO-39017 â€” need M12, received M10', flagged: true, unread: true),
    _Mail('TV', 'Tom Vasquez', '38 min ago', 'Mobile onboarding fix â€” what is the timeline?'),
    _Mail('GI', 'GitHub', '52 min ago', 'Review requested on PR #482 â€” Fix mobile onboarding drop-off', unread: true),
    _Mail('SP', 'Susan Park', '1 hour ago', 'Duplicate freight line on INV-2024-0892'),
    _Mail('E', 'Inbox Concierge finished RMA labels for Harbor Forge', '2 hours ago',
        'Generated return labels for three PS-118 sensors and queued the credit memo draft for finance review.',
        agent: true),
    _Mail('HO', 'Hannah Okafor', '3 hours ago', 'Security questionnaire before the pilot', flagged: true),
    _Mail('JO', 'James Okonkwo', '4 hours ago', 'RMA request â€” batch of PS-118 pressure sensors', flagged: true, unread: true),
    _Mail('P', 'Growth Analyst proposes a table: Mobile trial cohorts', '5 hours ago',
        'Group the last 30 days of mobile trials by the step they stopped on, so the drop-off is countable.',
        agent: true),
    _Mail('MV', 'Marco Vidal', '7 hours ago', 'Re: Q3 growth review deck'),
    _Mail('CM', 'Carlos Mendez', '9 hours ago', 'Need PN-4420 at the Spokane job site by 6am'),
    _Mail('JL', 'Jordan Lee', '11 hours ago', 'Re: Warehouse pick accuracy â€” week 36 numbers'),
    _Mail('E', 'Backorder alert workflow blocked on Pacific Alloys SKU map', '18 hours ago',
        'The agent could not match Pacific\'s rod stock code to an internal SKU. Needs a manual mapping before alerts can resume.',
        agent: true),
    _Mail('E', 'Weekly growth audit stopped on the PostHog step', '22 hours ago',
        'The PostHog query timed out after 90 seconds, so the run finished without writing its summary. The next run is scheduled for Monday.',
        agent: true),
  ]),
  _Group('Yesterday', [
    _Mail('E', 'Portal inventory sync failed on 14 SKUs', '1 day ago',
        'The nightly WMS â†’ ordering portal job stopped on a unit-of-measure mismatch for fastener SKUs. Buyers still see yesterday\'s quantities.',
        agent: true),
    _Mail('P', 'Growth Analyst proposes a workflow: Backorder customer alerts', '1 day ago',
        'Email buyers when a stocked SKU drops below reorder point and the next PO is more than five days out.',
        agent: true),
  ]),
  _Group('This week', [
    _Mail('NK', 'Nina Kowalski', '2 days ago', 'Portal login loops after password reset'),
    _Mail('RC', 'Raymond Cho', '3 days ago', 'Bulk quote â€” 500 stainless hydraulic fittings for Q4 shutdown'),
    _Mail('ME', 'Morgan Ellis', '4 days ago', 'Lead time slip â€” 304 stainless rod stock for PO-47880'),
  ]),
];

const _tabs = ['All', 'Flagged', 'Archived', 'Snoozed'];

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});
  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  int tab = 0;
  String q = '';

  bool _match(_Mail m) {
    if (tab == 2 || tab == 3) return false;
    if (tab == 1 && !m.flagged) return false;
    if (q.isEmpty) return true;
    final s = q.toLowerCase();
    return m.from.toLowerCase().contains(s) || m.subject.toLowerCase().contains(s);
  }

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        child: Row(children: [
          Text('Inbox', style: SA.t(15, w: FontWeight.w700)),
          const SizedBox(width: 6),
          Text('8', style: SA.t(12, c: SA.muted)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(border: Border.all(color: SA.border), borderRadius: BorderRadius.circular(99)),
            child: Row(children: [
              const Icon(Icons.mail_outline, size: 13, color: SA.muted),
              const SizedBox(width: 6),
              Text('Gmail', style: SA.t(12, w: FontWeight.w600)),
              const SizedBox(width: 6),
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: SA.green, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text('1', style: SA.t(12, c: SA.muted)),
            ]),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.more_horiz, size: 18, color: SA.muted),
        ]),
      ),
      TabStrip(_tabs, onChanged: (i) => setState(() => tab = i)),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: TextField(
          onChanged: (v) => setState(() => q = v),
          style: SA.t(13),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: SA.sidebar,
            hintText: 'Search, or from: subject: is:un',
            hintStyle: SA.t(13, c: SA.muted),
            prefixIcon: const Icon(Icons.search, size: 16, color: SA.muted),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: BorderSide.none),
          ),
        ),
      ),
    ];
    if (tab == 0 && q.isEmpty) {
      children.add(Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
        child: SACard(
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: SA.primary.withValues(alpha: .1), shape: BoxShape.circle),
              child: const Icon(Icons.psychology_outlined, size: 18, color: SA.muted),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                      child: Text('Confirm 3 things Company Brain learned',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: SA.t(14, w: FontWeight.w600))),
                  Text('Review', style: SA.t(12, c: SA.muted)),
                  const Icon(Icons.expand_more, size: 16, color: SA.muted),
                ]),
                const SizedBox(height: 4),
                Text('Headcount 74% Â· Pricing model 84% Â· Personas 68%', style: SA.t(13, c: SA.muted, h: 1.4)),
              ]),
            ),
          ]),
        ),
      ));
    }
    for (final g in _groups) {
      final items = g.items.where(_match).toList();
      if (items.isEmpty) continue;
      children.add(SectionLabel(g.label));
      for (final m in items) {
        children.add(_row(context, m));
      }
    }
    return SAPage(
      title: 'Inbox',
      icon: Icons.inbox_outlined,
      body: ListView(padding: const EdgeInsets.only(bottom: 24), children: children),
    );
  }

  Widget _row(BuildContext context, _Mail m) {
    final color = m.agent ? SA.red : SA.pink;
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _MailDetail(mail: m))),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Avatar(m.initials, color: color, size: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                    child: Text(m.from,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: SA.t(14, w: m.agent ? FontWeight.w600 : FontWeight.w500))),
                if (m.flagged) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.flag, size: 13, color: SA.red),
                ],
                const SizedBox(width: 8),
                Text(m.time, style: SA.t(12, c: SA.muted)),
                const Spacer(),
                if (m.unread) Container(width: 7, height: 7, decoration: const BoxDecoration(color: SA.fg, shape: BoxShape.circle)),
              ]),
              const SizedBox(height: 2),
              Text(m.agent ? (m.preview ?? '') : m.subject,
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: SA.t(13, c: SA.muted, h: 1.35)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _MailDetail extends StatelessWidget {
  final _Mail mail;
  const _MailDetail({required this.mail});

  Widget _earlier(String when, String who) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: SA.border)),
        child: Row(children: [
          const Icon(Icons.expand_more, size: 16, color: SA.muted),
          const SizedBox(width: 8),
          Expanded(
              child: Text.rich(TextSpan(style: SA.t(12.5, c: SA.muted), children: [
            TextSpan(text: 'On $when, '),
            TextSpan(text: who, style: SA.t(12.5, w: FontWeight.w700)),
            const TextSpan(text: ' wrote:'),
          ]))),
        ]),
      );

  Widget _prop(String k, Widget v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 90, child: Text(k, style: SA.t(12, c: SA.muted))),
          Expanded(child: v),
        ]),
      );

  Widget _btn(String t, {IconData? icon, Color? color, bool outlined = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: outlined ? null : (color ?? SA.card).withValues(alpha: .2),
          border: Border.all(color: outlined ? SA.border : (color ?? SA.card)),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color ?? SA.fg), const SizedBox(width: 6)],
          Text(t, style: SA.t(13, w: FontWeight.w600, c: color == null ? SA.fg : color)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final tom = mail.from == 'Tom Vasquez';
    return Scaffold(
      backgroundColor: SA.bg,
      appBar: AppBar(
        backgroundColor: SA.bg,
        elevation: 0,
        titleSpacing: 0,
        title: Text('Inbox', style: SA.t(14, w: FontWeight.w600)),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (tom) ...[
          Text('Earlier in this conversation', style: SA.t(12, c: SA.muted)),
          const SizedBox(height: 8),
          _earlier('2 days ago', 'Tom Vasquez'),
          _earlier('1 day ago', 'Nim'),
          const SizedBox(height: 8),
        ],
        Row(children: [
          Avatar(mail.initials, color: mail.agent ? SA.red : SA.pink, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(mail.from, style: SA.t(16, w: FontWeight.w700)),
              if (tom) ...[
                Text('Tom Vasquez <tom@brightpath.io>', style: SA.t(12, c: SA.muted)),
                Text('to support@superagent.example', style: SA.t(11.5, c: SA.muted)),
              ],
            ]),
          ),
          Text(tom ? '9:43 PM' : mail.time, style: SA.t(12, c: SA.muted)),
          if (tom) ...[const SizedBox(width: 8), const Pill('Read')],
        ]),
        const SizedBox(height: 16),
        Text(mail.agent ? mail.from : mail.subject, style: SA.t(14, w: FontWeight.w700)),
        const SizedBox(height: 14),
        if (tom) ...[
          Text('Following up on this â€” about half our team signs up on a phone, and they keep falling out at the connect-data step.',
              style: SA.t(14, h: 1.5)),
          const SizedBox(height: 14),
          Text('Do you have a date for the fix? We are happy to test a beta build against our own workspace if that helps you ship it faster.',
              style: SA.t(14, h: 1.5)),
          const SizedBox(height: 14),
          Text('Tom', style: SA.t(14)),
          const SizedBox(height: 18),
          SACard(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('to tom@brightpath.io', style: SA.t(13, w: FontWeight.w600))),
                const Pill('pending', outlined: true),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                    child: Text('Re: Mobile onboarding fix â€” what is the timeline?',
                        style: SA.t(12, c: SA.muted))),
                Text('Edit subject', style: SA.t(12, c: SA.muted)),
              ]),
              const SizedBox(height: 6),
              Center(child: Text('Add Cc/Bcc', style: SA.t(12, c: SA.muted))),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: SA.bg, borderRadius: BorderRadius.circular(10)),
                child: Text(
                    'Hi Tom,\n\nThanks for the detail â€” it matched what the funnel was showing, so we could act on it quickly.\n\nThe connect-data step on mobile is fixed in AI-251 and is in review now. It ships with Thursday\'s release, and the change also restores form recovery, so a half-finished signup survives a page reload.\n\nI would like to take you up on the beta build. Reply with the two accounts that got stuck and I will put them on the build tomorrow morning.\n\nNim',
                    style: SA.t(13.5, h: 1.45)),
              ),
              const SizedBox(height: 10),
              Container(
                height: 76,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: SA.bg, borderRadius: BorderRadius.circular(10)),
                child: Text('Reason for rejecting (optional)', style: SA.t(13, c: SA.muted)),
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text('Save edits', style: SA.t(13, w: FontWeight.w600, c: SA.muted)),
                _btn('Reject', icon: Icons.close, outlined: true),
                _btn('Send reply', icon: Icons.send_outlined, color: SA.green),
              ]),
            ]),
          ),
        ] else
          Text(mail.preview ?? mail.subject, style: SA.t(14, c: SA.muted, h: 1.5)),
        const SizedBox(height: 18),
        _btn('Create ticket', icon: Icons.confirmation_number_outlined, outlined: true),
        const SizedBox(height: 8),
        Text('Creating a ticket makes this message visible to the whole team.', style: SA.t(12, c: SA.muted)),
        const SectionLabel('Properties'),
        if (tom) ...[
          _prop('Status', Align(alignment: Alignment.centerLeft, child: const Pill('Read'))),
          _prop('Channel', Text('Gmail', style: SA.t(12.5))),
          _prop('From', Text('Tom Vasquez <tom@brightpath.io>', style: SA.t(12.5))),
          _prop('To', Text('support@superagent.example', style: SA.t(12.5))),
          _prop('Connection', Text('support@superagent.example', style: SA.t(12.5))),
          const SectionLabel('Details'),
          _prop('Received', Text('38 min ago', style: SA.t(12.5, c: SA.muted))),
          _prop('Thread', Text('19b4e07a55c1af92', style: SA.t(12, f: SA.fontMono, c: SA.muted))),
        ] else ...[
          _prop('Channel', Text(mail.agent ? 'Agent' : 'Gmail', style: SA.t(12.5))),
          _prop('From', Text(mail.from, style: SA.t(12.5))),
          const SectionLabel('Details'),
          _prop('Received', Text(mail.time, style: SA.t(12.5, c: SA.muted))),
        ],
      ]),
    );
  }
}
