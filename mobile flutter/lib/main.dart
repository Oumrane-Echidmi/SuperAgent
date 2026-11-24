import 'screens/canvas.dart' as preview_canvas;
import 'screens/board.dart' as preview_board;
import 'screens/workflows.dart' as preview_workflows;
import 'screens/brain.dart' as preview_brain;
import 'screens/docs.dart' as preview_docs;
import 'screens/agents.dart' as preview_agents;
import 'screens/inbox.dart' as preview_inbox;
import 'screens/chat.dart' as preview_chat;
import 'screens/home.dart' as preview_home;
import 'package:flutter/material.dart';
import 'account/api_config.dart';
import 'account/business_session.dart';
import 'account/workspace_scope.dart';
import 'theme.dart';
import 'workspace/sign_in.dart';
import 'workspace/home.dart';
import 'workspace/orders.dart';
import 'workspace/new_order.dart';
import 'workspace/order_details.dart';
import 'workspace/profile.dart';
import 'workspace/records.dart';
import 'workspace/inbox.dart';
import 'workspace/assistant.dart';
import 'workspace/whatsapp.dart';
import 'workspace/components.dart';
import 'workspace/builder.dart';
import 'workspace/connections.dart';

void main() => runApp(const SuperAgentApp());

class SuperAgentApp extends StatefulWidget {
  final BusinessSession? session;
  const SuperAgentApp({super.key, this.session});
  @override
  State<SuperAgentApp> createState() => _SuperAgentAppState();
}

class _SuperAgentAppState extends State<SuperAgentApp> {
  late final session =
      widget.session ?? BusinessSession(BusinessApi(configuredApiUrl()));
  @override
  void dispose() {
    if (widget.session == null) session.dispose();
    super.dispose();
  }

  Widget page(String? route) {
    if (!session.signedIn) return const SignInScreen();
    if (session.tenant == null) return const NoBusinessScreen();
    final previews = <String, Widget>{
      '/preview/home': const preview_home.HomeScreen(),
      '/preview/chat': const preview_chat.ChatScreen(),
      '/preview/inbox': const preview_inbox.InboxScreen(),
      '/preview/agents': const preview_agents.AgentsScreen(),
      '/preview/docs': const preview_docs.DocsScreen(),
      '/preview/brain': const preview_brain.BrainScreen(),
      '/preview/workflows': const preview_workflows.WorkflowsScreen(),
      '/preview/board': const preview_board.BoardScreen(),
      '/canvas': const preview_canvas.CanvasScreen(),
    };
    if (previews.containsKey(route)) {
      return Material(
          child: SafeArea(
              child: Column(children: [
        Container(
            width: double.infinity,
            color: SA.card,
            padding: const EdgeInsets.all(12),
            child: const Text(
                'Example screen · This content is a preview. Changes here are not saved to your business.')),
        Expanded(child: previews[route]!),
      ])));
    }
    if (route == '/orders/new') return const NewOrderScreen();
    if (route != null && RegExp(r'^/orders/[a-zA-Z0-9_-]+$').hasMatch(route)) {
      return OrderDetailsScreen(id: route.split('/').last);
    }
    if (route == '/whatsapp') return const WhatsAppScreen();
    if (route == '/connections') return const ConnectionsScreen();
    if (route == '/builder') return const BuilderScreen();
    if (route == '/chat') return const AssistantScreen();
    if (route == '/inbox') return const ConnectedInboxScreen();
    if (route != null && RegExp(r'^/inbox/[a-zA-Z0-9_-]+$').hasMatch(route)) {
      return ConversationScreen(id: route.split('/').last);
    }
    const kinds = {
      '/workflows': 'workflow',
      '/docs': 'document',
      '/brain': 'knowledge',
      '/agents': 'agent'
    };
    if (kinds.containsKey(route)) return RecordsScreen(kind: kinds[route]!);
    if (route == '/board') return const OrdersScreen();
    if (route == '/settings') return const ProfileScreen();
    return const LiveHomeScreen();
  }

  @override
  Widget build(BuildContext context) => WorkspaceScope(
      session: session,
      child: AnimatedBuilder(
          animation: session,
          builder: (context, _) => MaterialApp(
                key: ValueKey(
                    '${session.signedIn}-${session.email}-${session.tenant?['id']}'),
                title: 'SuperAgent',
                debugShowCheckedModeBanner: false,
                theme: SA.theme(),
                initialRoute: '/',
                onGenerateRoute: (settings) => MaterialPageRoute(
                    settings: settings, builder: (_) => page(settings.name)),
              )));
}

class NoBusinessScreen extends StatefulWidget {
  const NoBusinessScreen({super.key});
  @override
  State<NoBusinessScreen> createState() => _NoBusinessScreenState();
}

class _NoBusinessScreenState extends State<NoBusinessScreen> {
  String? error;
  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('No business workspace is available.'),
                      if (error != null) Notice(error!, error: true),
                      TextButton(
                          onPressed: session.busy
                              ? null
                              : () async {
                                  try {
                                    await session.signOut();
                                  } catch (e) {
                                    if (mounted) {
                                      setState(() => error = e.toString());
                                    }
                                  }
                                },
                          child: const Text('Sign out')),
                    ])))));
  }
}
