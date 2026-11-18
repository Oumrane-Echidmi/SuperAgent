import 'package:flutter/material.dart';
import '../theme.dart';

class WorkspaceCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const WorkspaceCard({super.key, required this.child, this.onTap});
  @override
  Widget build(BuildContext context) {
    final content = Padding(padding: const EdgeInsets.all(22), child: child);
    return Material(
        color: SA.sidebar,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: SA.border)),
        child: onTap == null
            ? Semantics(
                container: true, explicitChildNodes: true, child: content)
            : InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(14),
                child: content));
  }
}

class WorkspacePage extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> children;
  final List<Widget> actions;
  const WorkspacePage(
      {super.key,
      required this.title,
      required this.icon,
      required this.children,
      this.actions = const []});
  @override
  Widget build(BuildContext context) => SAPage(
      title: title,
      icon: icon,
      actions: actions,
      body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1040),
              child: ListView(
                  padding: const EdgeInsets.all(20), children: children))));
}

class Intro extends StatelessWidget {
  final String title, subtitle;
  final String? eyebrow;
  const Intro(this.title, this.subtitle, {super.key, this.eyebrow});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (eyebrow != null)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(eyebrow!.toUpperCase(),
                  style: SA.t(10, c: SA.muted, w: FontWeight.w600))),
        Text(title, style: SA.t(30, w: FontWeight.w600, h: 1.2)),
        const SizedBox(height: 12),
        Text(subtitle, style: SA.t(14, c: SA.muted, h: 1.65)),
      ]));
}

class Notice extends StatelessWidget {
  final String message;
  final bool error;
  const Notice(this.message, {super.key, this.error = false});
  @override
  Widget build(BuildContext context) => Semantics(
      liveRegion: true,
      child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(message,
              style: SA.t(13, c: error ? SA.red : SA.muted, h: 1.5))));
}

class DataView extends StatefulWidget {
  final Future<Map<String, dynamic>> Function() load;
  final Widget Function(Map<String, dynamic>, VoidCallback) builder;
  const DataView({super.key, required this.load, required this.builder});
  @override
  State<DataView> createState() => _DataViewState();
}

class _DataViewState extends State<DataView> {
  late Future<Map<String, dynamic>> future;
  @override
  void initState() {
    super.initState();
    future = Future.microtask(widget.load);
  }

  void reload() => setState(() => future = Future.microtask(widget.load));
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Column(children: [
                LinearProgressIndicator(),
                SizedBox(height: 12),
                Text('Loading workspace…'),
              ]));
        }
        if (snapshot.hasError) {
          return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Notice(snapshot.error.toString(), error: true),
                OutlinedButton(
                    onPressed: reload, child: const Text('Try again')),
              ]);
        }
        return widget.builder(snapshot.data!, reload);
      });
}

InputDecoration fieldDecoration(String label, {String? hint}) =>
    InputDecoration(
      labelText: label,
      hintText: hint,
      filled: true,
      fillColor: SA.sidebar,
      counterText: '',
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SA.border)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SA.border)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SA.muted)),
      contentPadding: const EdgeInsets.all(14),
      alignLabelWithHint: true,
    );

class SummaryRow extends StatelessWidget {
  final String label;
  final Object? value;
  const SummaryRow(this.label, this.value, {super.key});
  @override
  Widget build(BuildContext context) => Semantics(
      container: true,
      child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: SA.t(11, c: SA.muted)),
            const SizedBox(height: 4),
            SelectionArea(
                child: Text(value?.toString() ?? 'Not collected',
                    style: SA.t(14))),
          ])));
}
