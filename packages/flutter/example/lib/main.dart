import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter/material.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EchoMirror.initialize(apiKey: 'demo_api_key');
  runApp(const EchoMirrorExampleApp());
}

class EchoMirrorExampleApp extends StatelessWidget {
  const EchoMirrorExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EchoMirror SDK example',
      home: const ExampleHomePage(),
    );
  }
}

class ExampleHomePage extends StatefulWidget {
  const ExampleHomePage({super.key});

  @override
  State<ExampleHomePage> createState() => _ExampleHomePageState();
}

class _ExampleHomePageState extends State<ExampleHomePage> {
  String _status = 'Tap a button to exercise the SDK.';
  bool _busy = false;

  Future<void> _run(Future<String> Function() action) async {
    setState(() {
      _busy = true;
    });
    try {
      final message = await action();
      if (!mounted) return;
      setState(() {
        _status = message;
      });
    } on EchoMirrorError catch (error) {
      if (!mounted) return;
      setState(() {
        _status = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EchoMirror SDK example')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_status),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : () => _run(_logMood),
              child: const Text('Log a mood'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : () => _run(_loadLeaderboard),
              child: const Text('Load the leaderboard'),
            ),
          ],
        ),
      ),
    );
  }

  Future<String> _logMood() async {
    final entry = await EchoMirror.instance.mood.log(
      score: 8,
      note: 'Logged from the example app',
      tags: const ['example'],
    );
    return 'Logged mood entry: $entry';
  }

  Future<String> _loadLeaderboard() async {
    final entries = await EchoMirror.instance.social.getLeaderboard(limit: 5);
    return 'Fetched ${entries.length} leaderboard entries.';
  }
}
