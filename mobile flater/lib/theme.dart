import 'package:flutter/material.dart';

/// Tokens derived from assets/styles-*.css (dark theme, Tailwind "stone" oklch values).
class SA {
  static const bg = Color(0xFF0C0A09); // --background 14.7%
  static const sidebar = Color(0xFF1C1917); // --sidebar 21.6%
  static const card = Color(0xFF292524); // --accent/--secondary 26.8%
  static const fg = Color(0xFFFAFAF9); // --foreground 98.5%
  static const muted = Color(0xFFA8A29E); // --muted-foreground 70.9%
  static const border = Color(0x1AFFFFFF); // white 10%
  static const primary = Color(0xFFE7E5E4); // --primary 92.3%
  static const red = Color(0xFFF87171);
  static const green = Color(0xFF4ADE80);
  static const amber = Color(0xFFFBBF24);
  static const blue = Color(0xFF38BDF8);
  static const pink = Color(0xFFEC4899);
  static const radius = 10.0; // --radius .625rem
  static const fontSans = 'Satoshi';
  static const fontMono = 'IBMPlexMono';

  static TextStyle t(double size, {FontWeight w = FontWeight.w400, Color? c, double? h, String? f}) =>
      TextStyle(fontFamily: f, fontSize: size, fontWeight: w, color: c ?? fg, height: h);

  static ThemeData theme() => ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: bg,
        canvasColor: sidebar,
        fontFamily: fontSans,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        colorScheme: const ColorScheme.dark(primary: primary, surface: bg, onSurface: fg),
        dividerColor: border,
        useMaterial3: true,
      );
}

/// Page shell: top bar with menu (opens the sidebar-derived drawer), icon + title.
class SAPage extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> actions;
  final Widget body;
  const SAPage({super.key, required this.title, required this.icon, required this.body, this.actions = const []});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: SA.bg,
        drawer: const AppDrawer(),
        body: SafeArea(
          child: Column(children: [
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(children: [
                Builder(
                    builder: (c) => IconButton(
                        tooltip: 'Menu',
                        onPressed: () => Scaffold.of(c).openDrawer(),
                        icon: const Icon(Icons.menu, size: 20, color: SA.muted))),
                Icon(icon, size: 15, color: SA.fg),
                const SizedBox(width: 8),
                Expanded(child: Text(title, style: SA.t(14, w: FontWeight.w600))),
                ...actions,
              ]),
            ),
            Expanded(child: body),
          ]),
        ),
      );
}

class SACard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final VoidCallback? onTap;
  const SACard({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.color, this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: color ?? SA.card,
        borderRadius: BorderRadius.circular(SA.radius + 4),
        child: InkWell(
          borderRadius: BorderRadius.circular(SA.radius + 4),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      );
}

class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final bool outlined;
  const Pill(this.text, {super.key, this.color = SA.muted, this.outlined = false});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: outlined ? null : color.withValues(alpha: .15),
          border: outlined ? Border.all(color: SA.border) : null,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(text, style: SA.t(11, w: FontWeight.w600, c: color)),
      );
}

class Avatar extends StatelessWidget {
  final String initials;
  final Color color;
  final double size;
  const Avatar(this.initials, {super.key, this.color = SA.pink, this.size = 32});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color.withValues(alpha: .22), shape: BoxShape.circle),
        child: Text(initials, style: SA.t(size * .36, w: FontWeight.w700, c: color)),
      );
}

class SectionLabel extends StatelessWidget {
  final String text;
  const SectionLabel(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 8), child: Text(text, style: SA.t(12, c: SA.muted, w: FontWeight.w500)));
}

class TabStrip extends StatefulWidget {
  final List<String> tabs;
  final ValueChanged<int>? onChanged;
  const TabStrip(this.tabs, {super.key, this.onChanged});
  @override
  State<TabStrip> createState() => _TabStripState();
}

class _TabStripState extends State<TabStrip> {
  int i = 0;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 40,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: widget.tabs.length,
          separatorBuilder: (_, __) => const SizedBox(width: 4),
          itemBuilder: (_, k) => GestureDetector(
            onTap: () {
              setState(() => i = k);
              widget.onChanged?.call(k);
            },
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(color: i == k ? SA.card : null, borderRadius: BorderRadius.circular(99)),
              child: Text(widget.tabs[k], style: SA.t(13, w: FontWeight.w500, c: i == k ? SA.fg : SA.muted)),
            ),
          ),
        ),
      );
}

class NavItem {
  final String label, route;
  final IconData icon;
  final String? badge;
  const NavItem(this.label, this.route, this.icon, [this.badge]);
}

const mainNav = [NavItem('Home', '/', Icons.grid_view_rounded)];
const nav1 = [
  NavItem('Chat', '/chat', Icons.chat_bubble_outline),
  NavItem('Inbox', '/inbox', Icons.inbox_outlined),
  NavItem('Board', '/board', Icons.view_kanban_outlined),
];
const nav2 = [
  NavItem('Agents', '/agents', Icons.person_outline),
  NavItem('Docs', '/docs', Icons.content_copy_outlined),
  NavItem('Company Brain', '/brain', Icons.psychology_outlined, 'Enterprise'),
  NavItem('Workflows', '/workflows', Icons.alt_route, 'Beta'),
];
const navLabs = [NavItem('Canvas', '/canvas', Icons.palette_outlined, 'Beta')];
const navCod = [
  NavItem('COD Dashboard', '/cod', Icons.bar_chart_rounded),
  NavItem('Builder', '/cod/builder', Icons.auto_awesome_outlined),
  NavItem('Review & Publish', '/cod/review', Icons.rocket_launch_outlined),
  NavItem('Connections', '/cod/connections', Icons.power_outlined),
  NavItem('WhatsApp Inbox', '/cod/inbox', Icons.forum_outlined),
];

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});
  @override
  Widget build(BuildContext context) {
    final cur = ModalRoute.of(context)?.settings.name ?? '/';
    Widget item(NavItem n) {
      final on = n.route == cur;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        child: Material(
          color: on ? SA.card : Colors.transparent,
          borderRadius: BorderRadius.circular(99),
          child: InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: () {
              Navigator.pop(context);
              if (!on) Navigator.pushReplacementNamed(context, n.route);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              child: Row(children: [
                Icon(n.icon, size: 16, color: on ? SA.fg : SA.muted),
                const SizedBox(width: 10),
                Expanded(
                    child: Text(n.label,
                        style: SA.t(14, w: on ? FontWeight.w600 : FontWeight.w400, c: on ? SA.fg : SA.muted))),
                if (n.badge != null) Text(n.badge!, style: SA.t(11, w: FontWeight.w700)),
              ]),
            ),
          ),
        ),
      );
    }

    return Drawer(
      backgroundColor: SA.sidebar,
      width: 280,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 16, 12),
            child: Row(children: [
              const Icon(Icons.folder_open, size: 18, color: SA.muted),
              const SizedBox(width: 10),
              Text('SuperAgent', style: SA.t(15, w: FontWeight.w700)),
            ]),
          ),
          Expanded(
            child: ListView(padding: EdgeInsets.zero, children: [
              ...mainNav.map(item),
              const SizedBox(height: 14),
              ...nav1.map(item),
              const SizedBox(height: 14),
              ...nav2.map(item),
              Padding(padding: const EdgeInsets.fromLTRB(20, 18, 16, 6), child: Text('Labs', style: SA.t(11, w: FontWeight.w700))),
              ...navLabs.map(item),
              Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 16, 6),
                  child: Text('COD Phase 1 (new)', style: SA.t(11, w: FontWeight.w700))),
              ...navCod.map(item),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 16, 16),
            child: Row(children: [
              Container(width: 20, height: 20, decoration: const BoxDecoration(shape: BoxShape.circle, color: SA.blue)),
              const SizedBox(width: 10),
              Text('Nim', style: SA.t(14, w: FontWeight.w700)),
              const Spacer(),
              const Icon(Icons.unfold_more, size: 16, color: SA.muted),
            ]),
          ),
        ]),
      ),
    );
  }
}
