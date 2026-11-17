import 'package:flutter/material.dart';
import '../theme.dart';

// ---- DEMO FIXTURES (copied from website views/chat.html) ----
class _Agent {
  final String name;
  final Color color;
  const _Agent(this.name, this.color);
}

const _agents = [
  _Agent('Assistant', SA.pink),
  _Agent('Growth Analyst', SA.amber),
  _Agent('Inbox Concierge', SA.amber),
  _Agent('Revenue Watch', Color(0xFFA855F7)),
];

const _workLog1 = [
  "Reasoning: Web signups are flat, so the dip is surface-specific. Comparing the mobile onboarding funnel against the two weeks before Tuesday's deploy, then checking whether pricing moved at the same time.",
  'Posthog query funnel: Mobile trial onboarding',
  'Searched knowledge: what counts as activation for a mobile trial',
  'Stripe list subscriptions: trialing',
  'Drafted a ticket: AI-251 - Fix mobile onboarding drop-off (in_progress, high)',
];
const _workLog2 = [
  'Reasoning: Comparing what other product-led SaaS do at this exact gate - rewrite the prompt, auto-retry, or defer verification until after signup - before proposing one over the other.',
  'Searched the web... (Jina)',
  'Present chat output: questions',
];
const _workLog3 = [
  'Reasoning: Modeling both fixes against the same 214 mobile trials, holding every other funnel step constant.',
  'Present chat output: record_table - Connect-data fix comparison',
];
const _options = [
  'Defer verification until after first run',
  'Add visible retry with progress state',
  'Both — retry now, defer verification next sprint',
  'Something else',
];
const _table = [
  ['Fix', 'Connect-data pts', 'Trial → paid pts', 'Eng days'],
  ['Defer verification', '6', '1.1', '2'],
  ['Visible retry + progress', '3', '0.5', '1'],
  ['Both, staged', '6', '1.1', '3'],
];

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget row(IconData i, String t) => InkWell(
          onTap: () {},
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(children: [
              Icon(i, size: 16, color: SA.fg),
              const SizedBox(width: 12),
              Text(t, style: SA.t(14, w: FontWeight.w500)),
            ]),
          ),
        );
    return SAPage(
      title: 'Chat',
      icon: Icons.chat_bubble_outline,
      body: ListView(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
          child: Text('Project-wide conversations with your agents.', style: SA.t(12, c: SA.muted)),
        ),
        row(Icons.add, 'New chat'),
        row(Icons.lock_outline, 'Temporary chat'),
        const SectionLabel('Recent chats'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('No conversations yet.', style: SA.t(12, c: SA.muted)),
        ),
        const SectionLabel('Agents'),
        for (final a in _agents)
          InkWell(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _ChatThread(agent: a))),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: a.color, shape: BoxShape.circle)),
                const SizedBox(width: 12),
                Expanded(child: Text(a.name, style: SA.t(14, w: FontWeight.w500))),
                const Icon(Icons.chevron_right, size: 18, color: SA.muted),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _ChatThread extends StatelessWidget {
  final _Agent agent;
  const _ChatThread({required this.agent});

  Widget _user(String t) => Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(top: 28, bottom: 14, left: 40),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(18)),
          child: Text(t, style: SA.t(15)),
        ),
      );

  Widget _log(List<String> steps) => Theme(
        data: ThemeData.dark().copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 8),
          dense: true,
          title: Row(children: [
            const Icon(Icons.psychology_outlined, size: 14, color: SA.muted),
            const SizedBox(width: 6),
            Text('Work log · ${steps.length} steps', style: SA.t(12.5, c: SA.muted)),
          ]),
          children: [
            for (final s in steps)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(s, style: SA.t(12, c: SA.muted, h: 1.4)),
                ),
              ),
          ],
        ),
      );

  Widget _cite(String k) => Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(99)),
        child: Text(k, style: SA.t(11, c: SA.muted)),
      );

  Widget _bullet(Widget rest) => Padding(
        padding: const EdgeInsets.only(bottom: 8, left: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('•  ', style: SA.t(14, c: SA.muted)),
          Expanded(child: rest),
        ]),
      );

  TextSpan _b(String t) => TextSpan(text: t, style: SA.t(14, w: FontWeight.w700, h: 1.5));
  TextSpan _n(String t) => TextSpan(text: t, style: SA.t(14, h: 1.5));
  TextSpan _code(String t) =>
      TextSpan(text: t, style: SA.t(12.5, f: SA.fontMono, h: 1.5).copyWith(backgroundColor: SA.card));

  Widget _dot() => Container(width: 10, height: 10, decoration: BoxDecoration(color: agent.color, shape: BoxShape.circle));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SA.bg,
      appBar: AppBar(
        backgroundColor: SA.bg,
        elevation: 0,
        titleSpacing: 0,
        title: Row(children: [
          _dot(),
          const SizedBox(width: 8),
          Text(agent.name, style: SA.t(14, w: FontWeight.w600)),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            _user('Growth Analyst, what changed in mobile trial signups?'),
            _log(_workLog1),
            Text('I traced the dip to one product step, then turned it into work:', style: SA.t(14, h: 1.5)),
            const SizedBox(height: 8),
            _bullet(Text.rich(TextSpan(children: [
              _b('PostHog'),
              _n(' — '),
              _code(' connect_data '),
              _n(" abandons rose 9 points after Tuesday's deploy. Every other step held, and web is flat, so this is mobile only."),
            ]))),
            _bullet(Text.rich(TextSpan(children: [
              _b('Brand Profile'),
              _n(' — activation depends on the first integration succeeding, which makes this one screen the whole funnel '),
              _code(' K1 '),
              _n('.'),
            ]))),
            _bullet(Text.rich(TextSpan(children: [
              _b('Funnel events'),
              _n(' — 214 mobile trials in the window, 38 of them stall there '),
              _code(' K2 '),
              _n('.'),
            ]))),
            _bullet(Text.rich(TextSpan(children: [
              _b('Stripe'),
              _n(' — paid conversion is 18.3% against 18.1% the period before, so pricing is not the cause.'),
            ]))),
            Text.rich(TextSpan(children: [
              _n('I opened '),
              _b('AI-251 — Fix mobile onboarding drop-off'),
              _n(' and moved it into progress: patch the connect-data step, restore mobile form recovery, and verify activation lift.'),
            ])),
            const SizedBox(height: 10),
            Row(children: [_cite('K1'), _cite('K2')]),
            _user('Who picks it up?'),
            Text(
                'It stays on my queue for the diagnosis, and I tagged Marco Vidal for review — he owns onboarding this cycle. I will re-run the funnel 24 hours after the fix ships and post the activation delta in this thread.',
                style: SA.t(13, h: 1.5)),
            _user("What's the fastest way to close that gap?"),
            Row(children: [
              const Icon(Icons.radio_button_unchecked, size: 12, color: SA.muted),
              const SizedBox(width: 8),
              Expanded(child: Text('Close the connect-data gap · 2 of 3 steps done', style: SA.t(12, c: SA.muted))),
            ]),
            _log(_workLog2),
            SACard(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.travel_explore, size: 14, color: SA.muted),
                  const SizedBox(width: 6),
                  Text('Searched the web', style: SA.t(12, w: FontWeight.w700)),
                  const Spacer(),
                  Text('Jina', style: SA.t(11, c: SA.muted)),
                ]),
                const SizedBox(height: 8),
                Text('[W1] Progressive onboarding: verify later, not first', style: SA.t(12, w: FontWeight.w600)),
                Text('example.com', style: SA.t(11, c: SA.muted)),
                Text("Deferring an identity or account check until after a user's first successful action recovers most of what a hard gate loses.",
                    style: SA.t(12, c: SA.muted, h: 1.4)),
                const SizedBox(height: 8),
                Text('[W2] Visible retry states outperform silent failure', style: SA.t(12, w: FontWeight.w600)),
                Text('example.com', style: SA.t(11, c: SA.muted)),
                Text('A stalled connection that shows retry progress keeps more users than one that just goes quiet.',
                    style: SA.t(12, c: SA.muted, h: 1.4)),
              ]),
            ),
            const SizedBox(height: 10),
            SACard(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('Clarification', style: SA.t(12, w: FontWeight.w700)),
                  const Spacer(),
                  const Pill('No external action', outlined: true),
                ]),
                const SizedBox(height: 8),
                Text('Two fixes are scoped and costed. Which should ship first?', style: SA.t(13, c: SA.muted)),
                const SizedBox(height: 8),
                Text('Which fix should ship first?', style: SA.t(14, w: FontWeight.w600)),
                const SizedBox(height: 6),
                for (final o in _options)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(children: [
                      const Icon(Icons.radio_button_unchecked, size: 16, color: SA.muted),
                      const SizedBox(width: 10),
                      Expanded(child: Text(o, style: SA.t(13))),
                    ]),
                  ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: SA.primary, borderRadius: BorderRadius.circular(99)),
                  child: Text('Submit answers', style: SA.t(13, w: FontWeight.w600, c: SA.bg)),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            Text.rich(TextSpan(children: [
              _n('Both patterns hold up outside our own funnel too — deferring the identity check until after the first success recovers more, a visible retry on the same gate recovers less but ships in a day '),
              _code(' W1 '),
              _n('.\n\nI costed both against the 214 mobile trials in the window. Pick one above and I will fold it into AI-251 today.'),
            ])),
            _user('Show me the math behind that estimate.'),
            _log(_workLog3),
            SACard(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Connect-data fix comparison', style: SA.t(13, w: FontWeight.w700)),
                Text('3 records · Modeled against the last 21 days of mobile trials', style: SA.t(11, c: SA.muted)),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Table(
                    defaultColumnWidth: const IntrinsicColumnWidth(),
                    children: [
                      for (var r = 0; r < _table.length; r++)
                        TableRow(children: [
                          for (final c in _table[r])
                            Padding(
                              padding: const EdgeInsets.only(right: 16, top: 4, bottom: 4),
                              child: Text(c,
                                  style: SA.t(12.5,
                                      w: r == 0 ? FontWeight.w700 : FontWeight.w400,
                                      c: r == 0 ? SA.muted : SA.fg)),
                            ),
                        ]),
                    ],
                  ),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            Text(
                'Deferring verification alone recovers the most for the least engineering time — 2 days against an estimated 1.1-point trial-to-paid lift. Staging both gets the same recovery on a slower rollout, worth it only if you also want the retry safety net. I will start on your pick from AI-251 the moment you choose.',
                style: SA.t(14, h: 1.5)),
            const SizedBox(height: 16),
          ]),
        ),
        Container(
          margin: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: SA.sidebar, borderRadius: BorderRadius.circular(20), border: Border.all(color: SA.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('This conversation is read-only', style: SA.t(14, c: SA.muted)),
            const SizedBox(height: 14),
            Row(children: [
              _dot(),
              const SizedBox(width: 8),
              Expanded(child: Text(agent.name, style: SA.t(13, c: SA.muted))),
              Text('GPT-6 Luna', style: SA.t(11.5, w: FontWeight.w600)),
              const SizedBox(width: 10),
              Text('Auto', style: SA.t(11.5, w: FontWeight.w600)),
              const SizedBox(width: 10),
              const Icon(Icons.mic_none, size: 16, color: SA.muted),
              const SizedBox(width: 8),
              Container(
                width: 28,
                height: 28,
                decoration: const BoxDecoration(color: SA.card, shape: BoxShape.circle),
                child: const Icon(Icons.arrow_upward, size: 16, color: SA.muted),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
