import '../ffi/echomirror_ffi.dart';
import 'native_mood_client.dart';

class NativeStellarClient {
  const NativeStellarClient(this._api);

  final NativeEchoMirrorApi _api;

  Future<bool> isValidAddress(String address) {
    return _api.isValidStellarAddress(address);
  }

  Future<String> hashPublicKey(String publicKey) {
    return _api.hashPublicKey(publicKey);
  }

  Future<NativeStellarTransaction> createMoodRewardTransaction({
    required NativeMoodEntry moodEntry,
    required String destinationPublicKey,
    String asset = 'ECHO',
  }) async {
    final valid = await _api.isValidStellarAddress(destinationPublicKey);
    if (!valid) {
      throw ArgumentError.value(
        destinationPublicKey,
        'destinationPublicKey',
        'Expected a Stellar G-address',
      );
    }

    final keyHash = await _api.hashPublicKey(destinationPublicKey);
    final cursor = await _api.serializeCursor(
      ledgerSequence: moodEntry.createdAt.millisecondsSinceEpoch ~/ 1000,
      pagingToken: moodEntry.id,
      totalProcessed: moodEntry.score,
    );

    return NativeStellarTransaction(
      id: 'mood-${moodEntry.id}',
      asset: asset,
      amount: moodEntry.score.toString(),
      destinationPublicKeyHash: keyHash,
      memo: 'mood:${moodEntry.score}',
      cursor: cursor,
    );
  }
}

class NativeStellarTransaction {
  const NativeStellarTransaction({
    required this.id,
    required this.asset,
    required this.amount,
    required this.destinationPublicKeyHash,
    required this.memo,
    required this.cursor,
  });

  final String id;
  final String asset;
  final String amount;
  final String destinationPublicKeyHash;
  final String memo;
  final NativeSyncCursor cursor;
}
