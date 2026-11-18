import 'package:flutter/widgets.dart';
import 'business_session.dart';

class WorkspaceScope extends InheritedNotifier<BusinessSession> {
  const WorkspaceScope(
      {super.key, required BusinessSession session, required super.child})
      : super(notifier: session);
  static BusinessSession of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<WorkspaceScope>()!.notifier!;
}
