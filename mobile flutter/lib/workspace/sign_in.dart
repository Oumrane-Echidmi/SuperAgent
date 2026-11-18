import 'package:flutter/material.dart';
import '../account/workspace_scope.dart';
import '../theme.dart';
import 'components.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      business = TextEditingController();
  bool register = false, showPassword = false;
  String? error;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    business.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    final session = WorkspaceScope.of(context);
    setState(() => error = null);
    try {
      await session.authenticate(email.text, password.text,
          businessName: register ? business.text : null);
      password.clear();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: AutofillGroup(
                            child: Form(
                                key: form,
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Row(children: [
                                        Container(
                                            padding: const EdgeInsets.all(9),
                                            decoration: BoxDecoration(
                                                color: SA.card,
                                                borderRadius:
                                                    BorderRadius.circular(8)),
                                            child: const Icon(
                                                Icons.folder_outlined,
                                                size: 20)),
                                        const SizedBox(width: 10),
                                        Text('SuperAgent',
                                            style: SA.t(20, w: FontWeight.w600))
                                      ]),
                                      const SizedBox(height: 40),
                                      Intro(
                                          register
                                              ? 'A workspace for your shop.'
                                              : 'Welcome back.',
                                          register
                                              ? 'Create your business profile and start recording customer orders.'
                                              : 'Sign in to see your orders and business activity.',
                                          eyebrow: 'Your business workspace'),
                                      if (session.notice != null)
                                        Notice(session.notice!),
                                      if (register) ...[
                                        TextFormField(
                                            controller: business,
                                            enabled: !session.busy,
                                            maxLength: 120,
                                            autofillHints: const [
                                              AutofillHints.organizationName
                                            ],
                                            decoration: fieldDecoration(
                                                'Business name'),
                                            validator: (v) => v!.trim().isEmpty
                                                ? 'Enter your business name.'
                                                : null),
                                        const SizedBox(height: 16)
                                      ],
                                      TextFormField(
                                          key: const Key('email'),
                                          controller: email,
                                          enabled: !session.busy,
                                          maxLength: 254,
                                          keyboardType:
                                              TextInputType.emailAddress,
                                          autofillHints: const [
                                            AutofillHints.username
                                          ],
                                          decoration: fieldDecoration('Email'),
                                          validator: (v) =>
                                              RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                                      .hasMatch(v!.trim())
                                                  ? null
                                                  : 'Enter a valid email.'),
                                      const SizedBox(height: 16),
                                      TextFormField(
                                          key: const Key('password'),
                                          controller: password,
                                          enabled: !session.busy,
                                          obscureText: !showPassword,
                                          maxLength: 128,
                                          enableSuggestions: false,
                                          autocorrect: false,
                                          autofillHints: [
                                            register
                                                ? AutofillHints.newPassword
                                                : AutofillHints.password
                                          ],
                                          decoration: fieldDecoration(
                                                  'Password')
                                              .copyWith(
                                                  suffixIcon: IconButton(
                                                      tooltip: showPassword
                                                          ? 'Hide password'
                                                          : 'Show password',
                                                      onPressed: () => setState(
                                                          () => showPassword =
                                                              !showPassword),
                                                      icon: Icon(showPassword
                                                          ? Icons
                                                              .visibility_off_outlined
                                                          : Icons
                                                              .visibility_outlined))),
                                          validator: (v) => v!.length < 12
                                              ? 'Use at least 12 characters.'
                                              : null,
                                          onFieldSubmitted: (_) {
                                            if (!session.busy) submit();
                                          }),
                                      if (error != null)
                                        Notice(error!, error: true),
                                      const SizedBox(height: 20),
                                      FilledButton(
                                          key: const Key('authenticate'),
                                          onPressed:
                                              session.busy ? null : submit,
                                          child: Padding(
                                              padding: const EdgeInsets.all(12),
                                              child: Text(session.busy
                                                  ? 'Please wait…'
                                                  : register
                                                      ? 'Create workspace'
                                                      : 'Sign in'))),
                                      const SizedBox(height: 8),
                                      TextButton(
                                          onPressed: session.busy
                                              ? null
                                              : () => setState(() {
                                                    register = !register;
                                                    error = null;
                                                  }),
                                          child: Text(register
                                              ? 'Already have an account? Sign in'
                                              : 'New here? Create a workspace')),
                                      const Notice(
                                          'Your session stays in memory. Restarting or refreshing requires signing in again.'),
                                    ]))))))));
  }
}
