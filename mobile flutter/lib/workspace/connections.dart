import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../account/google_connection.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';

class ConnectionsScreen extends StatefulWidget {
  final Future<Map<String, dynamic>> Function(String) authorize;
  const ConnectionsScreen({super.key, this.authorize = authorizeGoogle});
  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  final sheet = TextEditingController();
  final form = GlobalKey<FormState>();
  Map<String, dynamic>? accounts, destinations, inspection, pendingDestination;
  String? selected, inspectedConnection, error, success;
  bool busy = false, loading = false;
  bool get owner => WorkspaceScope.of(context).tenant?['role'] == 'OWNER';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (owner) load();
    });
  }

  @override
  void dispose() {
    sheet.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final session = WorkspaceScope.of(context);
      final a = await session.request('connections/google');
      final d = await session.request('sheet-destinations');
      if (mounted)
        setState(() {
          accounts = a;
          destinations = d;
        });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> run(Future<void> Function() action, String message) async {
    if (busy || !owner) return;
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      await action();
      if (mounted) {
        setState(() => success = message);
        await load();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> connect() => run(() async {
        final session = WorkspaceScope.of(context);
        final result = await session
            .request('connections/google', method: 'POST', body: {});
        final callback = await widget.authorize(result['authorizationUrl']);
        if (!mounted) return;
        await session.request(
            'connections/google/${result['connection']['id']}/complete',
            method: 'POST',
            body: callback);
      }, 'Google account connected.');
  Future<void> inspect() async {
    if (!form.currentState!.validate()) return;
    final id = selected;
    if (id == null) return;
    await run(() async {
      final value = await WorkspaceScope.of(context).request(
          'connections/google/$id/spreadsheet-inspections',
          method: 'POST',
          body: {'spreadsheetId': spreadsheetIdFrom(sheet.text)});
      if (mounted) {
        setState(() {
          inspection = value;
          inspectedConnection = id;
          pendingDestination = null;
        });
      }
    }, 'Spreadsheet access checked. Choose a tab below.');
  }

  Future<void> choose(dynamic tab) => run(() async {
        pendingDestination ??= {
          'id': const Uuid().v4(),
          'connectionId': inspectedConnection,
          'spreadsheetId': inspection!['spreadsheetId'],
          'sheetId': tab['sheetId']
        };
        await WorkspaceScope.of(context).request('sheet-destinations',
            method: 'POST', body: pendingDestination);
        if (mounted) {
          setState(() {
            inspection = null;
            pendingDestination = null;
          });
        }
      }, 'Spreadsheet destination saved.');
  @override
  Widget build(BuildContext context) {
    final connected = (accounts?['data'] as List? ?? [])
        .where((a) => a['status'] == 'CONNECTED')
        .toList();
    if (!connected.any((a) => a['id'] == selected)) {
      selected = connected.firstOrNull?['id'];
    }
    return WorkspacePage(title: 'Connections', icon: Icons.link, children: [
      const Intro('Spreadsheet delivery',
          'Connect Google, then choose the spreadsheet tab that receives reviewed orders. SuperAgent only sees files you share with it.',
          eyebrow: 'Google Sheets'),
      if (!owner) const Notice('Only an owner can manage connections.'),
      if (owner) ...[
        if (loading) const LinearProgressIndicator(),
        if (error != null) Notice(error!, error: true),
        if (success != null) Notice(success!),
        if (accounts == null && !loading)
          OutlinedButton(
              onPressed: busy ? null : load, child: const Text('Try again')),
        WorkspaceCard(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              Text('Google accounts', style: SA.t(20, w: FontWeight.w600)),
              if (accounts != null && (accounts!['data'] as List).isEmpty)
                const Notice('No Google account connected.'),
              for (final a in accounts?['data'] ?? [])
                ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(a['status']),
                    subtitle: Text('${a['createdAt']}'),
                    trailing: a['status'] == 'CONNECTED'
                        ? TextButton(
                            onPressed: busy
                                ? null
                                : () => run(() async {
                                      await WorkspaceScope.of(context).request(
                                          'connections/google/${a['id']}',
                                          method: 'DELETE');
                                      if (mounted) {
                                        setState(() {
                                          inspection = null;
                                          pendingDestination = null;
                                        });
                                      }
                                    }, 'Google account disconnected.'),
                            child: const Text('Disconnect'))
                        : null),
              FilledButton(
                  onPressed: busy || loading ? null : connect,
                  child: Text(busy ? 'Working…' : 'Connect Google account')),
            ])),
        const SizedBox(height: 20),
        if (connected.isNotEmpty)
          WorkspaceCard(
              child: Form(
                  key: form,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Choose a spreadsheet',
                            style: SA.t(20, w: FontWeight.w600)),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                            key: ValueKey(selected),
                            initialValue: selected,
                            isExpanded: true,
                            decoration: fieldDecoration('Google account'),
                            items: [
                              for (final a in connected)
                                DropdownMenuItem(
                                    value: a['id'] as String,
                                    child: Text(
                                        '${a['connectedAt'] ?? a['createdAt']}'))
                            ],
                            onChanged: busy || pendingDestination != null
                                ? null
                                : (v) => setState(() {
                                      selected = v;
                                      inspection = null;
                                    })),
                        const SizedBox(height: 16),
                        TextFormField(
                            controller: sheet,
                            enabled: !busy && pendingDestination == null,
                            decoration:
                                fieldDecoration('Spreadsheet link or ID'),
                            validator: (v) => spreadsheetIdFrom(v ?? '') == null
                                ? 'Paste a Google Sheets link or ID.'
                                : null),
                        const SizedBox(height: 16),
                        OutlinedButton(
                            onPressed: busy || pendingDestination != null
                                ? null
                                : inspect,
                            child: const Text('Check access')),
                        if (inspection != null) ...[
                          Text(inspection!['title'],
                              style: SA.t(17, w: FontWeight.w600)),
                          for (final tab in inspection!['tabs'])
                            OutlinedButton(
                                onPressed: busy ||
                                        pendingDestination != null &&
                                            pendingDestination!['sheetId'] !=
                                                tab['sheetId']
                                    ? null
                                    : () => choose(tab),
                                child: Text(pendingDestination == null
                                    ? 'Use tab “${tab['title']}”'
                                    : 'Retry destination save'))
                        ],
                      ]))),
        const SizedBox(height: 20),
        if (destinations != null && (destinations!['data'] as List).isNotEmpty)
          WorkspaceCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                Text('Saved destinations', style: SA.t(20, w: FontWeight.w600)),
                for (final d in destinations!['data'])
                  ListTile(
                      contentPadding: EdgeInsets.zero,
                      title:
                          Text('${d['spreadsheetTitle']} / ${d['tabTitle']}'),
                      subtitle: Text(d['status'] == 'ACCESS_CHECKED'
                          ? 'Access checked'
                          : 'Connection unavailable'))
              ])),
      ],
    ]);
  }
}
