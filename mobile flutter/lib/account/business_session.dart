import 'dart:async';

import 'package:flutter/foundation.dart';
import 'business_api.dart';
export 'business_api.dart';

/// Memory-only account state. The backend remains the authorization boundary.
class BusinessSession extends ChangeNotifier {
  final BusinessApi _api;
  String? _token;
  String? _email;
  String? _notice;
  List<Map<String, dynamic>> _tenants = const [];
  String? _tenantId;
  Timer? _expiry;
  bool _disposed = false;
  bool _busy = false;

  BusinessSession(this._api);

  bool get signedIn => _token != null;
  bool get busy => _busy;
  String? get email => _email;
  String? get notice => _notice;
  List<Map<String, dynamic>> get tenants => _tenants;
  Map<String, dynamic>? get tenant =>
      _tenants.where((t) => t['id'] == _tenantId).firstOrNull;

  Future<T> _run<T>(Future<T> Function() action) async {
    if (_disposed || busy) {
      throw StateError('Please wait for the current action to finish.');
    }
    _busy = true;
    notifyListeners();
    try {
      return await action();
    } finally {
      _busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> authenticate(String email, String password,
          {String? businessName}) =>
      _run(() async {
        if (signedIn) throw StateError('Sign out before switching accounts.');
        final result = await _api.request(
          businessName == null ? 'auth/sessions' : 'auth/registrations',
          method: 'POST',
          body: {
            'email': email.trim(),
            'password': password,
            if (businessName != null) 'businessName': businessName.trim()
          },
        );
        try {
          final token = result['token'] as String;
          final expires = DateTime.parse(result['expiresAt'] as String);
          final identity = await _api.request('me', token: token);
          final userEmail = (identity['user'] as Map)['email'] as String;
          final memberships = (identity['tenants'] as List).map((value) {
            final t = value as Map;
            if (t['id'] is! String ||
                t['name'] is! String ||
                !['OWNER', 'STAFF'].contains(t['role'])) {
              throw const FormatException();
            }
            return Map<String, dynamic>.unmodifiable(
                {'id': t['id'], 'name': t['name'], 'role': t['role']});
          }).toList(growable: false);
          final remaining = expires.difference(DateTime.now());
          if (token.isEmpty || remaining <= Duration.zero) {
            throw const FormatException();
          }
          if (_disposed) return;
          _token = token;
          _email = userEmail;
          _tenants = List.unmodifiable(memberships);
          _tenantId = memberships.firstOrNull?['id'] as String?;
          _notice = null;
          _expiry = Timer(remaining, () {
            _clear(expired: true);
            if (!_disposed) notifyListeners();
          });
        } on ApiException {
          rethrow;
        } catch (_) {
          throw const ApiException(503, 'INVALID_RESPONSE',
              'The service returned an invalid account response.');
        }
      });

  void selectTenant(String id) {
    if (_disposed || busy) {
      throw StateError('Please wait for the current action to finish.');
    }
    if (!_tenants.any((t) => t['id'] == id)) {
      throw ArgumentError('Select one of your businesses.');
    }
    _tenantId = id;
    notifyListeners();
  }

  Future<Map<String, dynamic>> _authorized(String path,
      {String method = 'GET',
      Map<String, dynamic>? body,
      Map<String, String>? query}) async {
    final token = _token;
    if (token == null) throw StateError('Please sign in.');
    final result = await _api.request(
      path,
      method: method,
      body: body,
      query: query,
      token: token,
      onUnauthorized: () {
        if (_token == token && !_disposed) _clear(expired: true);
      },
    );
    if (_disposed || _token != token) {
      throw StateError('Your session changed. Please sign in again.');
    }
    return result;
  }

  String get _profilePath {
    if (tenant == null) throw StateError('Select a business first.');
    return 'tenants/$_tenantId/profile';
  }

  Future<Map<String, dynamic>> loadProfile() =>
      _run(() => _authorized(_profilePath));

  /// Scopes every workspace operation to the currently selected membership.
  Future<Map<String, dynamic>> request(String resource,
          {String method = 'GET',
          Map<String, dynamic>? body,
          Map<String, String>? query}) =>
      _run(() {
        if (tenant == null) throw StateError('Select a business first.');
        return _authorized('tenants/$_tenantId/$resource',
            method: method, body: body, query: query);
      });

  /// One intent and its UUIDs must be retained by the form across uncertain retries.
  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> intent) =>
      _run(() async {
        if (tenant == null) throw StateError('Select a business first.');
        final root = 'tenants/$_tenantId';
        await _authorized('$root/conversations', method: 'POST', body: {
          'id': intent['conversationId'],
          'customerReference': 'Manual order ${intent['id']}',
          'language': intent['language'],
        });
        return _authorized('$root/order-attempts', method: 'POST', body: {
          'id': intent['id'],
          'conversationId': intent['conversationId'],
          'details': intent['details'],
        });
      });

  Future<Map<String, dynamic>> saveProfile(
          {required String language,
          required String timezone,
          required String description}) =>
      _run(() {
        if (tenant?['role'] != 'OWNER') {
          throw StateError('Only an owner can change this profile.');
        }
        return _authorized(_profilePath, method: 'PUT', body: {
          'language': language,
          'timezone': timezone,
          'description': description
        });
      });

  Future<void> signOut() => _run(() async {
        await _authorized('auth/session', method: 'DELETE');
        _clear();
      });

  void _clear({bool expired = false}) {
    _expiry?.cancel();
    _expiry = null;
    _token = null;
    _email = null;
    _tenantId = null;
    _tenants = const [];
    _notice = expired ? 'Your session expired. Please sign in again.' : null;
  }

  @override
  void dispose() {
    _disposed = true;
    _clear();
    _api.close();
    super.dispose();
  }
}
