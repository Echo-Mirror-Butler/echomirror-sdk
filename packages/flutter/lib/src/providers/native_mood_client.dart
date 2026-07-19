import '../ffi/echomirror_ffi.dart';

class NativeMoodClient {
  const NativeMoodClient(this._api);

  final NativeEchoMirrorApi _api;

  Future<NativeMoodEntry> log({
    required int score,
    String? note,
    List<String> tags = const [],
  }) async {
    final valid = await _api.verifyMoodScore(score);
    if (!valid) {
      throw RangeError.range(score, 1, 10, 'score');
    }

    return NativeMoodEntry(
      id: 'native-${DateTime.now().microsecondsSinceEpoch}',
      score: score,
      note: note,
      tags: List.unmodifiable(tags),
      createdAt: DateTime.now().toUtc(),
    );
  }

  Future<bool> verifyScore(int score) => _api.verifyMoodScore(score);
}

class NativeMoodEntry {
  const NativeMoodEntry({
    required this.id,
    required this.score,
    required this.tags,
    required this.createdAt,
    this.note,
  });

  final String id;
  final int score;
  final String? note;
  final List<String> tags;
  final DateTime createdAt;
}
