import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:superagent/account/business_session.dart';
import 'package:superagent/main.dart';

class WorkspaceFixture {
  final attempts = <String, Map<String, dynamic>>{};
  final decisions = <Map<String, dynamic>>[];
  final calls = <String>[];
  bool loseFirstDecision = true;
  String? deliveryStatus;
  final jobIntents = <Map<String, dynamic>>[];
  bool loseFirstJob = true;
  Future<http.Response> handle(http.Request request) async {
    final path = request.url.path;
    calls.add('${request.method} $path');
    Object value = {};
    if (path.endsWith('/auth/sessions') ||
        path.endsWith('/auth/registrations')) {
      value = {
        'token': 'test-token',
        'expiresAt':
            DateTime.now().add(const Duration(hours: 1)).toIso8601String()
      };
    } else if (path.endsWith('/me')) {
      value = {
        'user': {'email': 'owner@example.com'},
        'tenants': [
          {'id': 'shop-1', 'name': 'Atlas Shop', 'role': 'OWNER'},
          {'id': 'shop-2', 'name': 'Staff Shop', 'role': 'STAFF'},
        ]
      };
    } else if (path.endsWith('/profile')) {
      value = {
        'language': 'fr',
        'timezone': 'Africa/Casablanca',
        'description': 'Delivery policies',
        'updatedAt': '2026-11-18'
      };
    } else if (path.endsWith('/dashboard/outcomes')) {
      value = {
        'from': '2026-11-18',
        'timezone': 'Africa/Casablanca',
        'totals': {
          'pending': attempts.length,
          'confirmed': 0,
          'declined': 0,
          'confirmationRate': null,
          'confirmedOrderValueMinor': '0',
          'sheetSyncWaiting': 0,
        }
      };
    } else if (path.endsWith('/order-attempts') && request.method == 'POST') {
      final input = jsonDecode(request.body) as Map<String, dynamic>;
      final attempt = {
        ...input,
        'status': 'PENDING',
        'revision': 1,
        'summaryHash': 'a' * 64,
        'startedAt': '2026-11-18T12:00:00Z',
        'review': {'ready': true, 'amountMinor': 27100}
      };
      attempts[input['id'] as String] = attempt;
      value = attempt;
    } else if (path.endsWith('/order-attempts')) {
      value = {
        'data': attempts.values.toList(),
        'pagination': {
          'totalItems': attempts.length,
          'totalPages': 1,
          'page': 1
        }
      };
    } else if (path.endsWith('/decisions')) {
      final input = jsonDecode(request.body) as Map<String, dynamic>;
      decisions.add(input);
      if (loseFirstDecision && decisions.length == 1) {
        throw http.ClientException('response lost');
      }
      final id = request.url.pathSegments[4];
      attempts[id]!['status'] = 'CONFIRMED';
      value = {'status': 'CONFIRMED'};
    } else if (path.contains('/order-attempts/')) {
      value = attempts[request.url.pathSegments.last]!;
    } else if (path.endsWith('/sheet-delivery/jobs')) {
      if (request.method == 'POST') {
        jobIntents.add(jsonDecode(request.body) as Map<String, dynamic>);
        if (loseFirstJob && jobIntents.length == 1) {
          throw http.ClientException('uncertain job response');
        }
      }
      value = {'data': []};
    } else if (path.endsWith('/sheet-delivery/reconcile')) {
      deliveryStatus = 'SUCCEEDED';
      value = {'status': 'SUCCEEDED'};
    } else if (path.endsWith('/sheet-delivery')) {
      value = {
        'headers': ['recipient', 'amountMad'],
        'rowPreview': ['Samira', '271.00']
      };
    } else if (path.endsWith('/sheet-destinations/destination-1')) {
      value = {
        'id': 'destination-1',
        'spreadsheetTitle': 'Test orders',
        'tabTitle': 'Orders',
        'status': 'ACCESS_CHECKED'
      };
    } else if (path.contains('/orders/')) {
      value = {
        'id': request.url.pathSegments.last,
        'sheetSync': {
          'delivery': deliveryStatus == null
              ? null
              : {'status': deliveryStatus, 'destinationId': 'destination-1'}
        }
      };
    } else if (path.endsWith('/sheet-destinations')) {
      value = {'data': []};
    } else if (path.endsWith('/auth/session')) {
      value = {'signedOut': true};
    }
    return http.Response(jsonEncode(value), 200,
        headers: {'content-type': 'application/json'});
  }
}

Future<void> fill(WidgetTester tester, String key, String value) async {
  final field = find.byKey(Key(key));
  await tester.ensureVisible(field);
  await tester.enterText(field, value);
}

Future<void> drawer(WidgetTester tester, String label) async {
  await tester.tap(find.byTooltip('Menu'));
  await tester.pumpAndSettle();
  final target = find.text(label).last;
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('mobile navigation exposes only connected workspace screens',
      (tester) async {
    final fixture = WorkspaceFixture();
    final session = BusinessSession(BusinessApi(
        Uri.parse('https://api.example.com/v1/'),
        client: MockClient(fixture.handle)));
    addTearDown(session.dispose);
    await session.authenticate('owner@example.com', 'a long passphrase');
    await tester.pumpWidget(SuperAgentApp(session: session));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Menu'));
    await tester.pumpAndSettle();
    for (final label in [
      'Home',
      'AI chat',
      'Inbox',
      'Orders',
      'Business profile',
      'Connections',
      'Builder',
      'WhatsApp',
      'Agents',
      'Docs',
      'Company Brain',
      'Workflows',
      'Canvas'
    ]) {
      await tester.scrollUntilVisible(
          find.descendant(of: find.byType(Drawer), matching: find.text(label)),
          150,
          scrollable: find.byType(Scrollable).last);
      expect(find.text(label), findsWidgets);
    }
    for (final label in [
      'Chat',
      'Labs',
      'Example Home',
      'Example Board',
      'Preview'
    ]) {
      expect(find.text(label), findsNothing);
    }
    await tester.scrollUntilVisible(
        find.descendant(of: find.byType(Drawer), matching: find.text('Home')),
        -250,
        scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Home').last);
    await tester.pumpAndSettle();
    final context = tester.element(find.text('Today at a glance'));
    Navigator.of(context).pushNamed('/preview/home');
    await tester.pumpAndSettle();
    expect(find.textContaining('Example screen'), findsOneWidget);
    expect(
        fixture.calls
            .any((call) => call == 'GET /v1/tenants/shop-1/dashboard/outcomes'),
        isTrue);
    await session.signOut();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'phone flow signs in, creates and reviews an order, safely retries a decision, and switches tenants',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fixture = WorkspaceFixture();
      final session = BusinessSession(BusinessApi(
          Uri.parse('https://api.example.com/v1/'),
          client: MockClient(fixture.handle)));
      addTearDown(session.dispose);
      await tester.pumpWidget(SuperAgentApp(session: session));
      expect(find.text('Welcome back.'), findsOneWidget);
      await fill(tester, 'email', 'owner@example.com');
      await fill(tester, 'password', 'a long passphrase');
      await tester.ensureVisible(find.byKey(const Key('authenticate')));
      await tester.tap(find.byKey(const Key('authenticate')));
      await tester.pumpAndSettle();
      expect(find.text('Today at a glance'), findsOneWidget);
      expect(find.text('Pending orders'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await drawer(tester, 'Orders');
      await tester.tap(find.text('Record order'));
      await tester.pumpAndSettle();
      for (final entry in {
        'recipient': 'Samira',
        'phone': '+212612345678',
        'item': 'Bag',
        'quantity': '2',
        'unitPrice': '125.50',
        'deliveryPrice': '20',
        'address': '12 Rue Atlas, Casablanca'
      }.entries) {
        await fill(tester, entry.key, entry.value);
      }
      await tester.ensureVisible(find.text('Save order details'));
      await tester.tap(find.text('Save order details'));
      await tester.pumpAndSettle();
      expect(fixture.attempts.length, 1);
      expect(find.text('Samira'), findsWidgets);
      expect(find.text('271.00 MAD'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('decision-evidence')));
      await tester.pumpAndSettle();
      expect(
          find.bySemanticsLabel('Customer decision evidence'), findsOneWidget);
      await fill(tester, 'decision-evidence',
          'Customer confirmed this summary by phone.');
      await tester.ensureVisible(find.text('Confirm order'));
      await tester.tap(find.text('Confirm order'));
      await tester.pumpAndSettle();
      expect(find.text('Retry this decision'), findsOneWidget);
      expect(
          tester
              .widget<OutlinedButton>(
                  find.widgetWithText(OutlinedButton, 'Decline order'))
              .onPressed,
          isNull);
      await tester.ensureVisible(find.text('Retry this decision'));
      await tester.tap(find.text('Retry this decision'));
      await tester.pumpAndSettle();
      expect(fixture.decisions.length, 2);
      expect(fixture.decisions[0], fixture.decisions[1]);
      expect(fixture.decisions[0]['expectedRevision'], 1);
      expect(fixture.decisions[0]['summaryHash'], 'a' * 64);
      expect(find.text('CONFIRMED'), findsOneWidget);
      expect(fixture.calls.any((call) => call.contains('/sheet-destinations')),
          isTrue);
      expect(tester.takeException(), isNull);

      session.selectTenant('shop-2');
      await tester.pumpAndSettle();
      expect(find.text('Samira'), findsNothing);
      expect(find.text('STAFF SHOP'), findsOneWidget);
      await drawer(tester, 'Business profile');
      expect(
          find.text('Only an owner can change this profile.'), findsOneWidget);
      expect(find.text('Save business profile'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
      'signed-out layout fits compact and large phones and validates credentials',
      (tester) async {
    final fixture = WorkspaceFixture();
    final session = BusinessSession(BusinessApi(
        Uri.parse('https://api.example.com/v1/'),
        client: MockClient(fixture.handle)));
    addTearDown(session.dispose);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final width in [320.0, 430.0]) {
      tester.view.physicalSize = Size(width, 844);
      await tester.pumpWidget(SuperAgentApp(session: session));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('authenticate')));
      await tester.tap(find.byKey(const Key('authenticate')));
      await tester.pumpAndSettle();
      expect(find.text('Enter a valid email.'), findsOneWidget);
      expect(find.text('Use at least 12 characters.'), findsOneWidget);
      expect(fixture.calls, isEmpty);
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'spreadsheet writes require an explicit reviewed action and retain uncertain job IDs',
      (tester) async {
    final fixture = WorkspaceFixture()..deliveryStatus = 'READY';
    fixture.attempts['order-1'] = {
      'id': 'order-1',
      'status': 'CONFIRMED',
      'startedAt': '2026-11-18T12:00:00Z',
      'details': {'recipient': 'Samira'},
      'review': {'ready': true, 'amountMinor': 27100}
    };
    final session = BusinessSession(BusinessApi(
        Uri.parse('https://api.example.com/v1/'),
        client: MockClient(fixture.handle)));
    await session.authenticate('owner@example.com', 'a long passphrase');
    await tester.pumpWidget(SuperAgentApp(session: session));
    await tester.pumpAndSettle();
    await drawer(tester, 'Orders');
    await tester.tap(find.text('Samira'));
    await tester.pumpAndSettle();
    expect(fixture.jobIntents, isEmpty);
    final queue = find.text('Queue spreadsheet delivery');
    await tester.ensureVisible(queue);
    await tester.pumpAndSettle();
    await tester.tap(queue);
    await tester.pumpAndSettle();
    final retry = find.text('Retry this delivery job');
    expect(retry, findsOneWidget);
    await tester.ensureVisible(retry);
    await tester.pumpAndSettle();
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(fixture.jobIntents.length, 2);
    expect(fixture.jobIntents[0], fixture.jobIntents[1]);
    await session.signOut();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    session.dispose();
  });

  testWidgets(
      'unknown spreadsheet delivery exposes reconciliation without append or queue actions',
      (tester) async {
    final fixture = WorkspaceFixture()..deliveryStatus = 'UNKNOWN';
    fixture.attempts['order-1'] = {
      'id': 'order-1',
      'status': 'CONFIRMED',
      'startedAt': '2026-11-18T12:00:00Z',
      'details': {'recipient': 'Samira'},
      'review': {'ready': true, 'amountMinor': 27100}
    };
    final session = BusinessSession(BusinessApi(
        Uri.parse('https://api.example.com/v1/'),
        client: MockClient(fixture.handle)));
    await session.authenticate('owner@example.com', 'a long passphrase');
    await tester.pumpWidget(SuperAgentApp(session: session));
    await tester.pumpAndSettle();
    await drawer(tester, 'Orders');
    await tester.tap(find.text('Samira'));
    await tester.pumpAndSettle();
    expect(find.text('Queue spreadsheet delivery'), findsNothing);
    final reconcile = find.text('Check spreadsheet for this order');
    await tester.ensureVisible(reconcile);
    await tester.pumpAndSettle();
    await tester.tap(reconcile);
    await tester.pumpAndSettle();
    expect(
        fixture.calls.where((call) => call.endsWith('/reconcile')).length, 1);
    expect(fixture.jobIntents, isEmpty);
    expect(find.text('Delivery status: SUCCEEDED'), findsOneWidget);
    await session.signOut();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    session.dispose();
  });
}
