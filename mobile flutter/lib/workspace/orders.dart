import 'package:flutter/material.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';
import 'order_values.dart';
import 'new_order.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  int page = 1, version = 0;
  Future<void> record() async {
    await openOrderForm(context);
    if (mounted) setState(() => version++);
  }

  Future<void> open(String id) async {
    await Navigator.pushNamed(context, '/orders/$id');
    if (mounted) setState(() => version++);
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return WorkspacePage(
        title: 'Order board',
        icon: Icons.view_kanban_outlined,
        children: [
          Intro('Every customer decision, recorded.',
              'Manual orders for ${session.tenant!['name']}.'),
          Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                  onPressed: session.busy ? null : record,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Record order'))),
          const SizedBox(height: 20),
          DataView(
              key: ValueKey('$page-$version'),
              load: () => session.request('order-attempts',
                  query: {'page': '$page', 'pageSize': '25'}),
              builder: (data, reload) {
                final items = data['data'] as List,
                    pagination = data['pagination'] as Map;
                return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                              onPressed: session.busy ? null : reload,
                              icon: const Icon(Icons.refresh, size: 16),
                              label: const Text('Refresh orders'))),
                      if (items.isEmpty)
                        const WorkspaceCard(
                            child: Notice(
                                'No orders yet. Record your first order to start tracking confirmations.')),
                      for (final status in [
                        'PENDING',
                        'CONFIRMED',
                        'DECLINED'
                      ]) ...[
                        Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Row(children: [
                              Icon(Icons.circle,
                                  size: 8,
                                  color: status == 'PENDING'
                                      ? SA.amber
                                      : status == 'CONFIRMED'
                                          ? SA.green
                                          : SA.red),
                              const SizedBox(width: 8),
                              Text(
                                  '${status[0]}${status.substring(1).toLowerCase()}',
                                  style: SA.t(15, w: FontWeight.w600)),
                              const SizedBox(width: 8),
                              Text(
                                  '${items.where((e) => e['status'] == status).length}',
                                  style: SA.t(12, c: SA.muted)),
                            ])),
                        for (final item
                            in items.where((e) => e['status'] == status))
                          Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: WorkspaceCard(
                                  onTap: session.busy
                                      ? null
                                      : () => open(item['id'] as String),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            item['details']['recipient']
                                                    as String? ??
                                                'Customer details needed',
                                            style:
                                                SA.t(15, w: FontWeight.w600)),
                                        const SizedBox(height: 8),
                                        Text(
                                            '${item['details']['item'] ?? 'Item not added'} × ${item['details']['quantity'] ?? '—'}',
                                            style: SA.t(13, c: SA.muted)),
                                        const SizedBox(height: 12),
                                        Wrap(spacing: 20, children: [
                                          Text(mad(
                                              item['review']['amountMinor'])),
                                          Text(
                                              (item['startedAt'] as String)
                                                  .split('T')
                                                  .first,
                                              style: SA.t(12, c: SA.muted))
                                        ]),
                                      ]))),
                      ],
                      if ((pagination['totalPages'] as int) > 1)
                        Wrap(
                            alignment: WrapAlignment.spaceBetween,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              OutlinedButton(
                                  onPressed: page <= 1 || session.busy
                                      ? null
                                      : () => setState(() => page--),
                                  child: const Text('Previous')),
                              Text('Page $page of ${pagination['totalPages']}'),
                              OutlinedButton(
                                  onPressed: page >=
                                              (pagination['totalPages']
                                                  as int) ||
                                          session.busy
                                      ? null
                                      : () => setState(() => page++),
                                  child: const Text('Next')),
                            ]),
                    ]);
              }),
        ]);
  }
}
