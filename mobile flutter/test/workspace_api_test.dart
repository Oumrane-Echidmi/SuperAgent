import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:superagent/account/business_session.dart';
import 'package:superagent/workspace/order_values.dart';

void main() {
  test('money uses integer centimes without rounding or overflow', () {
    expect(moneyMinor('125.50'), 12550);
    expect(moneyMinor('0.01'), 1);
    expect(mad('12550'), '125.50 MAD');
    for (final input in ['1.001', '-1', '1,20', '10000000.01']) {
      expect(() => moneyMinor(input), throwsFormatException);
    }
  });

  test('dashboard dates follow shop timezone at UTC midnight boundaries', () {
    expect(
        businessDate('europe/paris', now: DateTime.utc(2024, 11, 18, 23, 30)),
        '2024-11-19');
    expect(businessDate('US/Pacific', now: DateTime.utc(2024, 11, 18, 1)),
        '2024-11-17');
    expect(businessDate('Etc/GMT-1', now: DateTime.utc(2026, 11, 18, 23, 30)),
        '2026-11-19');
    expect(
        businessDate('Africa/Casablanca', now: DateTime.utc(2026, 11, 18, 12)),
        '2026-11-18');
    expect(businessDate('America/New_York', now: DateTime.utc(2026, 11, 18, 1)),
        '2026-11-17');
    expect(() => businessDate('Unknown/Zone'), throwsA(isA<Exception>()));
  });

  test(
      'uncertain order retries reuse both IDs and payload; list query remains tenant scoped',
      () async {
    final writes = <Map<String, dynamic>>[];
    var attempts = 0;
    final session = BusinessSession(BusinessApi(
        Uri.parse('https://api.example.com/v1/'), client: MockClient((r) async {
      Object value = {};
      if (r.url.path.endsWith('/sessions')) {
        value = {
          'token': 'test-token',
          'expiresAt':
              DateTime.now().add(const Duration(hours: 1)).toIso8601String()
        };
      } else if (r.url.path.endsWith('/me')) {
        value = {
          'user': {'email': 'owner@example.com'},
          'tenants': [
            {'id': 'shop-1', 'name': 'Shop', 'role': 'OWNER'}
          ]
        };
      } else {
        expect(r.url.path, startsWith('/v1/tenants/shop-1/'));
        expect(r.headers['authorization'], 'Bearer test-token');
        if (r.method == 'POST') {
          writes.add(jsonDecode(r.body) as Map<String, dynamic>);
          if (r.url.path.endsWith('/order-attempts') && attempts++ == 0) {
            throw http.ClientException('lost response');
          }
          value = {'id': 'order-1'};
        } else {
          expect(r.url.queryParameters, {'page': '2', 'pageSize': '25'});
          value = {
            'data': [],
            'pagination': {'page': 2}
          };
        }
      }
      return http.Response(jsonEncode(value), 200,
          headers: {'content-type': 'application/json'});
    })));
    addTearDown(session.dispose);
    await session.authenticate('owner@example.com', 'a long passphrase');
    final intent = {
      'id': 'order-1',
      'conversationId': 'conversation-1',
      'language': 'fr',
      'details': {'recipient': 'Samira'}
    };
    await expectLater(
        session.createOrder(intent), throwsA(isA<ApiException>()));
    await session.createOrder(intent);
    expect(writes[0], writes[2]);
    expect(writes[1], writes[3]);
    await session
        .request('order-attempts', query: {'page': '2', 'pageSize': '25'});
  });
}
