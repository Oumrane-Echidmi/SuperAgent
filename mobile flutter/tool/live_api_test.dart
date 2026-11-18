import 'package:flutter_test/flutter_test.dart';
import 'package:uuid/uuid.dart';
import 'package:superagent/account/business_session.dart';
import 'package:superagent/workspace/order_values.dart';

// Explicitly run against a local migrated development API; not part of unit discovery.
void main() {
  test(
      'real backend: registration, profile, idempotent order, reviewed decision, outcomes and sign-out',
      () async {
    const origin = String.fromEnvironment('SUPERAGENT_TEST_API',
        defaultValue: 'http://127.0.0.1:3000/v1/');
    final session = BusinessSession(BusinessApi(Uri.parse(origin)));
    addTearDown(session.dispose);
    final uuid = const Uuid();
    final email = 'flutter-smoke-${uuid.v4()}@example.com';
    final password = uuid.v4();
    await session.authenticate(email, password,
        businessName: 'Flutter integration fixture');
    expect(session.tenant!['role'], 'OWNER');
    await session.saveProfile(
        language: 'fr',
        timezone: 'Africa/Casablanca',
        description: 'Synthetic local integration fixture.');
    expect((await session.loadProfile())['description'],
        'Synthetic local integration fixture.');
    final intent = {
      'id': uuid.v4(),
      'conversationId': uuid.v4(),
      'language': 'fr',
      'details': {
        'recipient': 'Test customer',
        'phone': '+212600000001',
        'item': 'Test bag',
        'quantity': 2,
        'unitAmountMinor': 12550,
        'deliveryAmountMinor': 2000,
        'address': 'Synthetic test address',
      }
    };
    final first = await session.createOrder(intent);
    final replay = await session.createOrder(intent);
    expect(first['id'], replay['id']);
    final list = await session
        .request('order-attempts', query: {'page': '1', 'pageSize': '25'});
    expect(list['pagination']['totalItems'], 1);
    final decision = {
      'id': uuid.v4(),
      'expectedRevision': first['revision'],
      'summaryHash': first['summaryHash'],
      'decision': 'CONFIRM',
      'evidence': 'Synthetic customer confirmed this exact test summary.'
    };
    await session.request('order-attempts/${first['id']}/decisions',
        method: 'POST', body: decision);
    await session.request('order-attempts/${first['id']}/decisions',
        method: 'POST', body: decision);
    final order = await session.request('orders/${first['id']}');
    expect(order['amountMinor'].toString(), '27100');
    expect(order['status'], 'CONFIRMED');
    final date = businessDate('Africa/Casablanca');
    final outcomes = await session
        .request('dashboard/outcomes', query: {'from': date, 'to': date});
    expect(outcomes['totals']['confirmed'], 1);
    expect(outcomes['totals']['confirmedOrderValueMinor'], '27100');
    await session.signOut();
    expect(session.signedIn, isFalse);
    await session.authenticate(email, password);
    expect(
        (await session.request('order-attempts'))['pagination']['totalItems'],
        1);
    await session.signOut();
  });
}
