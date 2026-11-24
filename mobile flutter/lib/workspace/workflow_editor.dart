import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../theme.dart';
import 'components.dart';

/// A touch-friendly editor for the same node/edge contract as WorkflowGraph.
class WorkflowEditor extends StatefulWidget {
  final Map<String, dynamic> value;
  final bool readOnly;
  final ValueChanged<Map<String, dynamic>> onChanged;
  const WorkflowEditor(
      {super.key,
      required this.value,
      required this.readOnly,
      required this.onChanged});
  @override
  State<WorkflowEditor> createState() => _WorkflowEditorState();
}

class _WorkflowEditorState extends State<WorkflowEditor> {
  String? source, target;
  List<Map<String, dynamic>> get nodes => (widget.value['nodes'] as List)
      .map((n) => Map<String, dynamic>.from(n))
      .toList();
  List<Map<String, dynamic>> get edges => (widget.value['edges'] as List)
      .map((n) => Map<String, dynamic>.from(n))
      .toList();
  void update(List<Map<String, dynamic>> n, List<Map<String, dynamic>> e) =>
      widget.onChanged({'nodes': n, 'edges': e});
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Workflow draft', style: SA.t(20, w: FontWeight.w600)),
        Notice(
            '${nodes.length} nodes · ${edges.length} connections. Saving a draft does not activate automation.'),
        for (final node in nodes)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: WorkspaceCard(
                  child: Column(children: [
                TextFormField(
                    key: ValueKey(node['id']),
                    initialValue: node['label'],
                    enabled: !widget.readOnly,
                    maxLength: 120,
                    decoration: fieldDecoration('Node label'),
                    validator: (v) => v == null || v.trim().isEmpty
                        ? 'Enter a node label.'
                        : null,
                    onChanged: (v) => update(
                        nodes
                            .map((n) =>
                                n['id'] == node['id'] ? {...n, 'label': v} : n)
                            .toList(),
                        edges)),
                DropdownButtonFormField<String>(
                    initialValue: node['type'],
                    decoration: fieldDecoration('Type'),
                    items: [
                      for (final t in ['trigger', 'action', 'condition', 'end'])
                        DropdownMenuItem(value: t, child: Text(t))
                    ],
                    onChanged: widget.readOnly
                        ? null
                        : (v) => update(
                            nodes
                                .map((n) => n['id'] == node['id']
                                    ? {...n, 'type': v}
                                    : n)
                                .toList(),
                            edges)),
                if (!widget.readOnly)
                  TextButton.icon(
                      onPressed: () {
                        setState(() {
                          source = null;
                          target = null;
                        });
                        update(
                            nodes.where((n) => n['id'] != node['id']).toList(),
                            edges
                                .where((e) =>
                                    e['source'] != node['id'] &&
                                    e['target'] != node['id'])
                                .toList());
                      },
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Remove node')),
              ]))),
        if (!widget.readOnly)
          OutlinedButton.icon(
              onPressed: () => update([
                    ...nodes,
                    {
                      'id': const Uuid().v4(),
                      'label': 'New action',
                      'type': 'action'
                    }
                  ], edges),
              icon: const Icon(Icons.add),
              label: const Text('Add node')),
        for (final edge in edges)
          ListTile(
              title: Text(
                  '${nodes.where((n) => n['id'] == edge['source']).firstOrNull?['label'] ?? edge['source']} → ${nodes.where((n) => n['id'] == edge['target']).firstOrNull?['label'] ?? edge['target']}'),
              trailing: widget.readOnly
                  ? null
                  : IconButton(
                      tooltip: 'Remove connection',
                      icon: const Icon(Icons.close),
                      onPressed: () => update(
                          nodes,
                          edges
                              .where((e) =>
                                  e['source'] != edge['source'] ||
                                  e['target'] != edge['target'])
                              .toList()))),
        if (!widget.readOnly && nodes.length > 1) ...[
          DropdownButtonFormField<String>(
              key: ValueKey('source-$source-${nodes.length}'),
              initialValue: source,
              decoration: fieldDecoration('From node'),
              items: [
                for (final n in nodes)
                  DropdownMenuItem(
                      value: n['id'] as String, child: Text(n['label']))
              ],
              onChanged: (v) => setState(() => source = v)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
              key: ValueKey('target-$target-${nodes.length}'),
              initialValue: target,
              decoration: fieldDecoration('To node'),
              items: [
                for (final n in nodes)
                  DropdownMenuItem(
                      value: n['id'] as String, child: Text(n['label']))
              ],
              onChanged: (v) => setState(() => target = v)),
          OutlinedButton(
              onPressed: source == null ||
                      target == null ||
                      source == target ||
                      edges.any(
                          (e) => e['source'] == source && e['target'] == target)
                  ? null
                  : () => update(nodes, [
                        ...edges,
                        {'source': source, 'target': target}
                      ]),
              child: const Text('Connect nodes')),
        ],
      ]);
}
