import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

void main() {
  runApp(const ProviderScope(child: EchoMirrorExampleApp()));
}

class EchoMirrorExampleApp extends ConsumerWidget {
  const EchoMirrorExampleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mood = ref.watch(moodClientProvider);
    final stellar = ref.watch(stellarClientProvider);

    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('EchoMirror Native')),
        body: Center(
          child: FutureBuilder<NativeStellarTransaction>(
            future: _createTransaction(mood, stellar),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const CircularProgressIndicator();
              }

              return Text(
                'Created ${snapshot.data!.asset} tx ${snapshot.data!.id}',
              );
            },
          ),
        ),
      ),
    );
  }

  Future<NativeStellarTransaction> _createTransaction(
    NativeMoodClient mood,
    NativeStellarClient stellar,
  ) async {
    final entry = await mood.log(score: 8, tags: const ['example']);
    return stellar.createMoodRewardTransaction(
      moodEntry: entry,
      destinationPublicKey:
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
  }
}
