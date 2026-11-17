import 'package:flutter/material.dart';
import '../theme.dart';

/// Home — port of index.html (greeting, composer, suggested steps, Widgets: Todo, Needs to know).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final todos = <String>['Fix mobile onboarding drop-off', 'Ship the activation-lift experiment', 'Review Q4 pricing deck'];
  final done = <int>{};
  final ctl = TextEditingController();
  final msg = TextEditingController();

  static const steps = ['What in my inbox needs attention?', 'Draft replies to anything waiting', 'Which features are people using?'];
  static const needs = [
    ('KH', 'Karen Holt', 'Status on PO-48291 — gasket kit for Line 3', '8 min ago', SA.red),
    ('PR', 'Priya Raman', 'Re: SuperAgent pricing for 40 seats', '14 min ago', SA.blue),
  ];

  @override
  Widget build(BuildContext context) {
    return SAPage(
      title: 'Home',
      icon: Icons.grid_view_rounded,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          const SizedBox(height: 56),
          Center(child: Text('Good evening, Nim', style: SA.t(22, w: FontWeight.w500))),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.fromLTRB(18, 14, 12, 10),
            decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(28)),
            child: Column(children: [
              TextField(
                controller: msg,
                minLines: 1,
                maxLines: 4,
                style: SA.t(14),
                decoration: InputDecoration(
                    border: InputBorder.none, isDense: true, hintText: 'Message Assistant…', hintStyle: SA.t(14, c: SA.muted)),
              ),
              const SizedBox(height: 18),
              Row(children: [
                const Icon(Icons.add, size: 18, color: SA.muted),
                const SizedBox(width: 12),
                Container(width: 10, height: 10, decoration: const BoxDecoration(color: SA.pink, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text('Assistant', style: SA.t(13, c: SA.muted)),
                const Spacer(),
                Text('GPT-6 Luna', style: SA.t(12, w: FontWeight.w600)),
                const Icon(Icons.keyboard_arrow_down, size: 14, color: SA.muted),
                const SizedBox(width: 8),
                Text('Auto', style: SA.t(12, w: FontWeight.w600)),
                const SizedBox(width: 8),
                const Icon(Icons.mic_none, size: 16),
                const SizedBox(width: 8),
                Container(
                    width: 26,
                    height: 26,
                    decoration: const BoxDecoration(color: SA.muted, shape: BoxShape.circle),
                    child: const Icon(Icons.arrow_upward, size: 15, color: SA.bg)),
              ]),
            ]),
          ),
          const SizedBox(height: 22),
          Text('Suggested next steps', style: SA.t(12, c: SA.fg, w: FontWeight.w500)),
          const SizedBox(height: 6),
          for (final s in steps)
            InkWell(
              onTap: () => msg.text = s,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  Expanded(child: Text(s, style: SA.t(14, c: SA.muted))),
                  const Icon(Icons.north_east, size: 12, color: SA.muted),
                ]),
              ),
            ),
          const SizedBox(height: 36),
          Text('Widgets', style: SA.t(12, c: SA.muted, w: FontWeight.w500)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: Text('Todo', style: SA.t(14, w: FontWeight.w600))),
            const Icon(Icons.north_east, size: 12, color: SA.muted),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(color: SA.card, borderRadius: BorderRadius.circular(99)),
                child: TextField(
                  controller: ctl,
                  style: SA.t(13),
                  onSubmitted: _add,
                  decoration: InputDecoration(
                      border: InputBorder.none, hintText: 'Capture a todo…', hintStyle: SA.t(13, c: SA.muted), isCollapsed: false),
                ),
              ),
            ),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: () => _add(ctl.text),
              child: Container(
                  width: 26,
                  height: 26,
                  decoration: const BoxDecoration(color: SA.muted, shape: BoxShape.circle),
                  child: const Icon(Icons.add, size: 16, color: SA.card)),
            ),
          ]),
          const SizedBox(height: 10),
          for (var i = 0; i < todos.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SACard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
                color: SA.card,
                onTap: () => setState(() => done.contains(i) ? done.remove(i) : done.add(i)),
                child: Row(children: [
                  Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                        color: done.contains(i) ? SA.green : const Color(0xFF3B3633), borderRadius: BorderRadius.circular(5)),
                    child: done.contains(i) ? const Icon(Icons.check, size: 14, color: SA.bg) : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text(todos[i],
                          style: SA.t(13, w: FontWeight.w500, c: done.contains(i) ? SA.muted : SA.fg).copyWith(
                              decoration: done.contains(i) ? TextDecoration.lineThrough : null))),
                ]),
              ),
            ),
          const SizedBox(height: 22),
          Row(children: [
            Expanded(child: Text('Needs to know', style: SA.t(14, w: FontWeight.w600))),
            const Icon(Icons.north_east, size: 12, color: SA.muted),
          ]),
          const SizedBox(height: 10),
          for (final n in needs)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Avatar(n.$1, color: n.$5, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(n.$2, style: SA.t(13, w: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(n.$3, style: SA.t(13, c: SA.muted)),
                  ]),
                ),
                const SizedBox(width: 8),
                Row(children: [
                  const Icon(Icons.flag, size: 11, color: SA.red),
                  const SizedBox(width: 4),
                  Text(n.$4, style: SA.t(11, c: SA.muted)),
                ]),
              ]),
            ),
        ],
      ),
    );
  }

  void _add(String v) {
    if (v.trim().isEmpty) return;
    setState(() => todos.insert(0, v.trim()));
    ctl.clear();
  }
}
