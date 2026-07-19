import 'dart:async';

import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

void main() {
  group('EchoMirror Riverpod providers', () {
    test('provide native clients and dispose native resources', () async {
      final fakeApi = FakeNativeEchoMirrorApi();
      final container = ProviderContainer(
        overrides: [
          nativeEchoMirrorApiProvider.overrideWith((ref) {
            ref.onDispose(fakeApi.dispose);
            return fakeApi;
          }),
        ],
      );
      addTearDown(container.dispose);

      final mood = container.read(moodClientProvider);
      final stellar = container.read(stellarClientProvider);

      final entry = await mood.log(score: 8, note: 'steady', tags: ['focus']);
      final tx = await stellar.createMoodRewardTransaction(
        moodEntry: entry,
        destinationPublicKey:
            'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      );

      expect(entry.score, 8);
      expect(tx.amount, '8');
      expect(tx.destinationPublicKeyHash, startsWith('hash_'));
      expect(fakeApi.disposed, isFalse);

      container.dispose();

      expect(fakeApi.disposed, isTrue);
    });

    test('exposes native events as streams', () async {
      final fakeApi = FakeNativeEchoMirrorApi();
      final container = ProviderContainer(
        overrides: [
          nativeEchoMirrorApiProvider.overrideWith((ref) {
            ref.onDispose(fakeApi.dispose);
            return fakeApi;
          }),
        ],
      );
      addTearDown(container.dispose);

      final stream = container.read(nativeEventsProvider.stream);
      final expectation = expectLater(
        stream,
        emits(
          isA<NativeEvent>()
              .having((event) => event.name, 'name', 'mood.logged'),
        ),
      );
      fakeApi.emit(
        const NativeEvent('mood.logged', {
          'score': 9,
          'created_at': '2026-07-19T12:00:00Z',
        }),
      );

      await expectation;
    });
  });
}

class FakeNativeEchoMirrorApi implements NativeEchoMirrorApi {
  final _events = StreamController<NativeEvent>.broadcast();
  var disposed = false;

  @override
  Future<String> version() async => 'test';

  @override
  Future<bool> verifyMoodScore(int score) async => score >= 1 && score <= 10;

  @override
  Future<String> hashPublicKey(String publicKey) async => 'hash_$publicKey';

  @override
  Future<bool> isValidStellarAddress(String address) async {
    return address.startsWith('G') && address.length == 56;
  }

  @override
  Future<NativeSyncCursor> serializeCursor({
    required int ledgerSequence,
    required String pagingToken,
    required int totalProcessed,
  }) async {
    return NativeSyncCursor(
      ledgerSequence: ledgerSequence,
      pagingToken: pagingToken,
      totalProcessed: totalProcessed,
    );
  }

  @override
  Stream<NativeEvent> get events => _events.stream;

  void emit(NativeEvent event) => _events.add(event);

  @override
  void dispose() {
    disposed = true;
    _events.close();
  }
}
