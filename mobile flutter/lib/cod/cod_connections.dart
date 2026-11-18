import 'package:flutter/material.dart';
import '../theme.dart';
import 'cod_state.dart';

class CodConnections extends StatelessWidget {
  const CodConnections({super.key});

  @override
  Widget build(BuildContext context) {
    final s = CodState.i;
    Widget card(String title, String detail, IconData icon, ValueNotifier<bool> n) => ValueListenableBuilder<bool>(
          valueListenable: n,
          builder: (_, on, __) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SACard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Icon(icon, size: 18, color: SA.fg),
                  const SizedBox(width: 10),
                  Expanded(child: Text(title, style: SA.t(14, w: FontWeight.w600))),
                  Pill(on ? 'Connected' : 'Disconnected', color: on ? SA.green : SA.red),
                ]),
                const SizedBox(height: 6),
                Text(detail, style: SA.t(12, c: SA.muted)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  FilledButton(onPressed: () => n.value = true, child: Text(on ? 'Reconnect' : 'Connect')),
                  if (on) OutlinedButton(onPressed: () => n.value = false, child: const Text('Disconnect (demo)')),
                ]),
              ]),
            ),
          ),
        );
    return SAPage(
      title: 'Connections',
      icon: Icons.power_outlined,
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Pill('Demo data - not live', color: SA.amber),
        const SizedBox(height: 12),
        card('WhatsApp Business number', '+212 6XX XXX XXX (fixture)', Icons.forum_outlined, s.whatsappConnected),
        card('Google Sheets', 'COD Orders spreadsheet / tab "Orders" (fixture)', Icons.table_chart_outlined,
            s.sheetsConnected),
        Text(
            'In the real product, OAuth is opened server-side in the system browser. These toggles only change local demo state.',
            style: SA.t(11, c: SA.muted)),
      ]),
    );
  }
}
