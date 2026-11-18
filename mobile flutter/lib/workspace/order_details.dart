import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/business_session.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';
import 'order_values.dart';
import 'sheet_delivery.dart';

class OrderDetailsScreen extends StatefulWidget {
  final String id;
  const OrderDetailsScreen({super.key, required this.id});
  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  final evidence = TextEditingController();
  Map<String, dynamic>? plan;
  String? error, success;
  int version = 0;
  Timer? poll;
  @override
  void dispose() {
    evidence.dispose();
    poll?.cancel();
    super.dispose();
  }

  Future<Map<String, dynamic>> load(BusinessSession session) async {
    final attempt = await session.request('order-attempts/${widget.id}');
    Map<String, dynamic>? order;
    if (attempt['status'] == 'CONFIRMED') {
      order = await session.request('orders/${widget.id}');
    }
    return {'attempt': attempt, 'order': order};
  }

  void refresh() {
    if (mounted) setState(() => version++);
  }

  void watch(bool active) {
    poll?.cancel();
    if (!active) return;
    poll = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted && !WorkspaceScope.of(context).busy) refresh();
    });
  }

  Future<void> decide(Map attempt, String decision) async {
    if (evidence.text.trim().isEmpty) {
      setState(() => error =
          'Record what the customer told you before saving a decision.');
      return;
    }
    final session = WorkspaceScope.of(context);
    setState(() {
      error = null;
      success = null;
    });
    plan ??= Map.unmodifiable({
      'id': const Uuid().v4(),
      'expectedRevision': attempt['revision'],
      'summaryHash': attempt['summaryHash'],
      'decision': decision,
      'evidence': evidence.text.trim()
    });
    try {
      await session.request('order-attempts/${widget.id}/decisions',
          method: 'POST', body: plan);
      if (mounted) {
        setState(() {
          plan = null;
          evidence.clear();
          success = 'Customer decision recorded.';
          version++;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          if (e is ApiException && e.status >= 400 && e.status < 500) {
            plan = null;
            version++;
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return PopScope(
        canPop: !session.busy,
        child: WorkspacePage(
            title: 'Order details',
            icon: Icons.receipt_long_outlined,
            children: [
              TextButton.icon(
                  onPressed: session.busy ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back, size: 16),
                  label: const Text('Back to orders')),
              if (error != null) Notice(error!, error: true),
              if (success != null) Notice(success!),
              DataView(
                  key: ValueKey(version),
                  load: () => load(session),
                  builder: (bundle, reload) {
                    final attempt = bundle['attempt'] as Map,
                        details = attempt['details'] as Map,
                        review = attempt['review'] as Map;
                    final order = bundle['order'] as Map<String, dynamic>?;
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Intro(
                              details['recipient'] as String? ??
                                  'Customer order',
                              'Review the saved details before recording the customer’s decision.',
                              eyebrow: attempt['status'] as String),
                          WorkspaceCard(
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                SummaryRow('Customer', details['recipient']),
                                SummaryRow('Phone', details['phone']),
                                SummaryRow('Item', details['item']),
                                SummaryRow('Quantity', details['quantity']),
                                SummaryRow('Address', details['address']),
                                SummaryRow('Unit price',
                                    mad(details['unitAmountMinor'])),
                                SummaryRow('Delivery fee',
                                    mad(details['deliveryAmountMinor'])),
                                SummaryRow('Total', mad(review['amountMinor'])),
                              ])),
                          const SizedBox(height: 16),
                          if (attempt['status'] == 'PENDING')
                            WorkspaceCard(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                  Text('Record a customer decision',
                                      style: SA.t(18, w: FontWeight.w600)),
                                  const Notice(
                                      'This saves your evidence. It does not send the customer a message.'),
                                  if (review['ready'] != true)
                                    const Notice(
                                        'Some details or shop prices are missing. Confirm only after the order is complete.'),
                                  TextField(
                                      key: const Key('decision-evidence'),
                                      controller: evidence,
                                      enabled: !session.busy && plan == null,
                                      minLines: 3,
                                      maxLines: 5,
                                      maxLength: 500,
                                      decoration: fieldDecoration(
                                          'Customer decision evidence',
                                          hint:
                                              'For example: customer confirmed this summary by phone.')),
                                  const SizedBox(height: 16),
                                  for (final entry in const [
                                    ('CONFIRM', 'Confirm order'),
                                    ('DECLINE', 'Decline order'),
                                    ('AMBIGUOUS', 'Record unclear response')
                                  ])
                                    Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 8),
                                        child: OutlinedButton(
                                            onPressed: session.busy ||
                                                    (entry.$1 == 'CONFIRM' &&
                                                        review['ready'] !=
                                                            true) ||
                                                    (plan != null &&
                                                        plan!['decision'] !=
                                                            entry.$1)
                                                ? null
                                                : () =>
                                                    decide(attempt, entry.$1),
                                            child: Text(
                                                plan?['decision'] == entry.$1 &&
                                                        error != null
                                                    ? 'Retry this decision'
                                                    : entry.$2))),
                                ])),
                          if (order != null) ...[
                            if (session.tenant!['role'] == 'OWNER')
                              SheetDeliveryPanel(
                                  key: ValueKey('delivery-$version'),
                                  order: order,
                                  refresh: refresh,
                                  watch: watch)
                            else
                              Notice(
                                  'Spreadsheet delivery: ${order['sheetSync']?['delivery']?['status'] ?? 'not queued'}'),
                          ],
                        ]);
                  }),
            ]));
  }
}
