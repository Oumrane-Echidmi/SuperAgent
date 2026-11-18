import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/business_session.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';

class SheetDeliveryPanel extends StatefulWidget {
  final Map<String, dynamic> order;
  final VoidCallback refresh;
  final ValueChanged<bool> watch;
  const SheetDeliveryPanel(
      {super.key,
      required this.order,
      required this.refresh,
      required this.watch});
  @override
  State<SheetDeliveryPanel> createState() => _SheetDeliveryPanelState();
}

class _SheetDeliveryPanelState extends State<SheetDeliveryPanel> {
  String? selectedId, jobId, error;
  String get path => 'orders/${widget.order['id']}/sheet-delivery';
  Map? get delivery => widget.order['sheetSync']?['delivery'] as Map?;
  Future<Map<String, dynamic>> load(BusinessSession session) async {
    final bundle = <String, dynamic>{};
    Future<void> read(String name, String resource,
        {Map<String, String>? query}) async {
      try {
        bundle[name] = await session.request(resource, query: query);
      } catch (e) {
        if (!session.signedIn) rethrow;
        bundle['${name}Error'] = e.toString();
      }
    }

    await read('destinations', 'sheet-destinations', query: {'limit': '100'});
    if (delivery != null) {
      await read('jobs', '$path/jobs', query: {'limit': '10'});
      await read('preview', path);
      await read(
          'selected', 'sheet-destinations/${delivery!['destinationId']}');
    }
    if (mounted) {
      widget.watch((bundle['jobs']?['data'] as List? ?? [])
          .any((job) => ['QUEUED', 'RUNNING'].contains(job['status'])));
    }
    return bundle;
  }

  Future<void> action(String kind) async {
    final session = WorkspaceScope.of(context);
    setState(() => error = null);
    try {
      if (kind == 'bind') {
        await session
            .request(path, method: 'POST', body: {'destinationId': selectedId});
      }
      if (kind == 'queue') {
        jobId ??= const Uuid().v4();
        await session
            .request('$path/jobs', method: 'POST', body: {'id': jobId});
        jobId = null;
      }
      if (kind == 'reconcile') {
        await session.request('$path/reconcile', method: 'POST', body: {});
      }
      if (mounted) widget.refresh();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return WorkspaceCard(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Spreadsheet delivery', style: SA.t(18, w: FontWeight.w600)),
      Notice(delivery == null
          ? 'No spreadsheet destination selected.'
          : 'Delivery status: ${delivery!['status']}'),
      DataView(
          load: () => load(session),
          builder: (data, reload) {
            final destinations = (data['destinations']?['data'] as List? ?? [])
                .where((d) => d['status'] == 'ACCESS_CHECKED')
                .toList();
            final jobs = data['jobs']?['data'] as List? ?? [],
                preview = data['preview'] as Map?,
                selected = data['selected'] as Map?;
            final active = jobs
                .any((job) => ['QUEUED', 'RUNNING'].contains(job['status']));
            return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  OutlinedButton(
                      onPressed:
                          session.busy || jobId != null ? null : widget.refresh,
                      child: const Text('Refresh delivery status')),
                  for (final name in [
                    'destinations',
                    'jobs',
                    'preview',
                    'selected'
                  ])
                    if (data['${name}Error'] != null)
                      Notice(data['${name}Error'] as String, error: true),
                  if (delivery == null && destinations.isEmpty)
                    const Notice(
                        'A connected Google spreadsheet is required. Account and file setup are not available here yet.'),
                  if (delivery == null && destinations.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                        key: const Key('sheet-destination'),
                        isExpanded: true,
                        initialValue: selectedId,
                        decoration: fieldDecoration('Destination'),
                        items: destinations
                            .map((d) => DropdownMenuItem(
                                value: d['id'] as String,
                                child: Text(
                                    '${d['spreadsheetTitle']} · ${d['tabTitle']}',
                                    overflow: TextOverflow.ellipsis)))
                            .toList(),
                        onChanged: session.busy
                            ? null
                            : (id) => setState(() => selectedId = id)),
                    const SizedBox(height: 12),
                    OutlinedButton(
                        onPressed: session.busy || selectedId == null
                            ? null
                            : () => action('bind'),
                        child: const Text('Use this destination')),
                  ],
                  if (selected != null)
                    Notice(
                        '${selected['spreadsheetTitle']} · ${selected['tabTitle']}'),
                  if (preview != null) ...[
                    const SizedBox(height: 12),
                    Text('Review the spreadsheet row',
                        style: SA.t(15, w: FontWeight.w600)),
                    for (int i = 0;
                        i < (preview['headers'] as List).length;
                        i++)
                      SummaryRow(
                          _labels[preview['headers'][i]] ??
                              '${preview['headers'][i]}',
                          preview['rowPreview'][i]),
                  ],
                  if (delivery != null &&
                      ['READY', 'BLOCKED'].contains(delivery!['status']))
                    FilledButton(
                        onPressed: session.busy ||
                                active ||
                                preview == null ||
                                selected?['status'] != 'ACCESS_CHECKED'
                            ? null
                            : () => action('queue'),
                        child: Text(active
                            ? 'Delivery queued'
                            : jobId != null
                                ? 'Retry this delivery job'
                                : 'Queue spreadsheet delivery')),
                  if (delivery?['status'] == 'UNKNOWN') ...[
                    const Notice(
                        'The row may already exist. Checking its status will not send it again.'),
                    OutlinedButton(
                        onPressed:
                            session.busy ? null : () => action('reconcile'),
                        child: const Text('Check spreadsheet for this order')),
                  ],
                  for (final job in jobs)
                    SummaryRow('${job['status']}', job['createdAt']),
                ]);
          }),
      if (error != null) Notice(error!, error: true),
    ]));
  }
}

const _labels = {
  'operationKey': 'Tracking reference',
  'orderId': 'Order reference',
  'item': 'Item',
  'quantity': 'Quantity',
  'recipient': 'Customer',
  'phone': 'Phone',
  'address': 'Address',
  'unitAmountMinor': 'Unit price (centimes)',
  'deliveryAmountMinor': 'Delivery fee (centimes)',
  'amountMad': 'Total (MAD)',
  'currency': 'Currency',
  'status': 'Order status',
};
