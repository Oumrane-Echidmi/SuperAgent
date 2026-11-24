import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:superagent/account/business_session.dart';
import 'package:superagent/account/workspace_scope.dart';
import 'package:superagent/theme.dart';
import 'package:superagent/workspace/builder.dart';

class BuilderFixture extends BusinessSession {
  BuilderFixture() : super(BusinessApi(Uri.parse('http://localhost/v1/')));
  final writes = <Map<String, dynamic>>[];
  Map<String, dynamic>? draft;
  @override
  Map<String, dynamic> get tenant =>
      {'id': 'shop', 'name': 'Shop', 'role': 'OWNER'};
  @override
  Future<Map<String, dynamic>> loadScenarios() async => {
        'data': [
          {
            'scenarioId': 'delivery',
            'revision': 2,
            'name': 'Delivery',
            'description': 'Confirm delivery'
          }
        ]
      };
  @override
  Future<Map<String, dynamic>> request(String resource,
      {String method = 'GET',
      Map<String, dynamic>? body,
      Map<String, String>? query}) async {
    if (method == 'POST') {
      writes.add({'path': resource, ...?body});
      if (resource == 'drafts') {
        draft = {...body!, 'revision': 1};
        return draft!;
      }
      if (resource.endsWith('/simulations'))
        draft!['simulation'] = {'valid': true};
      if (resource.endsWith('/approve')) draft!['approval'] = {'revision': 1};
    }
    if (resource.startsWith('drafts/')) return draft!;
    if (resource == 'drafts')
      return {
        'data': draft == null
            ? []
            : [
                {
                  'id': draft!['id'],
                  'name': draft!['content']['name'],
                  'revision': 1
                }
              ]
      };
    return {'data': []};
  }
}

void main() {
  testWidgets('scenario draft must pass simulation before approval',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fixture = BuilderFixture();
    await tester.pumpWidget(WorkspaceScope(
        session: fixture,
        child: MaterialApp(theme: SA.theme(), home: const BuilderScreen())));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delivery (rev. 2)').last);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextFormField).first, 'Delivery assistant');
    await tester.enterText(
        find.byType(TextFormField).at(1), 'Help customers with delivery');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Create draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create draft'));
    await tester.pumpAndSettle();
    expect(fixture.writes.first['scenarioRevision'], 2);
    final approve = find.widgetWithText(FilledButton, 'Approve this revision');
    await tester.scrollUntilVisible(approve, 300,
        scrollable: find.byType(Scrollable).first);
    expect(tester.widget<FilledButton>(approve).onPressed, isNull);
    await tester.ensureVisible(find.text('Simulate this revision'));
    await tester.tap(find.text('Simulate this revision'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(approve);
    await tester.pumpAndSettle();
    await tester.tap(approve);
    await tester.pumpAndSettle();
    expect(fixture.writes.last['expectedRevision'], 1);
    expect(fixture.writes.last['path'], endsWith('/approve'));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    fixture.dispose();
  });
}
