import 'package:timezone/data/latest_all.dart' as data;
import 'package:timezone/timezone.dart' as tz;

bool _zonesLoaded = false;
Map<String, tz.Location> _zones = {};

String businessDate(String zone, {DateTime? now}) {
  if (!_zonesLoaded) {
    data.initializeTimeZones();
    _zones = {
      for (final entry in tz.timeZoneDatabase.locations.entries)
        entry.key.toLowerCase(): entry.value
    };
    _zonesLoaded = true;
  }
  final location =
      zone.toUpperCase() == 'UTC' ? tz.UTC : _zones[zone.toLowerCase()];
  if (location == null) {
    throw const FormatException(
        'Update the business profile with a supported IANA timezone.');
  }
  final date = tz.TZDateTime.from(now ?? DateTime.now(), location);
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

int moneyMinor(String value) {
  if (!RegExp(r'^\d{1,8}(\.\d{1,2})?$').hasMatch(value)) {
    throw const FormatException('Enter a price with up to two decimal places.');
  }
  final parts = value.split('.');
  final minor = int.parse(parts[0]) * 100 +
      int.parse((parts.length == 1 ? '' : parts[1]).padRight(2, '0'));
  if (minor > 1000000000) {
    throw const FormatException('This price exceeds the supported limit.');
  }
  return minor;
}

String mad(Object? value) {
  if (value == null) return '—';
  final amount = BigInt.parse(value.toString());
  return '${amount ~/ BigInt.from(100)}.${(amount % BigInt.from(100)).toString().padLeft(2, '0')} MAD';
}
