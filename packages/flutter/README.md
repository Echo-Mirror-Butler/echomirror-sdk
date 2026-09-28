# echomirror_sdk

The Flutter client for EchoMirror — mood intelligence, Stellar payments and social wellness in
one small package.

## Features

- **Mood** — log entries, read streaks, and fetch period summaries.
- **Stellar** — read XLM/ECHO balances, fund testnet accounts, and page through transaction history.
- **Social** — read the anonymized global mood feed and the weekly leaderboard.
- Typed errors for auth (`401`), rate limiting (`429`) and network failures.

## Supported platforms

Android, iOS, macOS, Linux and Windows. The SDK's HTTP surface is platform-agnostic; native/FFI
bundling for the plugin is tracked separately (see issue #25).

## Installation

Once published:

```yaml
dependencies:
  echomirror_sdk: ^0.1.0
```

Until the first release, depend on the repository directly:

```yaml
dependencies:
  echomirror_sdk:
    git:
      url: https://github.com/Echo-Mirror-Butler/echomirror-sdk.git
      path: packages/flutter
```

Then run `flutter pub get`.

## Getting started

Initialize the SDK once, before `runApp`:

```dart
import 'package:echomirror_sdk/echomirror_sdk.dart';
import 'package:flutter/material.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EchoMirror.initialize(
    apiKey: 'your_api_key',
    network: StellarNetwork.testnet,
  );
  runApp(const MyApp());
}
```

Sub-clients are reached through `EchoMirror.instance`:

```dart
// Log a mood entry.
final entry = await EchoMirror.instance.mood.log(
  score: 8,
  note: 'Great day!',
  tags: ['work'],
);

// Read a Stellar balance.
final balance = await EchoMirror.instance.stellar.getBalance(publicKey);

// Read the global mood feed.
final feed = await EchoMirror.instance.social.getGlobalFeed(limit: 20);
```

If your app signs the user in after startup, pass the session token through with
`EchoMirror.instance.setAuthToken(token)`.

## Minimal usage

- `EchoMirror.initialize` — configure the API key, base URL, Stellar network and HTTP client.
- `EchoMirror.instance.mood` — `log`, `getStreak`, `getSummary`.
- `EchoMirror.instance.stellar` — `getBalance`, `fundTestnetAccount`, `getTransactionHistory`.
- `EchoMirror.instance.social` — `getGlobalFeed`, `getLeaderboard`.

## Example

A runnable example app lives in [`example/`](example/).

## License

MIT — see [LICENSE](LICENSE).
