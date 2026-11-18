import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:superagent/account/business_session.dart';

// The base override uses Dart's real client, bypassing the widget-test mock.
class RealHttpOverrides extends HttpOverrides {}

http.Response json(Object value, [int status = 200]) => http.Response(
      jsonEncode(value),
      status,
      headers: {'content-type': 'application/json'},
    );

const identity = {
  'user': {'id': 'user-1', 'email': 'owner@example.com'},
  'tenants': [
    {'id': 'shop-1', 'name': 'First shop', 'role': 'OWNER'},
    {'id': 'shop-2', 'name': 'Second shop', 'role': 'STAFF'},
  ],
};

http.Response sessionResponse() => json({
      'token': 'test-session',
      'expiresAt':
          DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
    }, 201);

BusinessSession sessionWith(
    Future<http.Response> Function(http.Request) handle) {
  final session = BusinessSession(
    BusinessApi(Uri.parse('https://api.example.com/v1/'),
        client: MockClient(handle)),
  );
  addTearDown(session.dispose);
  return session;
}

void main() {
  test('registration authenticates /me and selects the first business',
      () async {
    final session = sessionWith((request) async {
      expect(request.followRedirects, isFalse);
      if (request.url.path == '/v1/auth/registrations') {
        expect(request.method, 'POST');
        expect(request.headers.containsKey('authorization'), isFalse);
        expect(jsonDecode(request.body), {
          'email': 'owner@example.com',
          'password': 'a long passphrase',
          'businessName': 'My shop',
        });
        return sessionResponse();
      }
      expect(request.url.path, '/v1/me');
      expect(request.headers['authorization'], 'Bearer test-session');
      return json(identity);
    });
    await session.authenticate('owner@example.com', 'a long passphrase',
        businessName: 'My shop');
    expect(session.email, 'owner@example.com');
    expect(session.tenant!['id'], 'shop-1');
    expect(session.signedIn, isTrue);
    expect(session.busy, isFalse);
  });

  test('a failed identity fetch never establishes a signed-in session',
      () async {
    final session = sessionWith((r) async => r.url.path.endsWith('/sessions')
        ? sessionResponse()
        : json({
            'error': {'code': 'UNAVAILABLE'}
          }, 503));
    await expectLater(session.authenticate('a@b.com', 'a long passphrase'),
        throwsA(isA<ApiException>()));
    expect(session.signedIn, isFalse);
    expect(session.tenants, isEmpty);
    expect(session.busy, isFalse);
  });

  test('invalid credentials do not show a session expiry notice', () async {
    final session = sessionWith((r) async => json({
          'error': {'code': 'INVALID_CREDENTIALS'}
        }, 401));
    await expectLater(session.authenticate('a@b.com', 'a long passphrase'),
        throwsA(isA<ApiException>()));
    expect(session.notice, isNull);
  });

  test('profile save targets only the selected business; staff cannot save',
      () async {
    final session = sessionWith((r) async {
      if (r.url.path.endsWith('/sessions')) return sessionResponse();
      if (r.url.path.endsWith('/me')) return json(identity);
      expect(r.url.path, '/v1/tenants/shop-1/profile');
      expect(r.method, 'PUT');
      expect(jsonDecode(r.body), {
        'language': 'darija',
        'timezone': 'Africa/Casablanca',
        'description': 'Shop policies'
      });
      return json(jsonDecode(r.body));
    });
    await session.authenticate('a@b.com', 'a long passphrase');
    await session.saveProfile(
        language: 'darija',
        timezone: 'Africa/Casablanca',
        description: 'Shop policies');
    session.selectTenant('shop-2');
    await expectLater(
        session.saveProfile(language: 'fr', timezone: 'UTC', description: ''),
        throwsA(isA<StateError>()));
    expect(() => session.selectTenant('unrelated'), throwsArgumentError);
  });

  test('401 clears identity and reports expiry even with a non-JSON body',
      () async {
    final session = sessionWith((r) async {
      if (r.url.path.endsWith('/sessions')) return sessionResponse();
      if (r.url.path.endsWith('/me')) return json(identity);
      return http.Response('unauthorized', 401);
    });
    await session.authenticate('a@b.com', 'a long passphrase');
    await expectLater(session.loadProfile(), throwsA(isA<ApiException>()));
    expect(session.signedIn, isFalse);
    expect(session.tenants, isEmpty);
    expect(session.notice, contains('expired'));
  });

  test('failed sign-out retains session so revocation can be retried',
      () async {
    var fail = true;
    final session = sessionWith((r) async {
      if (r.url.path.endsWith('/sessions')) return sessionResponse();
      if (r.url.path.endsWith('/me')) return json(identity);
      expect(r.method, 'DELETE');
      return fail
          ? json({
              'error': {'code': 'UNAVAILABLE'}
            }, 503)
          : json({'signedOut': true});
    });
    await session.authenticate('a@b.com', 'a long passphrase');
    await expectLater(session.signOut(), throwsA(isA<ApiException>()));
    expect(session.signedIn, isTrue);
    fail = false;
    await session.signOut();
    expect(session.signedIn, isFalse);
    expect(session.email, isNull);
  });

  test('business selection and duplicate writes are blocked during a request',
      () async {
    final response = Completer<http.Response>();
    final session = sessionWith((r) async {
      if (r.url.path.endsWith('/sessions')) return sessionResponse();
      if (r.url.path.endsWith('/me')) return json(identity);
      return response.future;
    });
    await session.authenticate('a@b.com', 'a long passphrase');
    final loading = session.loadProfile();
    expect(() => session.selectTenant('shop-2'), throwsStateError);
    await expectLater(session.signOut(), throwsStateError);
    response.complete(json({'language': 'fr'}));
    await loading;
    expect(session.tenant!['id'], 'shop-1');
  });

  test('API rejects unsafe origins, paths and non-JSON success responses',
      () async {
    for (final origin in [
      'http://example.com/v1/',
      'https://user:pass@example.com/v1/',
      'https://example.com/v1/?token=x'
    ]) {
      expect(() => BusinessApi(Uri.parse(origin)), throwsArgumentError);
    }
    final api = BusinessApi(Uri.parse('http://127.0.0.1:3000/v1/'),
        client: MockClient(
            (r) async => http.Response('<html>Unavailable</html>', 200)));
    addTearDown(api.close);
    for (final path in [
      '//evil.com',
      '../me',
      '/me',
      'https://evil.com',
      'tenants/%2e%2e/me'
    ]) {
      await expectLater(api.request(path), throwsArgumentError);
    }
    await expectLater(
        api.request('me'),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'INVALID_RESPONSE')));
  });

  test('network failures are safe and are not automatically retried', () async {
    var attempts = 0;
    final api = BusinessApi(Uri.parse('https://api.example.com/v1/'),
        client: MockClient((r) async {
      attempts++;
      throw http.ClientException('secret internal diagnostic');
    }));
    addTearDown(api.close);
    await expectLater(
        api.request('me'),
        throwsA(isA<ApiException>().having(
            (e) => e.toString(), 'safe message', isNot(contains('secret')))));
    expect(attempts, 1);
  });

  testWidgets(
      'local expiry clears the account and discards an in-flight profile',
      (tester) async {
    final response = Completer<http.Response>();
    final session = sessionWith((r) async {
      if (r.url.path.endsWith('/sessions')) {
        return json({
          'token': 'test-session',
          'expiresAt':
              DateTime.now().add(const Duration(seconds: 1)).toIso8601String()
        }, 201);
      }
      if (r.url.path.endsWith('/me')) return json(identity);
      return response.future;
    });
    await session.authenticate('a@b.com', 'a long passphrase');
    final pending = session.loadProfile();
    final discarded = expectLater(pending, throwsStateError);
    await tester.pump(const Duration(seconds: 2));
    expect(session.signedIn, isFalse);
    expect(session.notice, contains('expired'));
    response.complete(json({'description': 'private shop data'}));
    await discarded;
    expect(session.tenants, isEmpty);
  });

  test('real HTTP transport refuses redirects and aborts timed-out requests',
      () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      var redirected = false;
      server.listen((request) async {
        if (request.uri.path == '/v1/redirect') {
          request.response.statusCode = 302;
          request.response.headers.set('location', '/v1/target');
          await request.response.close();
        } else if (request.uri.path == '/v1/target') {
          redirected = true;
          await request.response.close();
        }
        // /v1/slow intentionally leaves the response pending until client abort.
      });
      final api = BusinessApi(Uri.parse('http://127.0.0.1:${server.port}/v1/'),
          timeout: const Duration(milliseconds: 200));
      addTearDown(api.close);
      await expectLater(api.request('redirect', token: 'private-token'),
          throwsA(isA<ApiException>()));
      expect(redirected, isFalse);
      await expectLater(
          api.request('slow'),
          throwsA(isA<ApiException>()
              .having((e) => e.code, 'code', 'NETWORK_ERROR')));
    }, RealHttpOverrides());
  });

  test('malformed identity and oversized response are rejected', () async {
    final session = sessionWith((r) async => r.url.path.endsWith('/sessions')
        ? sessionResponse()
        : json({
            'user': {'email': 'a@b.com'},
            'tenants': [
              {'id': 'shop-1', 'name': 'Shop', 'role': 'ADMIN'}
            ]
          }));
    await expectLater(session.authenticate('a@b.com', 'a long passphrase'),
        throwsA(isA<ApiException>()));
    expect(session.signedIn, isFalse);
    final api = BusinessApi(Uri.parse('https://api.example.com/v1/'),
        client: MockClient((r) async => json({'data': 'x' * (1024 * 1024)})));
    addTearDown(api.close);
    await expectLater(
        api.request('me'),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'INVALID_RESPONSE')));
  });
}
