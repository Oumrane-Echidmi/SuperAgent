import 'package:flutter/material.dart';
import 'theme.dart';
import 'screens/home.dart';
import 'screens/chat.dart';
import 'screens/inbox.dart';
import 'screens/board.dart';
import 'screens/agents.dart';
import 'screens/docs.dart';
import 'screens/brain.dart';
import 'screens/workflows.dart';
import 'screens/canvas.dart';
import 'cod/cod_dashboard.dart';
import 'cod/cod_builder.dart';
import 'cod/cod_review.dart';
import 'cod/cod_connections.dart';
import 'cod/cod_inbox.dart';

void main() => runApp(const SuperAgentApp());

class SuperAgentApp extends StatelessWidget {
  const SuperAgentApp({super.key});

  static final Map<String, Widget Function()> routes = {
    '/': () => const HomeScreen(),
    '/chat': () => const ChatScreen(),
    '/inbox': () => const InboxScreen(),
    '/board': () => const BoardScreen(),
    '/agents': () => const AgentsScreen(),
    '/docs': () => const DocsScreen(),
    '/brain': () => const BrainScreen(),
    '/workflows': () => const WorkflowsScreen(),
    '/canvas': () => const CanvasScreen(),
    '/cod': () => const CodDashboard(),
    '/cod/builder': () => const CodBuilder(),
    '/cod/review': () => const CodReview(),
    '/cod/connections': () => const CodConnections(),
    '/cod/inbox': () => const CodInbox(),
  };

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SuperAgent',
        debugShowCheckedModeBanner: false,
        theme: SA.theme(),
        initialRoute: '/',
        onGenerateRoute: (s) {
          final b = routes[s.name] ?? routes['/']!;
          return PageRouteBuilder(
            settings: s,
            pageBuilder: (_, __, ___) => b(),
            transitionDuration: const Duration(milliseconds: 180),
            transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
          );
        },
      );
}
