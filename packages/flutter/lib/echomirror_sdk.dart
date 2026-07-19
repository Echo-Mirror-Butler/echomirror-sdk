/// EchoMirror SDK for Flutter.
///
/// Embed mood intelligence, Stellar payments, and social wellness
/// into any Flutter app in minutes.
///
/// ```dart
/// import 'package:echomirror_sdk/echomirror_sdk.dart';
///
/// void main() async {
///   await EchoMirror.initialize(apiKey: 'your_api_key');
///   runApp(const MyApp());
/// }
/// ```
library echomirror_sdk;

export 'src/echo_mirror.dart';
export 'src/mood/mood_client.dart';
export 'src/mood/mood_models.dart';
export 'src/stellar/stellar_client.dart';
export 'src/stellar/stellar_models.dart';
export 'src/social/social_client.dart';
export 'src/social/social_models.dart';
export 'src/errors.dart';
export 'src/ffi/echomirror_ffi.dart';
export 'src/providers/echomirror_providers.dart';
export 'src/providers/native_mood_client.dart';
export 'src/providers/native_social_client.dart';
export 'src/providers/native_stellar_client.dart';
