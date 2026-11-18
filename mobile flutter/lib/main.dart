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
import 'workspace/components.dart';

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
    if (route == '/orders/new') return const NewOrderScreen();
    if (route != null && RegExp(r'^/orders/[a-zA-Z0-9_-]+$').hasMatch(route)) {
      return OrderDetailsScreen(id: route.split('/').last);
    }
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
