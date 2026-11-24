import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:superagent/account/business_session.dart';

void main() {
  test(
      'parallel workspace reads succeed and discard results after tenant changes',
      () async {
    final gate = Completer<void>();
    final session = BusinessSession(BusinessApi(
        Uri.parse('http://localhost/v1/'), client: MockClient((r) async {
      Object body = {};
      if (r.url.path.endsWith('/auth/sessions')) {
        body = {
          'token': 'token',
          'expiresAt':
              DateTime.now().add(const Duration(hours: 1)).toIso8601String()
        };
      } else if (r.url.path.endsWith('/me')) {
        body = {
          'user': {'email': 'test@example.com'},
          'tenants': [
            {'id': 'one', 'name': 'One', 'role': 'OWNER'},
            {'id': 'two', 'name': 'Two', 'role': 'OWNER'}
          ]
        };
      } else {
        await gate.future;
        body = {'data': []};
      }
      return http.Response(jsonEncode(body), 200,
          headers: {'content-type': 'application/json'});
    })));
    await session.authenticate('test@example.com', 'password');
    final first = session.request('conversations');
    final second = session.request('whatsapp-numbers');
    session.selectTenant('two');
    final a = expectLater(first, throwsStateError);
    final b = expectLater(second, throwsStateError);
    gate.complete();
    await Future.wait([a, b]);
    session.dispose();
  });
}
