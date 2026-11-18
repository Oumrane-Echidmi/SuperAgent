import 'package:flutter/material.dart';
import '../account/workspace_scope.dart';
import 'components.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context);
    return WorkspacePage(
        title: 'Business profile',
        icon: Icons.settings_outlined,
        children: [
          Intro(session.tenant!['name'] as String,
              'Signed in as ${session.email} · ${session.tenant!['role'] == 'OWNER' ? 'Owner' : 'Staff'}',
              eyebrow: 'Workspace settings'),
          DataView(
              load: session.loadProfile,
              builder: (data, reload) =>
                  ProfileForm(key: ValueKey(data['updatedAt']), profile: data)),
        ]);
  }
}

class ProfileForm extends StatefulWidget {
  final Map<String, dynamic> profile;
  const ProfileForm({super.key, required this.profile});
  @override
  State<ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends State<ProfileForm> {
  final form = GlobalKey<FormState>();
  late final timezone =
      TextEditingController(text: widget.profile['timezone'] as String);
  late final description =
      TextEditingController(text: widget.profile['description'] as String);
  late String language = widget.profile['language'] as String;
  String? error, success;
  @override
  void dispose() {
    timezone.dispose();
    description.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    final session = WorkspaceScope.of(context);
    setState(() {
      error = null;
      success = null;
    });
    try {
      await session.saveProfile(
          language: language,
          timezone: timezone.text.trim(),
          description: description.text);
      if (mounted) setState(() => success = 'Business profile saved.');
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = WorkspaceScope.of(context),
        owner = session.tenant!['role'] == 'OWNER';
    final enabled = owner && !session.busy;
    return WorkspaceCard(
        child: Form(
            key: form,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                      initialValue: language,
                      decoration: fieldDecoration('Shop language'),
                      items: const [
                        DropdownMenuItem(value: 'fr', child: Text('Français')),
                        DropdownMenuItem(value: 'darija', child: Text('Darija'))
                      ],
                      onChanged: enabled
                          ? (v) => setState(() => language = v!)
                          : null),
                  const SizedBox(height: 20),
                  TextFormField(
                      controller: timezone,
                      enabled: enabled,
                      maxLength: 100,
                      decoration: fieldDecoration('Timezone',
                          hint: 'Africa/Casablanca'),
                      validator: (v) =>
                          v!.trim().isEmpty ? 'Enter an IANA timezone.' : null),
                  const SizedBox(height: 20),
                  TextFormField(
                      controller: description,
                      enabled: enabled,
                      minLines: 4,
                      maxLines: 8,
                      maxLength: 4000,
                      decoration: fieldDecoration('Business description')),
                  if (error != null) Notice(error!, error: true),
                  if (success != null) Notice(success!),
                  if (owner)
                    FilledButton(
                        onPressed: enabled ? save : null,
                        child: Text(
                            session.busy ? 'Saving…' : 'Save business profile'))
                  else
                    const Notice('Only an owner can change this profile.'),
                ])));
  }
}
