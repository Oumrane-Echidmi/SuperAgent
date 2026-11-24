import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:superagent/account/business_session.dart';
import 'package:superagent/account/workspace_scope.dart';
import 'package:superagent/theme.dart';
import 'package:superagent/workspace/records.dart';

void main() {
  for(final width in [320.0,430.0]) {
    testWidgets('document create validates and saves at width $width',(tester) async {
      tester.view.physicalSize=Size(width,900);
      tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final records=<Map<String,dynamic>>[];
      final writes=<Map<String,dynamic>>[];
      final session=BusinessSession(BusinessApi(Uri.parse('http://localhost/v1/'),client:MockClient((r) async {
        Object result={};
        if(r.url.path.endsWith('/auth/sessions')) {result={'token':'token','expiresAt':DateTime.now().add(const Duration(hours:1)).toIso8601String()};}
        else if(r.url.path.endsWith('/me')) {result={'user':{'email':'owner@example.com'},'tenants':[{'id':'shop','name':'Shop','role':'OWNER'}]};}
        else if(r.method == 'POST') {final body=jsonDecode(r.body) as Map<String,dynamic>;writes.add(body);records.add({...body,'revision':1});result=records.last;}
        else {result={'data':records,'pagination':{'totalPages':1}};}
        return http.Response(jsonEncode(result),200,headers:{'content-type':'application/json'});
      })));
      await session.authenticate('owner@example.com','password');
      await tester.pumpWidget(WorkspaceScope(session:session,child:MaterialApp(theme:SA.theme(),home:const RecordsScreen(kind:'document'))));
      await tester.pumpAndSettle();
      expect(find.textContaining('No docs yet'),findsOneWidget);
      await tester.tap(find.text('New document'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save draft'));
      await tester.tap(find.text('Save draft'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a title.'),findsOneWidget);
      await tester.enterText(find.byType(TextFormField).first,'Delivery policy');
      await tester.enterText(find.byType(TextFormField).last,'Deliver within two days.');
      await tester.ensureVisible(find.text('Save draft'));
      await tester.tap(find.text('Save draft'));
      await tester.pumpAndSettle();
      expect(writes.single['kind'],'document');
      expect(writes.single['content'],{'body':'Deliver within two days.'});
      expect(find.text('Delivery policy'),findsOneWidget);
      expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
    });
  }
}
