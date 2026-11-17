import 'package:flutter/material.dart';
import '../theme.dart';

class _Chat {
  final String name, last;
  final bool human;
  const _Chat(this.name, this.last, this.human);
}

const _chats = [
  _Chat('Youssef B.', 'Nam, confirmi', false),
  _Chat('Salma K.', 'Bghit nbddl l-3enwan', true),
  _Chat('Omar T.', 'Salam', false),
];

class CodInbox extends StatelessWidget {
  const CodInbox({super.key});
  @override
  Widget build(BuildContext context) => SAPage(
        title: 'WhatsApp Inbox',
        icon: Icons.forum_outlined,
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Pill('Demo data - not live', color: SA.amber),
          const SizedBox(height: 12),
          for (final c in _chats)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SACard(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CodConversation(chat: c))),
                child: Row(children: [
                  Avatar(c.name.substring(0, 1)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(c.name, style: SA.t(14, w: FontWeight.w600)),
                      Text(c.last, style: SA.t(12, c: SA.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ]),
                  ),
                  Pill(c.human ? 'HUMAN_ACTIVE' : 'AI_ACTIVE', color: c.human ? SA.amber : SA.green),
                ]),
              ),
            ),
        ]),
      );
}

class CodConversation extends StatefulWidget {
  final _Chat chat;
  const CodConversation({super.key, required this.chat});
  @override
  State<CodConversation> createState() => _CodConversationState();
}

class _CodConversationState extends State<CodConversation> {
  late bool human = widget.chat.human;

  @override
  Widget build(BuildContext context) {
    // sender: 0 customer, 1 AI, 2 staff
    final msgs = <List<Object>>[
      [0, 'Salam, bghit nconfirmi'],
      [1, 'Salam! Confirmi commande #1042 (349 MAD)?'],
      [0, widget.chat.last],
      if (human) [2, 'Ana mn l-equipe, ghadi n3awnek.'],
    ];
    return Scaffold(
      backgroundColor: SA.bg,
      appBar: AppBar(
        backgroundColor: SA.bg,
        iconTheme: const IconThemeData(color: SA.fg),
        title: Text(widget.chat.name, style: SA.t(14, w: FontWeight.w600)),
        actions: [
          Center(child: Pill(human ? 'HUMAN_ACTIVE' : 'AI_ACTIVE', color: human ? SA.amber : SA.green)),
          const SizedBox(width: 12),
        ],
      ),
      body: Column(children: [
        const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Demo data - not live', color: SA.amber)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            for (final m in msgs)
              Align(
                alignment: m[0] == 0 ? Alignment.centerLeft : Alignment.centerRight,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  constraints: const BoxConstraints(maxWidth: 280),
                  child: SACard(
                    color: m[0] == 0 ? SA.card : SA.sidebar,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (m[0] != 0) Text(m[0] == 1 ? 'AI' : 'Staff', style: SA.t(10, c: m[0] == 1 ? SA.green : SA.amber, w: FontWeight.w700)),
                      Text(m[1] as String, style: SA.t(13)),
                      if (m[0] != 0)
                        const Align(
                          alignment: Alignment.centerRight,
                          child: Icon(Icons.done_all, size: 14, color: SA.blue),
                        ),
                    ]),
                  ),
                ),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: Text(human ? 'Staff owns this conversation. AI is paused.' : 'AI is replying.',
                  style: SA.t(12, c: SA.muted)),
            ),
            if (!human) FilledButton(onPressed: () => setState(() => human = true), child: const Text('Take over')),
            if (human) FilledButton(onPressed: () => setState(() => human = false), child: const Text('Resume')),
          ]),
        ),
      ]),
    );
  }
}
