import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/workspace_scope.dart';
import '../account/business_api.dart';
import '../theme.dart';
import 'components.dart';
import 'records.dart';

class ConnectedInboxScreen extends StatefulWidget {
  const ConnectedInboxScreen({super.key});
  @override
  State<ConnectedInboxScreen> createState() => _ConnectedInboxScreenState();
}

class _ConnectedInboxScreenState extends State<ConnectedInboxScreen> {
  final reference = TextEditingController();
  final form = GlobalKey<FormState>();
  String language = 'darija';
  int page = 1, generation = 0;
  bool busy = false;
  String? error;
  Map<String, dynamic>? intent;
  @override
  void dispose() {
    reference.dispose();
    super.dispose();
  }

  Future<void> create() async {
    if (!form.currentState!.validate()) return;
    final session = WorkspaceScope.of(context);
    intent ??= {
      'id': const Uuid().v4(),
      'customerReference': reference.text.trim(),
      'language': language
    };
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await session.request('conversations', method: 'POST', body: intent);
      if (mounted) {
        setState(() {
          intent = null;
          reference.clear();
          page = 1;
          generation++;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          if (e is ApiException && e.status > 0 && e.status < 500) {
            intent = null;
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      WorkspacePage(title: 'Inbox', icon: Icons.inbox_outlined, children: [
        const Intro('Customer conversations',
            'Saved customer conversations and their linked orders. Adding a conversation does not send a message to the customer.'),
        OutlinedButton(
            onPressed: () => Navigator.pushNamed(context, '/orders/new'),
            child: const Text('New order')),
        Form(
            key: form,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                      controller: reference,
                      enabled: !busy && intent == null,
                      maxLength: 200,
                      decoration: fieldDecoration('Customer reference'),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? 'Enter a customer reference.'
                          : null),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                      initialValue: language,
                      decoration: fieldDecoration('Language'),
                      items: const [
                        DropdownMenuItem(
                            value: 'darija', child: Text('Darija')),
                        DropdownMenuItem(value: 'fr', child: Text('French'))
                      ],
                      onChanged: busy || intent != null
                          ? null
                          : (v) => setState(() => language = v!)),
                  if (error != null) Notice(error!, error: true),
                  const SizedBox(height: 16),
                  FilledButton(
                      onPressed: busy ? null : create,
                      child: Text(busy
                          ? 'Adding…'
                          : intent != null
                              ? 'Retry conversation'
                              : 'Add conversation')),
                ])),
        const SizedBox(height: 24),
        DataView(
            key: ValueKey('$page-$generation'),
            load: () => WorkspaceScope.of(context).request('conversations',
                query: {'page': '$page', 'pageSize': '25'}),
            builder: (data, reload) => Column(children: [
                  if ((data['data'] as List).isEmpty)
                    const Notice(
                        'No customer conversations yet. Add one here or create your first order.'),
                  for (final row in data['data'])
                    Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: WorkspaceCard(
                            onTap: () => Navigator.pushNamed(
                                context, '/inbox/${row['id']}'),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(row['customerReference'],
                                      style: SA.t(17, w: FontWeight.w600)),
                                  Notice(
                                      '${row['channel']} · ${row['language']} · ${row['ownership']}'),
                                  const Text('Open conversation →')
                                ]))),
                  PageControls(
                      page: page,
                      total: data['pagination']?['totalPages'] ?? 1,
                      onChanged: (p) => setState(() => page = p)),
                ])),
      ]);
}

class ConversationScreen extends StatefulWidget {
  final String id;
  const ConversationScreen({super.key, required this.id});
  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  int page = 1;
  @override
  Widget build(BuildContext context) => WorkspacePage(
          title: 'Conversation',
          icon: Icons.forum_outlined,
          children: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Back to inbox')),
            DataView(
                load: () => WorkspaceScope.of(context)
                    .request('conversations/${widget.id}'),
                builder: (data, reload) => Intro(data['customerReference'],
                    '${data['channel']} · ${data['language']} · ${data['ownership']}')),
            Text('Order history', style: SA.t(20, w: FontWeight.w600)),
            DataView(
                key: ValueKey(page),
                load: () => WorkspaceScope.of(context).request('order-attempts',
                        query: {
                          'conversationId': widget.id,
                          'page': '$page',
                          'pageSize': '25'
                        }),
                builder: (data, reload) => Column(children: [
                      if ((data['data'] as List).isEmpty)
                        const Notice(
                            'No orders recorded for this conversation.'),
                      for (final row in data['data'])
                        ListTile(
                            title: Text(
                                row['details']['item'] ?? 'Order in progress'),
                            subtitle: Text(
                                '${row['status']} · revision ${row['revision']}'),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => Navigator.pushNamed(
                                context, '/orders/${row['id']}')),
                      PageControls(
                          page: page,
                          total: data['pagination']?['totalPages'] ?? 1,
                          onChanged: (p) => setState(() => page = p)),
                    ])),
          ]);
}
