import 'dart:ffi';

import 'package:ffi/ffi.dart';

typedef NativeLookup = Pointer<T> Function<T extends NativeType>(String symbol);

typedef _FreeStringNative = Void Function(Pointer<Utf8>);
typedef _FreeStringDart = void Function(Pointer<Utf8>);

typedef _VersionNative = Pointer<Utf8> Function();
typedef _VersionDart = Pointer<Utf8> Function();

typedef _VerifyMoodScoreNative = Uint8 Function(Uint8);
typedef _VerifyMoodScoreDart = int Function(int);

typedef _HashPublicKeyNative = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _HashPublicKeyDart = Pointer<Utf8> Function(Pointer<Utf8>);

typedef _IsValidStellarAddressNative = Uint8 Function(Pointer<Utf8>);
typedef _IsValidStellarAddressDart = int Function(Pointer<Utf8>);

typedef _SerializeCursorNative = Pointer<Utf8> Function(
    Uint32, Pointer<Utf8>, Uint64);
typedef _SerializeCursorDart = Pointer<Utf8> Function(int, Pointer<Utf8>, int);

/// Typed Dart wrapper over the EchoMirror C ABI.
class EchoMirrorBindings {
  EchoMirrorBindings.fromLookup(NativeLookup lookup)
      : _freeString = lookup<NativeFunction<_FreeStringNative>>(
          'echomirror_free_string',
        ).asFunction(),
        _version = lookup<NativeFunction<_VersionNative>>(
          'echomirror_version',
        ).asFunction(),
        _verifyMoodScore = lookup<NativeFunction<_VerifyMoodScoreNative>>(
          'echomirror_verify_mood_score',
        ).asFunction(),
        _hashPublicKey = lookup<NativeFunction<_HashPublicKeyNative>>(
          'echomirror_hash_public_key',
        ).asFunction(),
        _isValidStellarAddress =
            lookup<NativeFunction<_IsValidStellarAddressNative>>(
          'echomirror_is_valid_stellar_address',
        ).asFunction(),
        _serializeCursor = lookup<NativeFunction<_SerializeCursorNative>>(
          'echomirror_serialize_cursor',
        ).asFunction();

  final _FreeStringDart _freeString;
  final _VersionDart _version;
  final _VerifyMoodScoreDart _verifyMoodScore;
  final _HashPublicKeyDart _hashPublicKey;
  final _IsValidStellarAddressDart _isValidStellarAddress;
  final _SerializeCursorDart _serializeCursor;

  String get version => _takeString(_version());

  bool verifyMoodScore(int score) {
    if (score < 0 || score > 255) {
      return false;
    }
    return _verifyMoodScore(score) == 1;
  }

  String hashPublicKey(String publicKey) {
    final pointer = publicKey.toNativeUtf8();
    try {
      return _takeString(_hashPublicKey(pointer));
    } finally {
      calloc.free(pointer);
    }
  }

  bool isValidStellarAddress(String address) {
    final pointer = address.toNativeUtf8();
    try {
      return _isValidStellarAddress(pointer) == 1;
    } finally {
      calloc.free(pointer);
    }
  }

  String serializeCursor({
    required int ledgerSequence,
    required String pagingToken,
    required int totalProcessed,
  }) {
    final token = pagingToken.toNativeUtf8();
    try {
      return _takeString(
        _serializeCursor(ledgerSequence, token, totalProcessed),
      );
    } finally {
      calloc.free(token);
    }
  }

  String _takeString(Pointer<Utf8> pointer) {
    if (pointer == nullptr) {
      throw const EchoMirrorFfiException('Native function returned null');
    }

    try {
      return pointer.toDartString();
    } finally {
      _freeString(pointer);
    }
  }
}

class EchoMirrorFfiException implements Exception {
  const EchoMirrorFfiException(this.message);

  final String message;

  @override
  String toString() => 'EchoMirrorFfiException: $message';
}
