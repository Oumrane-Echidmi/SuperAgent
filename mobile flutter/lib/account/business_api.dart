import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  const ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

/// JSON transport for the existing API. No persistence or automatic retries.
class BusinessApi {
  final Uri baseUrl;
  final http.Client _client;
  final Duration timeout;

  BusinessApi(this.baseUrl,
      {http.Client? client, this.timeout = const Duration(seconds: 20)})
      : _client = client ?? http.Client() {
    final loopback = ['localhost', '127.0.0.1', '::1'].contains(baseUrl.host);
    if (!(baseUrl.scheme == 'https' ||
            (baseUrl.scheme == 'http' && loopback)) ||
        baseUrl.host.isEmpty ||
        baseUrl.userInfo.isNotEmpty ||
        baseUrl.hasQuery ||
        baseUrl.hasFragment ||
        !baseUrl.path.endsWith('/')) {
      throw ArgumentError(
          'Use an HTTPS API base URL ending in / (HTTP is allowed on loopback).');
    }
  }

  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? token,
    Map<String, String>? query,
    void Function()? onUnauthorized,
  }) async {
    // Only internally constructed path segments, never absolute or encoded URLs.
    if (!RegExp(r'^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$').hasMatch(path)) {
      throw ArgumentError('Use a relative API resource path.');
    }
    final abort = Completer<void>();
    final timer = Timer(timeout, abort.complete);
    final request = http.AbortableRequest(
        method, baseUrl.resolve(path).replace(queryParameters: query),
        abortTrigger: abort.future)
      ..followRedirects = false
      ..headers['Accept'] = 'application/json';
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }
    try {
      final response = await _client.send(request);
      // Expiry must clear the session even if a proxy replaces the error body.
      if (response.statusCode == 401 && token != null) onUnauthorized?.call();
      final bytes = <int>[];
      await for (final chunk in response.stream) {
        if (bytes.length + chunk.length > 1024 * 1024) {
          if (!abort.isCompleted) abort.complete();
          throw const ApiException(503, 'INVALID_RESPONSE',
              'The service returned an invalid response.');
        }
        bytes.addAll(chunk);
      }
      Map<String, dynamic> value;
      try {
        if (response.headers['content-type']?.split(';').first.trim() !=
            'application/json') {
          throw const FormatException();
        }
        value = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      } catch (_) {
        throw const ApiException(503, 'INVALID_RESPONSE',
            'The service returned an invalid response.');
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = value['error'];
        final code = error is Map && error['code'] is String
            ? error['code'] as String
            : 'REQUEST_FAILED';
        final message = switch (response.statusCode) {
          401 => token == null
              ? 'Email or password is incorrect.'
              : 'Your session expired. Please sign in again.',
          403 => 'Only an owner can change this profile.',
          404 => 'This business is no longer available.',
          409 => code == 'REGISTRATION_UNAVAILABLE'
              ? 'Registration could not be completed. Try signing in.'
              : 'This record changed or the action is unavailable. Refresh and review before trying again.',
          422 => 'Check the request fields and required order details.',
          429 => 'Too many attempts. Please wait before trying again.',
          _ => 'The service is unavailable. Please try again.',
        };
        throw ApiException(response.statusCode, code, message);
      }
      return value;
    } on http.ClientException {
      throw const ApiException(0, 'NETWORK_ERROR',
          'Connection lost or timed out. Please try again.');
    } finally {
      timer.cancel();
    }
  }

  void close() => _client.close();
}
