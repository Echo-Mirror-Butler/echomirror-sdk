import 'dart:ffi';
import 'dart:io';

import 'package:echomirror_sdk/src/ffi/echomirror_bindings.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final mockLibraryPath = Platform.environment['ECHOMIRROR_MOCK_FFI'];

  group('EchoMirrorBindings', () {
    late EchoMirrorBindings bindings;

    setUpAll(() {
      if (mockLibraryPath == null || mockLibraryPath.isEmpty) {
        return;
      }

      final library = DynamicLibrary.open(mockLibraryPath);
      bindings = EchoMirrorBindings.fromLookup(library.lookup);
    });

    test('reads version and validates mood scores', () {
      if (mockLibraryPath == null || mockLibraryPath.isEmpty) {
        markTestSkipped('Set ECHOMIRROR_MOCK_FFI to run native binding tests.');
        return;
      }

      expect(bindings.version, '0.1.0-mock');
      expect(bindings.verifyMoodScore(1), isTrue);
      expect(bindings.verifyMoodScore(10), isTrue);
      expect(bindings.verifyMoodScore(0), isFalse);
      expect(bindings.verifyMoodScore(11), isFalse);
    });

    test('wraps string-returning Stellar helpers', () {
      if (mockLibraryPath == null || mockLibraryPath.isEmpty) {
        markTestSkipped('Set ECHOMIRROR_MOCK_FFI to run native binding tests.');
        return;
      }

      const publicKey =
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      expect(bindings.isValidStellarAddress(publicKey), isTrue);
      expect(bindings.hashPublicKey(publicKey), 'mock_hash_$publicKey');
      expect(
        bindings.serializeCursor(
          ledgerSequence: 42,
          pagingToken: 'abc',
          totalProcessed: 7,
        ),
        '{"ledger_sequence":42,"paging_token":"abc","total_processed":7}',
      );
    });
  });
}
