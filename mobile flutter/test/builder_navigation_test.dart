import 'package:flutter_test/flutter_test.dart';
import 'package:superagent/theme.dart';

void main() {
  test('builder and connections are reachable from workspace navigation', () {
    expect(workspaceNav.map((n) => n.route),
        containsAll(['/builder', '/connections']));
  });
}
