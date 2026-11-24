import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/workspace_scope.dart';
import '../account/business_api.dart';
import '../theme.dart';
import 'components.dart';

class BuilderScreen extends StatefulWidget {
  const BuilderScreen({super.key});
  @override
  State<BuilderScreen> createState() => _BuilderScreenState();
}

class _BuilderScreenState extends State<BuilderScreen> {
  final draftForm = GlobalKey<FormState>(),
      generateForm = GlobalKey<FormState>();
  final name = TextEditingController(),
      goal = TextEditingController(),
      prompt = TextEditingController();
  final Map<String, Map<String, dynamic>> resources = {};
  final Map<String, String> errors = {};
  Map<String, dynamic>? detail, intent;
  String? scenario, selectedDraft, number, error, success;
  String language = 'fr', generateLanguage = 'fr';
  bool busy = false, loading = true, consent = false;
  bool get owner => WorkspaceScope.of(context).tenant?['role'] == 'OWNER';
  List<dynamic> rows(String key) => resources[key]?['data'] as List? ?? [];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  @override
  void dispose() {
    name.dispose();
    goal.dispose();
    prompt.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final session = WorkspaceScope.of(context);
    if (mounted) setState(() => loading = true);
    for (final key in [
      'scenarios',
      'drafts',
      'generated-workflows',
      'whatsapp-numbers',
      'publications',
      'workflow-runs'
    ]) {
      try {
        final value = key == 'scenarios'
            ? await session.loadScenarios()
            : await session.request(key);
        if (!mounted) return;
        setState(() {
          resources[key] = value;
          errors.remove(key);
        });
      } catch (e) {
        if (!mounted) return;
        setState(() => errors[key] = e.toString());
      }
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> open(String id) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final value = await WorkspaceScope.of(context).request('drafts/$id');
      if (mounted) setState(() => detail = value);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> mutate(
      String path, Map<String, dynamic> body, String message) async {
    if (busy || !owner) return;
    intent ??= {'path': path, 'body': body, 'message': message};
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      final pending = intent!;
      final result = await WorkspaceScope.of(context).request(pending['path'],
          method: 'POST', body: Map<String, dynamic>.from(pending['body']));
      if (!mounted) return;
      if (pending['path'] == 'drafts') {
        detail = result;
        name.clear();
        goal.clear();
      }
      if (pending['path'] == 'generated-workflows') {
        prompt.clear();
        consent = false;
      }
      final refreshId = detail?['id'];
      setState(() {
        success = pending['message'];
        intent = null;
      });
      await load();
      if (refreshId != null && mounted) {
        final fresh =
            await WorkspaceScope.of(context).request('drafts/$refreshId');
        if (mounted) setState(() => detail = fresh);
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

  Widget section(String title, List<Widget> children) => Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: WorkspaceCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: SA.t(20, w: FontWeight.w600)),
        const SizedBox(height: 16),
        ...children
      ])));
  Widget status(String key) => errors[key] == null
      ? const SizedBox.shrink()
      : Column(children: [
          Notice(errors[key]!, error: true),
          TextButton(
              onPressed: loading || busy ? null : load,
              child: Text('Retry $key'))
        ]);
  Widget field(TextEditingController c, String label, int max,
          {int lines = 1}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: TextFormField(
              controller: c,
              enabled: !busy && intent == null,
              maxLength: max,
              minLines: lines,
              maxLines: lines + 2,
              decoration: fieldDecoration(label),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Enter $label.' : null));
  Widget languageField(String value, ValueChanged<String> change) =>
      DropdownButtonFormField<String>(
          initialValue: value,
          decoration: fieldDecoration('Language'),
          items: const [
            DropdownMenuItem(value: 'fr', child: Text('Français')),
            DropdownMenuItem(value: 'darija', child: Text('Darija'))
          ],
          onChanged: busy || intent != null
              ? null
              : (v) => setState(() => change(v!)));
  @override
  Widget build(BuildContext context) {
    final frozen = busy || intent != null;
    final publishable = [
      for (final d in rows('drafts'))
        {
          'key': 'draft:${d['id']}',
          'label': '${d['name']} · rev. ${d['revision']}',
          'draft': d
        },
      for (final g in rows('generated-workflows'))
        if (g['approvedAt'] != null)
          {
            'key': 'gen:${g['id']}',
            'label': 'Generated: ${g['goal']}',
            'generated': g
          }
    ];
    return WorkspacePage(
        title: 'Builder',
        icon: Icons.account_tree_outlined,
        children: [
          const Intro('Scenarios and drafts',
              'Pick a released scenario, review a draft, simulate it with sample data, then approve the exact revision. Approved drafts can be published to a WhatsApp number below.',
              eyebrow: 'Workflow builder'),
          if (loading) const LinearProgressIndicator(),
          if (error != null) Notice(error!, error: true),
          if (success != null) Notice(success!),
          if (intent != null) ...[
            const Notice(
                'The result is uncertain. Retry the same request or refresh to check the saved result.'),
            FilledButton(
                onPressed: busy
                    ? null
                    : () => mutate(
                        intent!['path'],
                        Map<String, dynamic>.from(intent!['body']),
                        intent!['message']),
                child: const Text('Retry same request'))
          ],
          section('Scenario catalog', [
            status('scenarios'),
            if (resources.containsKey('scenarios') && rows('scenarios').isEmpty)
              const Notice('No scenario has been released yet.'),
            for (final s in rows('scenarios'))
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${s['name']} (rev. ${s['revision']})'),
                  subtitle: Text(s['description'] ?? ''))
          ]),
          if (owner && rows('scenarios').isNotEmpty)
            section('New draft', [
              Form(
                  key: draftForm,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DropdownButtonFormField<String>(
                            initialValue: scenario,
                            isExpanded: true,
                            decoration: fieldDecoration('Scenario'),
                            items: [
                              for (final s in rows('scenarios'))
                                DropdownMenuItem(
                                    value:
                                        '${s['scenarioId']}:${s['revision']}',
                                    child: Text(
                                        '${s['name']} (rev. ${s['revision']})',
                                        overflow: TextOverflow.ellipsis))
                            ],
                            onChanged: frozen
                                ? null
                                : (v) => setState(() => scenario = v),
                            validator: (v) =>
                                v == null ? 'Choose a scenario.' : null),
                        const SizedBox(height: 16),
                        field(name, 'Draft name', 120),
                        field(goal, 'Goal', 4000, lines: 3),
                        languageField(language, (v) => language = v),
                        const SizedBox(height: 16),
                        FilledButton(
                            onPressed: frozen
                                ? null
                                : () {
                                    if (draftForm.currentState!.validate()) {
                                      final parts = scenario!.split(':');
                                      mutate(
                                          'drafts',
                                          {
                                            'id': const Uuid().v4(),
                                            'scenarioId': parts[0],
                                            'scenarioRevision':
                                                int.parse(parts[1]),
                                            'content': {
                                              'name': name.text.trim(),
                                              'goal': goal.text.trim(),
                                              'language': language
                                            }
                                          },
                                          'Draft created.');
                                    }
                                  },
                            child: const Text('Create draft')),
                      ]))
            ]),
          section('Your drafts', [
            status('drafts'),
            if (resources.containsKey('drafts') && rows('drafts').isEmpty)
              const Notice('No drafts yet.'),
            for (final d in rows('drafts'))
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${d['name']} · rev. ${d['revision']}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: frozen ? null : () => open(d['id']))
          ]),
          if (detail != null)
            section(detail!['content']?['name'] ?? 'Draft', [
              Notice(
                  'Revision ${detail!['revision']} · ${detail!['content']?['language']}'),
              Text(detail!['content']?['goal'] ?? ''),
              Notice(
                  'Simulation: ${detail!['simulation'] == null ? 'Not run yet' : detail!['simulation']['valid'] == true ? 'Passed' : 'Failed'} · Approval: ${detail!['approval'] == null ? 'Not approved' : 'Approved'}'),
              if (detail!['simulation'] != null &&
                  detail!['simulation']['valid'] != true)
                SelectableText(const JsonEncoder.withIndent('  ')
                    .convert(detail!['simulation'])),
              if (owner) ...[
                OutlinedButton(
                    onPressed: frozen
                        ? null
                        : () => mutate(
                            'drafts/${detail!['id']}/simulations',
                            {'expectedRevision': detail!['revision']},
                            'Simulation finished.'),
                    child: const Text('Simulate this revision')),
                FilledButton(
                    onPressed: frozen ||
                            detail!['simulation']?['valid'] != true ||
                            detail!['approval'] != null
                        ? null
                        : () => mutate(
                            'drafts/${detail!['id']}/approve',
                            {'expectedRevision': detail!['revision']},
                            'Draft approved.'),
                    child: const Text('Approve this revision'))
              ],
            ]),
          section('Describe a new workflow', [
            const Notice(
                'Describe what you want. The assistant builds and simulates a workflow. It never goes live without your approval. Generated workflows cannot confirm or decline orders.'),
            status('generated-workflows'),
            if (owner)
              Form(
                  key: generateForm,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        field(prompt, 'What should it do?', 1000, lines: 3),
                        languageField(
                            generateLanguage, (v) => generateLanguage = v),
                        CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            value: consent,
                            onChanged: frozen
                                ? null
                                : (v) => setState(() => consent = v!),
                            title: const Text(
                                'I agree to send this description to OpenAI.')),
                        FilledButton(
                            onPressed: frozen || !consent
                                ? null
                                : () {
                                    if (generateForm.currentState!.validate()) {
                                      mutate(
                                          'generated-workflows',
                                          {
                                            'id': const Uuid().v4(),
                                            'goal': prompt.text.trim(),
                                            'language': generateLanguage,
                                            'consentToOpenAI': true
                                          },
                                          'Workflow generated. Review it before approving.');
                                    }
                                  },
                            child: const Text('Generate workflow'))
                      ])),
            for (final g in rows('generated-workflows'))
              ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text(g['goal']),
                  subtitle: Text(
                      '${g['status'] == 'READY' ? 'Passed simulation' : 'Failed checks'}${g['approvedAt'] != null ? ' · Approved' : ''}'),
                  children: [
                    if (g['status'] == 'READY')
                      for (final n in g['workflow']['nodes'])
                        ListTile(
                            title: Text(n['capability']['name']),
                            subtitle: Text(n['inputs']?['text']?['kind'] ==
                                    'literal'
                                ? '${n['inputs']['text']['value']}'
                                : n['inputs']?['reason']?['kind'] == 'literal'
                                    ? '${n['inputs']['reason']['value']}'
                                    : '')),
                    if (g['status'] == 'INVALID')
                      SelectableText(const JsonEncoder.withIndent('  ')
                          .convert(g['report']?['issues'])),
                    if (owner &&
                        g['status'] == 'READY' &&
                        g['approvedAt'] == null)
                      OutlinedButton(
                          onPressed: frozen
                              ? null
                              : () => mutate(
                                  'generated-workflows/${g['id']}/approve',
                                  {},
                                  'Workflow approved.'),
                          child: const Text('Approve')),
                  ]),
          ]),
          section('Publish and monitor', [
            const Notice(
                'A published workflow answers WhatsApp replies on one number. Publish only a draft whose latest revision you approved.'),
            status('whatsapp-numbers'),
            status('publications'),
            if (owner && rows('whatsapp-numbers').isEmpty)
              TextButton(
                  onPressed: () => Navigator.pushNamed(context, '/whatsapp'),
                  child: const Text('Register a WhatsApp number first')),
            if (owner &&
                rows('whatsapp-numbers').isNotEmpty &&
                publishable.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                  initialValue: selectedDraft,
                  isExpanded: true,
                  decoration: fieldDecoration('Draft'),
                  items: [
                    for (final d in publishable)
                      DropdownMenuItem(
                          value: d['key'] as String,
                          child: Text(d['label'] as String,
                              overflow: TextOverflow.ellipsis))
                  ],
                  onChanged:
                      frozen ? null : (v) => setState(() => selectedDraft = v)),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                  initialValue: number,
                  isExpanded: true,
                  decoration: fieldDecoration('WhatsApp number'),
                  items: [
                    for (final n in rows('whatsapp-numbers'))
                      DropdownMenuItem(
                          value: n['id'] as String,
                          child: Text(n['displayName']))
                  ],
                  onChanged: frozen ? null : (v) => setState(() => number = v)),
              const SizedBox(height: 16),
              FilledButton(
                  onPressed: frozen || selectedDraft == null || number == null
                      ? null
                      : () {
                          final chosen = publishable
                              .firstWhere((d) => d['key'] == selectedDraft);
                          mutate(
                              'publications',
                              {
                                'id': const Uuid().v4(),
                                if (chosen['generated'] != null)
                                  'generatedWorkflowId':
                                      (chosen['generated'] as Map)['id'],
                                if (chosen['draft'] != null) ...{
                                  'draftId': (chosen['draft'] as Map)['id'],
                                  'expectedRevision':
                                      (chosen['draft'] as Map)['revision']
                                },
                                'whatsappNumberId': number
                              },
                              'Workflow published.');
                        },
                  child: const Text('Publish approved draft')),
            ],
            const SectionLabel('Live workflows'),
            if (resources.containsKey('publications') &&
                rows('publications').isEmpty)
              const Notice('Nothing is published yet.'),
            for (final p in rows('publications'))
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                      '${p['status']} · draft rev. ${p['draftRevision'] ?? 'Generated'}'),
                  trailing: owner
                      ? TextButton(
                          onPressed: frozen
                              ? null
                              : () => mutate(
                                  'publications/${p['id']}/${p['status'] == 'ACTIVE' ? 'pause' : 'resume'}',
                                  {},
                                  p['status'] == 'ACTIVE'
                                      ? 'Workflow paused.'
                                      : 'Workflow resumed.'),
                          child: Text(
                              p['status'] == 'ACTIVE' ? 'Pause' : 'Resume'))
                      : null),
            const SectionLabel('Recent runs'),
            status('workflow-runs'),
            if (resources.containsKey('workflow-runs') &&
                rows('workflow-runs').isEmpty)
              const Notice('No customer messages processed yet.'),
            for (final r in rows('workflow-runs'))
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${r['status']} · ${r['createdAt']}'),
                  subtitle:
                      Text('${r['reason'] ?? ''} ${r['errorCode'] ?? ''}')),
            OutlinedButton(
                onPressed: busy || loading ? null : load,
                child: const Text('Refresh')),
          ]),
          section('Builder chat', [
            const Notice(
                'Messages are sent to OpenAI. Requires the Builder service to be enabled.'),
            OutlinedButton(
                onPressed: () => Navigator.pushNamed(context, '/chat'),
                child: const Text('Open builder chat'))
          ]),
        ]);
  }
}
