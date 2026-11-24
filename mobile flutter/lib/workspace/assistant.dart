import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/business_api.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  Timer? poll;
  final text = TextEditingController();
  Map<String, dynamic>? data, attempt;
  String? active, error;
  String model = '', language = 'fr';
  bool busy = false, consent = false, mcpConsent = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  @override
  void dispose() {
    poll?.cancel();
    text.dispose();
    super.dispose();
  }

  Future<void> load() async {
    poll?.cancel();
    final session = WorkspaceScope.of(context);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final models = await session.request('builder/models');
      final sessions = await session.request('builder/sessions');
      final thread = active == null
          ? null
          : await session.request('builder/sessions/$active');
      if (mounted) {
        setState(() {
          data = {'models': models, 'sessions': sessions, 'thread': thread};
          if (model.isEmpty) model = models['defaultModel'] ?? '';
          final turns = thread?['turns'] as List? ?? [];
          if (turns.any((t) => ['QUEUED', 'RUNNING'].contains(t['status']))) {
            poll = Timer(const Duration(milliseconds: 1500), () {
              if (mounted && !busy && attempt == null) load();
            });
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> send() async {
    poll?.cancel();
    final session = WorkspaceScope.of(context);
    if (attempt == null) {
      if (text.text.trim().isEmpty || (active == null && !consent)) return;
      final id = active ?? const Uuid().v4();
      attempt = {
        'sessionId': id,
        'create': active == null
            ? {
                'id': id,
                'language': language,
                'consentToOpenAI': true,
                'consentToMcp': mcpConsent
              }
            : null,
        'message': {
          'id': const Uuid().v4(),
          'expectedRevision': data?['thread']?['revision'] ?? 0,
          'text': text.text.trim(),
          'model': model
        }
      };
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (attempt!['create'] != null) {
        await session.request('builder/sessions',
            method: 'POST',
            body: Map<String, dynamic>.from(attempt!['create']));
      }
      active = attempt!['sessionId'];
      await session.request('builder/sessions/$active/messages',
          method: 'POST', body: Map<String, dynamic>.from(attempt!['message']));
      attempt = null;
      text.clear();
      if (mounted) await load();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          if (e is ApiException && e.status > 0 && e.status < 500) {
            attempt = null;
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final models = data?['models'];
    final turns = data?['thread']?['turns'] as List? ?? [];
    final pending =
        turns.any((t) => ['QUEUED', 'RUNNING'].contains(t['status']));
    final owner = WorkspaceScope.of(context).tenant?['role'] == 'OWNER';
    final locked = busy || attempt != null;
    return WorkspacePage(
        title: 'AI chat',
        icon: Icons.auto_awesome_outlined,
        children: [
          const Intro('What can I help you build?',
              'Ask anything, or describe your assistant…'),
          Row(children: [
            Expanded(
                child: OutlinedButton(
                    onPressed: locked
                        ? null
                        : () {
                            setState(() {
                              active = null;
                              consent = false;
                              mcpConsent = false;
                              model = '';
                              text.clear();
                            });
                            load();
                          },
                    child: const Text('New chat'))),
            IconButton(
                tooltip: 'Refresh replies',
                onPressed: busy ? null : load,
                icon: const Icon(Icons.refresh))
          ]),
          if (busy) const LinearProgressIndicator(),
          if (error != null) Notice(error!, error: true),
          if (data == null && !busy)
            OutlinedButton(onPressed: load, child: const Text('Try again')),
          if (active == null) ...[
            for (final s in data?['sessions']?['data'] ?? [])
              ListTile(
                  title: Text(s['title'] ??
                      'Session ${s['id'].toString().substring(0, 8)}'),
                  subtitle: Text('Revision ${s['revision']}'),
                  onTap: locked
                      ? null
                      : () {
                          active = s['id'];
                          load();
                        }),
            for (final suggestion in [
              'Help me set up an assistant to confirm cash-on-delivery orders in Darija.',
              'I want an assistant that answers customer questions about my products in French.',
              'Help me organize incoming customer requests and identify what needs my attention.'
            ])
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: WorkspaceCard(
                      onTap: locked
                          ? null
                          : () => setState(() => text.text = suggestion),
                      child: Text(suggestion))),
          ],
          for (final turn in turns)
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: WorkspaceCard(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('You', style: SA.t(12, c: SA.muted)),
                      SelectableText(turn['text']),
                      const Divider(height: 32),
                      Text('SuperAgent · ${turn['model'] ?? 'Default model'}',
                          style: SA.t(12, c: SA.muted)),
                      const SizedBox(height: 8),
                      SelectableText(turn['status'] == 'SUCCEEDED'
                          ? (turn['result']?['reply'] ??
                              turn['result']?['message'] ??
                              '')
                          : turn['status'] == 'FAILED'
                              ? 'This reply could not be completed (${turn['errorCode']}). You can send a new message.'
                              : 'Assistant is working…')
                    ]))),
          if (pending)
            OutlinedButton(
                onPressed: busy ? null : load,
                child: const Text('Refresh reply')),
          if (models != null && models['enabled'] != true)
            const Notice('AI is not configured for this workspace yet.'),
          if (!owner)
            const Notice('Only business owners can send setup messages.'),
          if (active == null) ...[
            CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: consent,
                onChanged: locked || !owner
                    ? null
                    : (v) => setState(() => consent = v!),
                title: const Text('Share this setup conversation with OpenAI')),
            if ((models?['mcpServers'] as List? ?? []).isNotEmpty) ...[
              CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: mcpConsent,
                  onChanged: locked || !owner
                      ? null
                      : (v) => setState(() => mcpConsent = v!),
                  title: const Text(
                      'Allow reference tools for this conversation')),
              Notice(
                  'Setup messages may be shared with ${(models['mcpServers'] as List).map((s) => '${s['label']} (${Uri.parse(s['url']).host})').join(', ')}.'),
            ],
            DropdownButtonFormField<String>(
                initialValue: language,
                decoration: fieldDecoration('Reply language'),
                items: const [
                  DropdownMenuItem(value: 'fr', child: Text('Français')),
                  DropdownMenuItem(value: 'darija', child: Text('Darija'))
                ],
                onChanged:
                    locked ? null : (v) => setState(() => language = v!)),
          ],
          const SizedBox(height: 16),
          if (models != null)
            DropdownButtonFormField<String>(
                key: ValueKey(model),
                initialValue:
                    (models['data'] as List).any((m) => m['id'] == model)
                        ? model
                        : null,
                isExpanded: true,
                decoration: fieldDecoration('Model'),
                items: [
                  for (final m in models['data'])
                    DropdownMenuItem(
                        value: m['id'] as String, child: Text(m['name']))
                ],
                onChanged: locked ? null : (v) => setState(() => model = v!)),
          const SizedBox(height: 16),
          TextField(
              controller: text,
              enabled:
                  !locked && !pending && owner && models?['enabled'] == true,
              maxLength: 2000,
              minLines: 3,
              maxLines: 8,
              decoration: fieldDecoration('Message assistant')),
          FilledButton(
              onPressed: busy ||
                      !owner ||
                      models?['enabled'] != true ||
                      model.isEmpty ||
                      (attempt == null &&
                          (pending || (active == null && !consent)))
                  ? null
                  : send,
              child: Text(attempt != null ? 'Retry same message' : 'Send')),
        ]);
  }
}
