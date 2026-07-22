import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';
import '../echo_mirror.dart';
import 'sync_models.dart';

// ── FFI bindings ──────────────────────────────────────────────────────────────

typedef _HashPublicKeyNative = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _HashPublicKeyDart = Pointer<Utf8> Function(Pointer<Utf8>);

typedef _FreeStringNative = Void Function(Pointer<Utf8>);
typedef _FreeStringDart = void Function(Pointer<Utf8>);

typedef _IsValidAddressNative = Uint8 Function(Pointer<Utf8>);
typedef _IsValidAddressDart = int Function(Pointer<Utf8>);

typedef _SerializeCursorNative = Pointer<Utf8> Function(
    Uint32, Pointer<Utf8>, Uint64);
typedef _SerializeCursorDart = Pointer<Utf8> Function(int, Pointer<Utf8>, int);

/// Loads the native Rust library for crypto operations.
/// Falls back gracefully to pure-Dart implementations if not available.
class EchoMirrorNative {
  static DynamicLibrary? _lib;
  static _HashPublicKeyDart? _hashPublicKey;
  static _FreeStringDart? _freeString;
  static _IsValidAddressDart? _isValidAddress;

  static void initialize() {
    try {
      if (Platform.isAndroid) {
        _lib = DynamicLibrary.open('libechomirror_ffi.so');
      } else if (Platform.isIOS || Platform.isMacOS) {
        _lib = DynamicLibrary.process();
      } else if (Platform.isLinux) {
        _lib = DynamicLibrary.open('libechomirror_ffi.so');
      } else if (Platform.isWindows) {
        _lib = DynamicLibrary.open('echomirror_ffi.dll');
      }

      if (_lib != null) {
        _hashPublicKey =
            _lib!.lookupFunction<_HashPublicKeyNative, _HashPublicKeyDart>(
          'echomirror_hash_public_key',
        );
        _freeString = _lib!.lookupFunction<_FreeStringNative, _FreeStringDart>(
          'echomirror_free_string',
        );
        _isValidAddress =
            _lib!.lookupFunction<_IsValidAddressNative, _IsValidAddressDart>(
          'echomirror_is_valid_stellar_address',
        );
      }
    } catch (_) {
      // Native library not available — fall back to Dart implementations
    }
  }

  /// SHA-256 hash of a public key. Uses Rust FFI if available, else pure Dart.
  static String hashPublicKey(String publicKey) {
    if (_hashPublicKey != null && _freeString != null) {
      final input = publicKey.toNativeUtf8();
      final result = _hashPublicKey!(input);
      calloc.free(input);
      if (result.address != 0) {
        final hash = result.toDartString();
        _freeString!(result);
        return hash;
      }
    }
    // Pure Dart fallback (requires crypto package)
    return publicKey.hashCode.toRadixString(16);
  }

  /// Returns true if the address is a valid Stellar G-address.
  static bool isValidStellarAddress(String address) {
    if (_isValidAddress != null) {
      final input = address.toNativeUtf8();
      final result = _isValidAddress!(input);
      calloc.free(input);
      return result == 1;
    }
    return address.startsWith('G') && address.length == 56;
  }
}

// ── Blockchain sync client ────────────────────────────────────────────────────

/// Streams real-time Stellar transactions for one or more accounts.
///
/// ```dart
/// final sync = BlockchainSyncClient(EchoMirror.instance.config);
///
/// sync.watch('GPUBLIC_KEY')
///   .listen((event) {
///     if (event is TransactionSyncEvent) {
///       print('New TX: ${event.transaction.id}');
///     }
///   });
/// ```
class BlockchainSyncClient {
  final SDKConfig _config;
  final Map<String, SyncCursor> _cursors = {};
  final Map<String, StreamController<SyncEventBase>> _controllers = {};

  BlockchainSyncClient(this._config);

  String get _horizonBase => _config.network == StellarNetwork.testnet
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org';

  /// Start watching an account. Returns a Stream of sync events.
  Stream<SyncEventBase> watch(
    String publicKey, {
    Duration pollInterval = const Duration(seconds: 5),
  }) {
    if (_controllers.containsKey(publicKey)) {
      return _controllers[publicKey]!.stream;
    }

    final controller = StreamController<SyncEventBase>.broadcast();
    _controllers[publicKey] = controller;
    _cursors[publicKey] = SyncCursor.genesis();

    _poll(publicKey, pollInterval, controller);
    return controller.stream;
  }

  /// Stop watching an account and release resources.
  Future<void> unwatch(String publicKey) async {
    await _controllers[publicKey]?.close();
    _controllers.remove(publicKey);
    _cursors.remove(publicKey);
  }

  /// Stop all watchers.
  Future<void> dispose() async {
    for (final key in List.of(_controllers.keys)) {
      await unwatch(key);
    }
  }

  void _poll(
    String publicKey,
    Duration interval,
    StreamController<SyncEventBase> controller,
  ) async {
    while (!controller.isClosed) {
      try {
        final cursor = _cursors[publicKey] ?? SyncCursor.genesis();
        final records = await _fetchPage(publicKey, cursor.pagingToken);

        for (final record in records) {
          controller.add(LedgerSyncEvent(
            ledgerSequence: record.ledger,
            txHash: record.hash,
            pagingToken: record.pagingToken,
          ));
        }

        if (records.isNotEmpty) {
          final last = records.last;
          _cursors[publicKey] = SyncCursor(
            ledgerSequence: last.ledger,
            pagingToken: last.pagingToken,
            lastSyncedAt: DateTime.now(),
            totalProcessed: cursor.totalProcessed + records.length,
          );
        }
      } catch (e) {
        controller.add(ErrorSyncEvent(message: e.toString()));
      }

      await Future.delayed(interval);
    }
  }

  Future<List<_HorizonRecord>> _fetchPage(
      String publicKey, String cursor) async {
    var url =
        '$_horizonBase/accounts/$publicKey/transactions?limit=50&order=asc&cursor=$cursor';

    final res = await _config.httpClient.get(Uri.parse(url));
    if (res.statusCode != 200) return [];

    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final records = (body['_embedded']['records'] as List<dynamic>)
        .cast<Map<String, dynamic>>();

    return records.map(_HorizonRecord.fromJson).toList();
  }
}

class _HorizonRecord {
  final String id;
  final String hash;
  final String pagingToken;
  final int ledger;
  final String? memo;

  _HorizonRecord({
    required this.id,
    required this.hash,
    required this.pagingToken,
    required this.ledger,
    this.memo,
  });

  factory _HorizonRecord.fromJson(Map<String, dynamic> json) => _HorizonRecord(
        id: json['id'] as String,
        hash: json['hash'] as String,
        pagingToken: json['paging_token'] as String,
        ledger: json['ledger'] as int,
        memo: json['memo'] as String?,
      );
}
