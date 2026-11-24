import 'package:flutter_test/flutter_test.dart';
import 'package:superagent/account/google_connection.dart';

void main() {
  test('Google callback binds origin path and state', () {
    final expected = Uri.parse('https://workspace.example/google/callback');
    expect(
        googleCallbackParameters(
            'https://workspace.example/google/callback?code=single-use&state=nonce',
            expected,
            'nonce'),
        {'state': 'nonce', 'code': 'single-use'});
    for (final url in [
      'https://attacker.example/google/callback?code=x&state=nonce',
      'https://workspace.example/other?code=x&state=nonce',
      'https://workspace.example/google/callback?code=x&state=wrong',
      'https://workspace.example/google/callback?error=access_denied&state=nonce'
    ]) {
      expect(() => googleCallbackParameters(url, expected, 'nonce'),
          throwsStateError);
    }
  });
  test('spreadsheet parser matches web link and ID behavior', () {
    expect(
        spreadsheetIdFrom(
            'https://docs.google.com/spreadsheets/d/abc_123/edit'),
        'abc_123');
    expect(spreadsheetIdFrom(' abc_123 '), 'abc_123');
    expect(spreadsheetIdFrom('invalid sheet!'), isNull);
  });
}
