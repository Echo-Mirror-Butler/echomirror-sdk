import 'dart:async';

import '../ffi/echomirror_ffi.dart';

class NativeSocialClient {
  const NativeSocialClient(this._api);

  final NativeEchoMirrorApi _api;

  Stream<NativeSocialEvent> watchGlobalMoodEvents() {
    return _api.events
        .where((event) => event.name == 'mood.logged')
        .map(NativeSocialEvent.fromNativeEvent);
  }
}

class NativeSocialEvent {
  const NativeSocialEvent({
    required this.score,
    required this.createdAt,
    this.country,
    this.city,
  });

  factory NativeSocialEvent.fromNativeEvent(NativeEvent event) {
    final createdAt = event.payload['created_at'];
    return NativeSocialEvent(
      score: event.payload['score'] as int,
      country: event.payload['country'] as String?,
      city: event.payload['city'] as String?,
      createdAt: createdAt is DateTime
          ? createdAt
          : DateTime.parse(createdAt as String),
    );
  }

  final int score;
  final String? country;
  final String? city;
  final DateTime createdAt;
}
