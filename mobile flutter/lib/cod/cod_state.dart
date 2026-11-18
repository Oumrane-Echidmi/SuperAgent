import 'package:flutter/foundation.dart';

/// Tiny demo-only shared state (not live).
class CodState {
  CodState._();
  static final CodState i = CodState._();
  final ValueNotifier<bool> whatsappConnected = ValueNotifier(true);
  final ValueNotifier<bool> sheetsConnected = ValueNotifier(true);
  final ValueNotifier<bool> approved = ValueNotifier(false);
  final ValueNotifier<int> revision = ValueNotifier(1);
}
