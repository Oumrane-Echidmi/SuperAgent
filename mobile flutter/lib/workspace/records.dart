import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/workspace_scope.dart';
import '../account/business_api.dart';
import '../theme.dart';
import 'components.dart';
import 'workflow_editor.dart';

const recordTitles = {
  'workflow': 'Workflows',
  'document': 'Docs',
  'knowledge': 'Company Brain',
  'agent': 'Agents'
};

class RecordsScreen extends StatefulWidget {
  final String kind;
  const RecordsScreen({super.key, required this.kind});
  @override
  State<RecordsScreen> createState() => _RecordsScreenState();
}

class _RecordsScreenState extends State<RecordsScreen> {
  int page = 1, generation = 0;
  Future<void> edit([Map<String, dynamic>? record]) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RecordEditor(kind: widget.kind, record: record)));
    if (mounted) setState(() => generation++);
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    final title = recordTitles[widget.kind]!;
    return WorkspacePage(
        title: title,
        icon: Icons.description_outlined,
        children: [
          Intro(
              title,
              widget.kind == 'knowledge'
                  ? 'Save business facts and policies for your team. These notes are not automatically shared with AI.'
                  : widget.kind == 'agent'
                      ? 'Save assistant instructions and choose a model.'
                      : widget.kind == 'workflow' ? 'Create and save workflow drafts. Saving a draft does not activate automation.' : 'Write and save documents for your business.'),
          if (session.tenant?['role'] == 'OWNER')
            FilledButton.icon(
                onPressed: () => edit(),
                icon: const Icon(Icons.add),
                label: Text('New ${widget.kind}')),
          const SizedBox(height: 16),
          DataView(
              key: ValueKey('$page-$generation'),
              load: () => session.request('workspace-records', query: {
                    'kind': widget.kind,
                    'page': '$page',
                    'pageSize': '24'
                  }),
              builder: (data, reload) {
                final rows = data['data'] as List;
                return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (rows.isEmpty)
                        Notice(
                            'No ${title.toLowerCase()} yet. Create your first ${widget.kind} to start building your workspace.'),
                      for (final row in rows)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: WorkspaceCard(
                                onTap: () =>
                                    edit(Map<String, dynamic>.from(row)),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(row['title'],
                                          style: SA.t(17, w: FontWeight.w600)),
                                      const SizedBox(height: 8),
                                      Text(
                                          '${row['content']['body'] ?? row['content']['instructions'] ?? ''}',
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis,
                                          style: SA.t(13, c: SA.muted)),
                                      Notice(
                                          'Draft · revision ${row['revision']}')
                                    ]))),
                      PageControls(
                          page: page,
                          total: data['pagination']?['totalPages'] ?? 1,
                          onChanged: (p) => setState(() => page = p)),
                    ]);
              }),
        ]);
  }
}

class RecordEditor extends StatefulWidget {
  final String kind;
  final Map<String, dynamic>? record;
  const RecordEditor({super.key, required this.kind, this.record});
  @override
  State<RecordEditor> createState() => _RecordEditorState();
}

class _RecordEditorState extends State<RecordEditor> {
  final form = GlobalKey<FormState>();
  late final title = TextEditingController(text: widget.record?['title']);
  late final body = TextEditingController(
      text: widget.record?['content']
          ?[widget.kind == 'agent' ? 'instructions' : 'body']);
  late String model = widget.record?['content']?['model'] ?? '';
  late Map<String, dynamic> graph = widget.record?['content'] == null
      ? {
          'nodes': [
            {'id': 'start', 'label': 'Start', 'type': 'trigger'}
          ],
          'edges': []
        }
      : Map<String, dynamic>.from(widget.record!['content']);
  Map<String, dynamic>? intent;
  String? error;
  bool busy = false, uncertain = false;
  @override
  void dispose() {
    title.dispose();
    body.dispose();
    super.dispose();
  }

  Future<void> save(bool archived) async {
    if (!form.currentState!.validate()) return;
    final session = WorkspaceScope.of(context);
    intent ??= {
      if (widget.record == null) 'id': const Uuid().v4(),
      if (widget.record == null) 'kind': widget.kind,
      if (widget.record != null) 'expectedRevision': widget.record!['revision'],
      if (widget.record != null) 'archived': archived,
      'title': title.text.trim(),
      'content': widget.kind == 'workflow'
          ? graph
          : widget.kind == 'agent'
              ? {'instructions': body.text, 'model': model}
              : {'body': body.text},
    };
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await session.request(
          'workspace-records${widget.record == null ? '' : '/${widget.record!['id']}'}',
          method: widget.record == null ? 'POST' : 'PUT',
          body: intent);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          uncertain = e is! ApiException || e.status == 0 || e.status >= 500;
          if (!uncertain) intent = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final owner = WorkspaceScope.of(context).tenant?['role'] == 'OWNER';
    final frozen = busy || uncertain || !owner;
    return Scaffold(
        appBar: AppBar(
            title: Text(
                widget.record == null ? 'New ${widget.kind}' : 'Saved draft')),
        body: SafeArea(
            child: Form(
                key: form,
                child: ListView(padding: const EdgeInsets.all(20), children: [
                  if (!owner)
                    const Notice(
                        'Only business owners can edit these records.'),
                  TextFormField(
                      controller: title,
                      enabled: !frozen,
                      maxLength: 120,
                      decoration: fieldDecoration('Title'),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? 'Enter a title.'
                          : null),
                  const SizedBox(height: 20),
                  if (widget.kind == 'agent')
                    DataView(
                        load: () => WorkspaceScope.of(context)
                            .request('builder/models'),
                        builder: (data, reload) {
                          final models = data['data'] as List;
                          if (model.isEmpty) model = data['defaultModel'] ?? '';
                          return DropdownButtonFormField<String>(
                              initialValue: models.any((m) => m['id'] == model)
                                  ? model
                                  : null,
                              isExpanded: true,
                              decoration: fieldDecoration('Model'),
                              items: [
                                for (final m in models)
                                  DropdownMenuItem(
                                      value: m['id'] as String,
                                      child: Text(m['name']))
                              ],
                              onChanged: frozen
                                  ? null
                                  : (v) => setState(() => model = v!),
                              validator: (v) =>
                                  v == null ? 'Choose a model.' : null);
                        }),
                  const SizedBox(height: 16),
                  if (widget.kind == 'workflow')
                    WorkflowEditor(
                        value: graph,
                        readOnly: frozen,
                        onChanged: (v) => setState(() => graph = v))
                  else
                    TextFormField(
                        controller: body,
                        enabled: !frozen,
                        minLines: 10,
                        maxLines: 20,
                        maxLength: widget.kind == 'agent' ? 12000 : 20000,
                        decoration: fieldDecoration(widget.kind == 'agent'
                            ? 'Instructions'
                            : widget.kind == 'knowledge'
                                ? 'Business knowledge'
                                : 'Content')),
                  if (error != null)
                    Notice(
                        '$error${uncertain ? ' Retry the same request or return to the list to check the saved record.' : ''}',
                        error: true),
                  if (owner)
                    FilledButton(
                        onPressed: busy ? null : () => save(false),
                        child: Text(busy
                            ? 'Saving…'
                            : uncertain
                                ? 'Retry save'
                                : 'Save draft')),
                  if (owner && widget.record != null)
                    OutlinedButton(
                        onPressed: frozen ? null : () => save(true),
                        child: const Text('Archive')),
                ]))));
  }
}

class PageControls extends StatelessWidget {
  final int page, total;
  final ValueChanged<int> onChanged;
  const PageControls(
      {super.key,
      required this.page,
      required this.total,
      required this.onChanged});
  @override
  Widget build(BuildContext context) => total <= 1
      ? const SizedBox.shrink()
      : Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          IconButton(
              tooltip: 'Previous page',
              onPressed: page > 1 ? () => onChanged(page - 1) : null,
              icon: const Icon(Icons.chevron_left)),
          Text('Page $page of $total'),
          IconButton(
              tooltip: 'Next page',
              onPressed: page < total ? () => onChanged(page + 1) : null,
              icon: const Icon(Icons.chevron_right))
        ]);
}
