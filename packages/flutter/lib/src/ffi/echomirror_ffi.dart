import 'dart:async';
import 'dart:convert';

import 'echomirror_bindings.dart';
import 'native_library.dart';

/// High-level typed native API used by Flutter clients and providers.
class EchoMirrorFfi implements NativeEchoMirrorApi {
  EchoMirrorFfi({EchoMirrorBindings? bindings})
      : _bindings = bindings ??
            EchoMirrorBindings.fromLookup(openNativeLibrary().lookup);

  final EchoMirrorBindings _bindings;
  final _events = StreamController<NativeEvent>.broadcast();
  var _disposed = false;

  @override
  Future<String> version() => _guard(() async => _bindings.version);

  @override
  Future<bool> verifyMoodScore(int score) =>
      _guard(() async => _bindings.verifyMoodScore(score));

  @override
  Future<String> hashPublicKey(String publicKey) =>
      _guard(() async => _bindings.hashPublicKey(publicKey));

  @override
  Future<bool> isValidStellarAddress(String address) =>
      _guard(() async => _bindings.isValidStellarAddress(address));

  @override
  Future<NativeSyncCursor> serializeCursor({
    required int ledgerSequence,
    required String pagingToken,
    required int totalProcessed,
  }) {
    return _guard(() async {
      final json = _bindings.serializeCursor(
        ledgerSequence: ledgerSequence,
        pagingToken: pagingToken,
        totalProcessed: totalProcessed,
      );
      return NativeSyncCursor.fromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
    });
  }

  @override
  Stream<NativeEvent> get events => _events.stream;

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _events.close();
  }

  Future<T> _guard<T>(Future<T> Function() action) {
    if (_disposed) {
      throw StateError('EchoMirrorFfi has been disposed');
    }
    return action();
  }
}

abstract class NativeEchoMirrorApi {
  Future<String> version();

  Future<bool> verifyMoodScore(int score);

  Future<String> hashPublicKey(String publicKey);

  Future<bool> isValidStellarAddress(String address);

  Future<NativeSyncCursor> serializeCursor({
    required int ledgerSequence,
    required String pagingToken,
    required int totalProcessed,
  });

  Stream<NativeEvent> get events;

  void dispose();
}

class NativeSyncCursor {
  const NativeSyncCursor({
    required this.ledgerSequence,
    required this.pagingToken,
    required this.totalProcessed,
  });

  factory NativeSyncCursor.fromJson(Map<String, dynamic> json) {
    return NativeSyncCursor(
      ledgerSequence: json['ledger_sequence'] as int,
      pagingToken: json['paging_token'] as String,
      totalProcessed: json['total_processed'] as int,
    );
  }

  final int ledgerSequence;
  final String pagingToken;
  final int totalProcessed;
}

class NativeEvent {
  const NativeEvent(this.name, this.payload);

  final String name;
  final Map<String, Object?> payload;
}
