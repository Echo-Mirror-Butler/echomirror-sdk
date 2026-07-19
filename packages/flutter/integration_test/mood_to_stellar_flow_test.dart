import 'dart:async';

import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('logs mood and creates a Stellar transaction through providers', (
    tester,
  ) async {
    final container = ProviderContainer(
      overrides: [
        nativeEchoMirrorApiProvider.overrideWith((ref) {
          final api = IntegrationFakeNativeApi();
          ref.onDispose(api.dispose);
          return api;
        }),
      ],
    );
    addTearDown(container.dispose);

    final entry = await container
        .read(moodClientProvider)
        .log(score: 10, note: 'release-ready', tags: const ['ship']);
    final transaction =
        await container.read(stellarClientProvider).createMoodRewardTransaction(
              moodEntry: entry,
              destinationPublicKey:
                  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            );

    expect(entry.score, 10);
    expect(transaction.asset, 'ECHO');
    expect(transaction.memo, 'mood:10');
    expect(transaction.cursor.pagingToken, entry.id);
    expect(transaction.destinationPublicKeyHash, contains('GAAAA'));
  });
}

class IntegrationFakeNativeApi implements NativeEchoMirrorApi {
  final _events = StreamController<NativeEvent>.broadcast();

  @override
  Future<String> version() async => 'integration';

  @override
  Future<bool> verifyMoodScore(int score) async => score >= 1 && score <= 10;

  @override
  Future<String> hashPublicKey(String publicKey) async =>
      'integration_$publicKey';

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

  @override
  void dispose() => _events.close();
}
