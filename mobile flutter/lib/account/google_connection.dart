import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

String? spreadsheetIdFrom(String input) {
  final text = input.trim();
  final match =
      RegExp(r'/spreadsheets/d/([a-zA-Z0-9_-]{1,200})').firstMatch(text);
  return match?.group(1) ??
      (RegExp(r'^[a-zA-Z0-9_-]{1,200}$').hasMatch(text) ? text : null);
}

/// OAuth stays in the system browser; credential exchange stays on the backend.
Future<Map<String, dynamic>> authorizeGoogle(String authorizationUrl) async {
  final url = Uri.parse(authorizationUrl);
  final callback = Uri.parse(url.queryParameters['redirect_uri'] ?? '');
  final state = url.queryParameters['state'];
  if (url.scheme != 'https' ||
      url.host != 'accounts.google.com' ||
      url.userInfo.isNotEmpty ||
      state == null ||
      callback.host.isEmpty ||
      callback.userInfo.isNotEmpty ||
      callback.hasQuery ||
      callback.hasFragment ||
      !(callback.scheme == 'https' ||
          callback.scheme == 'http' &&
              ['localhost', '127.0.0.1'].contains(callback.host))) {
    throw StateError(
        'The service returned an invalid Google authorization URL.');
  }
  final result = await FlutterWebAuth2.authenticate(
      url: authorizationUrl,
      callbackUrlScheme: callback.scheme,
      options: FlutterWebAuth2Options(
          httpsHost: callback.host, httpsPath: callback.path));
  return googleCallbackParameters(result, callback, state);
}

Map<String, dynamic> googleCallbackParameters(
    String result, Uri expected, String state) {
  final callback = Uri.parse(result);
  if (callback.scheme != expected.scheme ||
      callback.host != expected.host ||
      callback.port != expected.port ||
      callback.path != expected.path ||
      callback.queryParameters['state'] != state) {
    throw StateError(
        'Google returned an invalid callback. Restart the connection.');
  }
  if (callback.queryParameters['error'] != null) {
    throw StateError('Google authorization was cancelled or denied.');
  }
  final code = callback.queryParameters['code'];
  if (code == null || code.isEmpty) {
    throw StateError('Google did not return an authorization code.');
  }
  return {'state': state, 'code': code};
}
