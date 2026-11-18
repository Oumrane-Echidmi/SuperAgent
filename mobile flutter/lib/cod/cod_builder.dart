import 'package:flutter/material.dart';
import '../theme.dart';

class CodBuilder extends StatefulWidget {
  const CodBuilder({super.key});
  @override
  State<CodBuilder> createState() => _CodBuilderState();
}

class _Msg {
  final bool user;
  final String text;
  final bool card;
  const _Msg(this.user, this.text, {this.card = false});
}

class _CodBuilderState extends State<CodBuilder> {
  final ctrl = TextEditingController();
  final msgs = <_Msg>[
    const _Msg(false, 'Salam! Gol liya chno bghiti nkhdem lik (scripted demo reply).'),
  ];

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  void send() {
    final t = ctrl.text.trim();
    if (t.isEmpty) return;
    ctrl.clear();
    setState(() {
      msgs.add(_Msg(true, t));
      final l = t.toLowerCase();
      if (l.contains('whatsapp') || l.contains('cod') || l.contains('commande') || l.contains('confirm')) {
        msgs.add(const _Msg(false, 'Wakha! L9it scenario li kaykhdem m3a talabk:'));
        msgs.add(const _Msg(false, 'WhatsApp COD orders', card: true));
      } else {
        msgs.add(const _Msg(false, 'Ma fhmtch mzyan. Jereb: "bghit nconfirmi commandat COD f WhatsApp".'));
      }
    });
  }

  @override
  Widget build(BuildContext context) => SAPage(
        title: 'Builder',
        icon: Icons.auto_awesome_outlined,
        body: Column(children: [
          const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Demo data - not live (scripted replies)', color: SA.amber)),
          Expanded(
            child: ListView(padding: const EdgeInsets.all(16), children: [
              for (final m in msgs)
                Align(
                  alignment: m.user ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    constraints: const BoxConstraints(maxWidth: 300),
                    child: m.card
                        ? SACard(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                const Icon(Icons.forum_outlined, size: 16, color: SA.green),
                                const SizedBox(width: 8),
                                Text(m.text, style: SA.t(14, w: FontWeight.w600)),
                              ]),
                              const SizedBox(height: 4),
                              Text('Confirm COD orders on WhatsApp, log to Google Sheets.', style: SA.t(12, c: SA.muted)),
                              const SizedBox(height: 8),
                              FilledButton(
                                onPressed: () => Navigator.pushNamed(context, '/cod/review'),
                                child: const Text('Review'),
                              ),
                            ]),
                          )
                        : SACard(
                            color: m.user ? SA.sidebar : SA.card,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            child: Text(m.text, style: SA.t(14)),
                          ),
                  ),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: ctrl,
                  style: SA.t(14),
                  onSubmitted: (_) => send(),
                  decoration: const InputDecoration(
                      hintText: 'Kteb l-hadaf dyalk...', hintStyle: TextStyle(color: SA.muted), border: OutlineInputBorder()),
                ),
              ),
              IconButton(onPressed: send, icon: const Icon(Icons.send, color: SA.fg)),
            ]),
          ),
        ]),
      );
}
