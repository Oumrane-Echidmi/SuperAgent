import 'package:flutter/foundation.dart';

Uri configuredApiUrl() {
  const configured = String.fromEnvironment('SUPERAGENT_API_URL');
  if (configured.isNotEmpty) return Uri.parse(configured);
  return kIsWeb
      ? Uri.base.resolve('/v1/')
      : Uri.parse('http://127.0.0.1:3000/v1/');
}
