import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});
  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(), number = TextEditingController();
  bool busy = false;
  int generation = 0;
  String? error;
  Map<String, dynamic>? intent;
  @override
  void dispose() {
    name.dispose();
    number.dispose();
    super.dispose();
  }

  Future<void> register() async {
    if (!form.currentState!.validate()) return;
    intent ??= {
      'id': const Uuid().v4(),
      'phoneNumberId': number.text.trim(),
      'displayName': name.text.trim()
    };
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await WorkspaceScope.of(context)
          .request('whatsapp-numbers', method: 'POST', body: intent);
      if (mounted) {
        setState(() {
          intent = null;
          name.clear();
          number.clear();
          generation++;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget list(String path, String title, String empty,
          String Function(dynamic) describe) =>
      DataView(
          key: ValueKey('$path-$generation'),
          load: () => WorkspaceScope.of(context).request(path),
          builder: (data, reload) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: WorkspaceCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                    Text(title, style: SA.t(20, w: FontWeight.w600)),
                    if ((data['data'] as List).isEmpty) Notice(empty),
                    for (final row in data['data'])
                      Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: SelectableText(describe(row))),
                    TextButton(onPressed: reload, child: const Text('Refresh'))
                  ]))));
  @override
  Widget build(BuildContext context) =>
      WorkspacePage(title: 'WhatsApp', icon: Icons.chat_outlined, children: [
        const Intro('Numbers, messages and replies',
            'Register the WhatsApp Business phone number ID from your Meta dashboard, then publish a workflow to it on the Builder page.',
            eyebrow: 'WhatsApp Business'),
        list('whatsapp-numbers', 'Numbers', 'No number registered yet.',
            (n) => '${n['displayName']} · ID ${n['phoneNumberId']}'),
        if (WorkspaceScope.of(context).tenant?['role'] == 'OWNER')
          Form(
              key: form,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                        controller: name,
                        enabled: !busy && intent == null,
                        maxLength: 100,
                        decoration: fieldDecoration('Display name'),
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Enter a display name.'
                            : null),
                    const SizedBox(height: 16),
                    TextFormField(
                        controller: number,
                        enabled: !busy && intent == null,
                        keyboardType: TextInputType.number,
                        decoration: fieldDecoration(
                            'Phone number ID (digits from Meta)'),
                        validator: (v) =>
                            RegExp(r'^\d{5,32}$').hasMatch(v?.trim() ?? '')
                                ? null
                                : 'Enter 5 to 32 digits.'),
                    if (error != null) Notice(error!, error: true),
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: busy ? null : register,
                        child: Text(busy
                            ? 'Registering…'
                            : intent == null
                                ? 'Register number'
                                : 'Retry registration')),
                  ])),
        list(
            'whatsapp-messages',
            'Inbound messages',
            'No messages received yet.',
            (m) =>
                '${m['receivedAt']} · +${m['customerPhone']}: ${m['body'] ?? '(${m['type']})'}'),
        list(
            'whatsapp-outbox',
            'Replies sent by workflows',
            'No replies yet.',
            (m) =>
                '${m['status']} ${m['errorCode'] ?? ''} · to +${m['to']}: ${m['body']}'),
      ]);
}
