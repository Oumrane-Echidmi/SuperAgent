import 'package:flutter/material.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';
import 'order_values.dart';
import 'new_order.dart';

class LiveHomeScreen extends StatefulWidget {
  const LiveHomeScreen({super.key});
  @override
  State<LiveHomeScreen> createState() => _LiveHomeScreenState();
}

class _LiveHomeScreenState extends State<LiveHomeScreen> {
  int version = 0;
  Future<void> record() async {
    await openOrderForm(context);
    if (mounted) setState(() => version++);
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return WorkspacePage(
        title: 'Home',
        icon: Icons.grid_view_rounded,
        children: [
          Intro('Welcome, ${session.email!.split('@').first}.',
              'Your shop’s activity, in one place.',
              eyebrow: session.tenant!['name'] as String),
          Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                  onPressed: session.busy ? null : record,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Record an order'))),
          const SizedBox(height: 28),
          DataView(
              key: ValueKey(version),
              load: () async {
                final profile = await session.loadProfile();
                final date = businessDate(profile['timezone'] as String);
                return session.request('dashboard/outcomes',
                    query: {'from': date, 'to': date});
              },
              builder: (data, reload) {
                final values = data['totals'] as Map;
                final metrics = <(String, String)>[
                  ('Pending orders', '${values['pending']}'),
                  ('Confirmed', '${values['confirmed']}'),
                  ('Declined', '${values['declined']}'),
                  (
                    'Confirmation rate',
                    values['confirmationRate'] == null
                        ? '—'
                        : '${((values['confirmationRate'] as num) * 100).round()}%'
                  ),
                  (
                    'Confirmed order value',
                    mad(values['confirmedOrderValueMinor'])
                  ),
                  ('Waiting for sheet sync', '${values['sheetSyncWaiting']}'),
                ];
                return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text('Today at a glance',
                                style: SA.t(18, w: FontWeight.w600)),
                            TextButton.icon(
                                onPressed: session.busy ? null : reload,
                                icon: const Icon(Icons.refresh, size: 16),
                                label: const Text('Refresh')),
                          ]),
                      Text('${data['from']} · ${data['timezone']}',
                          style: SA.t(12, c: SA.muted)),
                      const SizedBox(height: 16),
                      LayoutBuilder(builder: (context, size) {
                        final columns = size.maxWidth >= 700
                            ? 3
                            : size.maxWidth >= 340
                                ? 2
                                : 1;
                        final width =
                            (size.maxWidth - (columns - 1) * 12) / columns;
                        return Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: metrics
                                .map((metric) => ConstrainedBox(
                                    constraints: BoxConstraints(
                                        minWidth: width,
                                        maxWidth: width,
                                        minHeight: 132),
                                    child: WorkspaceCard(
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                          Text(metric.$1,
                                              style: SA.t(12, c: SA.muted)),
                                          const SizedBox(height: 14),
                                          FittedBox(
                                              fit: BoxFit.scaleDown,
                                              alignment: Alignment.centerLeft,
                                              child: Text(metric.$2,
                                                  style: SA.t(24,
                                                      w: FontWeight.w600))),
                                        ]))))
                                .toList());
                      }),
                      const Notice(
                          'Current outcomes for orders started today. Confirmed value does not mean cash collected.'),
                    ]);
              }),
          const SizedBox(height: 20),
          WorkspaceCard(
              onTap: () async {
                await Navigator.pushNamed(context, '/board');
                if (mounted) setState(() => version++);
              },
              child: const ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Your order board'),
                  subtitle:
                      Text('Review details and record customer decisions.'),
                  trailing: Icon(Icons.north_east, size: 18))),
          const SizedBox(height: 12),
          WorkspaceCard(
              onTap: () async {
                await Navigator.pushNamed(context, '/settings');
                if (mounted) setState(() => version++);
              },
              child: const ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Business profile'),
                  subtitle:
                      Text('Set your shop language, timezone and description.'),
                  trailing: Icon(Icons.north_east, size: 18))),
        ]);
  }
}
