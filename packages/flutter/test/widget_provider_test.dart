import 'dart:async';

import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

void main() {
  testWidgets('renders provider-backed native mood validation', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          nativeEchoMirrorApiProvider.overrideWith((ref) {
            final api = WidgetFakeNativeApi();
            ref.onDispose(api.dispose);
            return api;
          }),
        ],
        child: const MaterialApp(home: MoodCheck()),
      ),
    );

    expect(find.text('Checking'), findsOneWidget);

    await tester.pumpAndSettle();

    expect(find.text('Native mood score ready'), findsOneWidget);
  });
}

class MoodCheck extends ConsumerWidget {
  const MoodCheck({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mood = ref.watch(moodClientProvider);
    return FutureBuilder<bool>(
      future: mood.verifyScore(7),
      builder: (context, snapshot) {
        return Scaffold(
          body: Center(
            child: Text(
              snapshot.data == true ? 'Native mood score ready' : 'Checking',
            ),
          ),
        );
      },
    );
  }
}

class WidgetFakeNativeApi implements NativeEchoMirrorApi {
  final _events = StreamController<NativeEvent>.broadcast();

  @override
  Future<String> version() async => 'widget';

  @override
  Future<bool> verifyMoodScore(int score) async => score >= 1 && score <= 10;

  @override
  Future<String> hashPublicKey(String publicKey) async => publicKey;

  @override
  Future<bool> isValidStellarAddress(String address) async => true;

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
