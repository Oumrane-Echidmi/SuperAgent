import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/business_api.dart';
import '../account/workspace_scope.dart';
import 'components.dart';
import 'order_values.dart';

Future<void> openOrderForm(BuildContext context) async {
  final id = await Navigator.pushNamed(context, '/orders/new');
  if (context.mounted && id is String) {
    await Navigator.pushNamed(context, '/orders/$id');
  }
}

class NewOrderScreen extends StatelessWidget {
  const NewOrderScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return WorkspacePage(title: 'Record order', icon: Icons.add, children: [
      const Intro('A new customer order.',
          'Save the details, then review the summary before recording a decision.'),
      DataView(
          load: session.loadProfile,
          builder: (data, _) =>
              NewOrderForm(language: data['language'] as String)),
    ]);
  }
}

class NewOrderForm extends StatefulWidget {
  final String language;
  const NewOrderForm({super.key, required this.language});
  @override
  State<NewOrderForm> createState() => _NewOrderFormState();
}

class _NewOrderFormState extends State<NewOrderForm> {
  final form = GlobalKey<FormState>();
  final controllers = <String, TextEditingController>{
    for (final name in [
      'recipient',
      'phone',
      'item',
      'quantity',
      'unitPrice',
      'deliveryPrice',
      'address'
    ])
      name: TextEditingController(
          text: name == 'quantity'
              ? '1'
              : name == 'deliveryPrice'
                  ? '0.00'
                  : ''),
  };
  final id = const Uuid().v4(), conversationId = const Uuid().v4();
  Map<String, dynamic>? intent;
  String? error;
  @override
  void dispose() {
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    final session = WorkspaceScope.of(context);
    setState(() => error = null);
    try {
      intent ??= Map.unmodifiable({
        'id': id,
        'conversationId': conversationId,
        'language': widget.language,
        'details': Map<String, dynamic>.unmodifiable({
          for (final field in ['recipient', 'phone', 'item', 'address'])
            field: controllers[field]!.text.trim(),
          'quantity': int.parse(controllers['quantity']!.text),
          'unitAmountMinor': moneyMinor(controllers['unitPrice']!.text),
          'deliveryAmountMinor': moneyMinor(controllers['deliveryPrice']!.text),
        }),
      });
      await session.createOrder(intent!);
      if (mounted) Navigator.pop(context, id);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          if (e is ApiException && e.status == 422) intent = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = WorkspaceScope.of(context).busy,
        enabled = !busy && intent == null;
    Widget field(String name, String label,
            {int maxLength = 120, int lines = 1, TextInputType? keyboard}) =>
        Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: TextFormField(
                key: Key(name),
                controller: controllers[name],
                enabled: enabled,
                maxLength: maxLength,
                minLines: lines,
                maxLines: lines,
                keyboardType: keyboard,
                decoration: fieldDecoration(label,
                    hint: name == 'phone' ? '+212612345678' : null),
                validator: (value) {
                  if (value!.trim().isEmpty) {
                    return 'Enter ${label.toLowerCase()}.';
                  }
                  if (name == 'phone' &&
                      !RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(value.trim())) {
                    return 'Use an international phone number, such as +212612345678.';
                  }
                  if (name == 'quantity') {
                    final n = int.tryParse(value);
                    if (n == null || n < 1 || n > 1000) {
                      return 'Enter a quantity from 1 to 1000.';
                    }
                  }
                  if (name == 'unitPrice' || name == 'deliveryPrice') {
                    try {
                      moneyMinor(value);
                    } on FormatException catch (e) {
                      return e.message;
                    }
                  }
                  return null;
                }));
    return PopScope(
        canPop: !busy,
        child: WorkspaceCard(
            child: Form(
                key: form,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      field('recipient', 'Customer name'),
                      field('phone', 'Phone',
                          maxLength: 16, keyboard: TextInputType.phone),
                      field('item', 'Item', maxLength: 200),
                      field('quantity', 'Quantity',
                          maxLength: 4, keyboard: TextInputType.number),
                      field('unitPrice', 'Unit price (MAD)',
                          maxLength: 11,
                          keyboard: const TextInputType.numberWithOptions(
                              decimal: true)),
                      field('deliveryPrice', 'Delivery fee (MAD)',
                          maxLength: 11,
                          keyboard: const TextInputType.numberWithOptions(
                              decimal: true)),
                      field('address', 'Delivery address',
                          maxLength: 500,
                          lines: 3,
                          keyboard: TextInputType.streetAddress),
                      if (error != null) Notice(error!, error: true),
                      if (intent != null && error != null)
                        const Notice(
                            'The same order reference and saved details will be reused when you retry.'),
                      FilledButton(
                          onPressed: busy ? null : save,
                          child: Text(busy
                              ? 'Saving order…'
                              : intent != null
                                  ? 'Retry saving this order'
                                  : 'Save order details')),
                    ]))));
  }
}
