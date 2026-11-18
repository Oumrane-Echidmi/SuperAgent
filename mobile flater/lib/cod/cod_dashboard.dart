import 'package:flutter/material.dart';
import '../theme.dart';

class _Order {
  final String id, customer, status, sync;
  final int value;
  final bool collected;
  const _Order(this.id, this.customer, this.status, this.value, this.collected, this.sync);
}

const _orders = [
  _Order('#1042', 'Youssef B.', 'confirmed', 349, false, 'synced'),
  _Order('#1043', 'Salma K.', 'declined', 199, false, 'not_applicable'),
  _Order('#1044', 'Omar T.', 'pending', 520, false, 'pending'),
];

class CodDashboard extends StatelessWidget {
  const CodDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final confirmed = _orders.where((o) => o.status == 'confirmed').length;
    final declined = _orders.where((o) => o.status == 'declined').length;
    final pending = _orders.where((o) => o.status == 'pending').length;
    final decided = confirmed + declined;
    final rate = decided == 0 ? '-' : '${(confirmed * 100 / decided).round()}%';
    final confirmedValue = _orders.where((o) => o.status == 'confirmed').fold<int>(0, (a, o) => a + o.value);
    final cash = _orders.where((o) => o.collected).fold<int>(0, (a, o) => a + o.value);

    Widget stat(String label, String value, Color c) => Expanded(
          child: SACard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: SA.t(11, c: SA.muted)),
              const SizedBox(height: 6),
              Text(value, style: SA.t(20, w: FontWeight.w700, c: c)),
            ]),
          ),
        );

    return SAPage(
      title: 'COD Dashboard',
      icon: Icons.bar_chart_rounded,
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Pill('Demo data - not live', color: SA.amber),
        const SizedBox(height: 12),
        Row(children: [
          stat('Pending', '$pending', SA.amber),
          const SizedBox(width: 8),
          stat('Confirmed', '$confirmed', SA.green),
          const SizedBox(width: 8),
          stat('Declined', '$declined', SA.red),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          stat('Confirmation rate', rate, SA.fg),
          const SizedBox(width: 8),
          stat('Confirmed value', '$confirmedValue MAD', SA.blue),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          stat('Cash collected', '$cash MAD', SA.green),
          const SizedBox(width: 8),
          const Expanded(
            child: SACard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Sheet sync', style: TextStyle(fontSize: 11, color: SA.muted)),
                SizedBox(height: 6),
                Row(children: [
                  Icon(Icons.circle, size: 10, color: SA.amber),
                  SizedBox(width: 6),
                  Text('1 pending (fixture)', style: TextStyle(fontSize: 12, color: SA.fg)),
                ]),
              ]),
            ),
          ),
        ]),
        const SectionLabel('Recent order attempts'),
        for (final o in _orders)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SACard(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CodOrderDetail(order: o))),
              child: Row(children: [
                Avatar(o.customer.substring(0, 1)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${o.id}  ${o.customer}', style: SA.t(14, w: FontWeight.w600)),
                    Text('${o.value} MAD', style: SA.t(12, c: SA.muted)),
                  ]),
                ),
                Pill(o.status,
                    color: o.status == 'confirmed' ? SA.green : o.status == 'declined' ? SA.red : SA.amber),
              ]),
            ),
          ),
      ]),
    );
  }
}

class CodOrderDetail extends StatefulWidget {
  final _Order order;
  const CodOrderDetail({super.key, required this.order});
  @override
  State<CodOrderDetail> createState() => _CodOrderDetailState();
}

class _CodOrderDetailState extends State<CodOrderDetail> {
  late String sync = widget.order.sync;
  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final steps = <String>[
      'Order received (fixture)',
      'WhatsApp confirmation sent',
      if (o.status != 'pending') 'Customer replied: ${o.status}',
      if (o.status == 'confirmed') 'Row appended to sheet',
    ];
    return Scaffold(
      backgroundColor: SA.bg,
      appBar: AppBar(
          backgroundColor: SA.bg,
          title: Text('Order ${o.id}', style: SA.t(14, w: FontWeight.w600)),
          iconTheme: const IconThemeData(color: SA.fg)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Pill('Demo data - not live', color: SA.amber),
        const SectionLabel('Run steps'),
        for (final s in steps)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: SACard(
              child: Row(children: [
                const Icon(Icons.check_circle_outline, size: 16, color: SA.green),
                const SizedBox(width: 10),
                Expanded(child: Text(s, style: SA.t(13))),
              ]),
            ),
          ),
        const SectionLabel('Sheet sync state'),
        SACard(
          child: Row(children: [
            Expanded(child: Text(sync, style: SA.t(13))),
            if (sync == 'failed' || sync == 'pending' || sync == 'synced')
              TextButton(
                onPressed: () => setState(() => sync = 'synced'),
                child: const Text('Retry sync'),
              ),
          ]),
        ),
        const SizedBox(height: 6),
        Text('Retry is simulated locally.', style: SA.t(11, c: SA.muted)),
      ]),
    );
  }
}
