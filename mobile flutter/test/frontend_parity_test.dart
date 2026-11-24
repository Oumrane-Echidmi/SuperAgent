import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:superagent/theme.dart';

void main() {
  test('live navigation includes web workspace destinations', () {
    expect(workspaceNav.map((n) => n.route),
        containsAll(['/inbox', '/docs', '/brain', '/agents', '/workflows']));
  });
  test('theme follows current web neutral palette', () {
    expect(SA.bg, const Color(0xFF000000));
    expect(SA.sidebar, const Color(0xFF090909));
  });
}
