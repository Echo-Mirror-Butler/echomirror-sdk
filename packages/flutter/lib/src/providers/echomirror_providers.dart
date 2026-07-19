import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../ffi/echomirror_ffi.dart';
import 'native_mood_client.dart';
import 'native_social_client.dart';
import 'native_stellar_client.dart';

final nativeEchoMirrorApiProvider = Provider.autoDispose<NativeEchoMirrorApi>((
  ref,
) {
  final api = EchoMirrorFfi();
  ref.onDispose(api.dispose);
  return api;
});

final moodClientProvider = Provider.autoDispose<NativeMoodClient>((ref) {
  return NativeMoodClient(ref.watch(nativeEchoMirrorApiProvider));
});

final stellarClientProvider = Provider.autoDispose<NativeStellarClient>((ref) {
  return NativeStellarClient(ref.watch(nativeEchoMirrorApiProvider));
});

final socialClientProvider = Provider.autoDispose<NativeSocialClient>((ref) {
  return NativeSocialClient(ref.watch(nativeEchoMirrorApiProvider));
});

final nativeEventsProvider = StreamProvider.autoDispose<NativeEvent>((ref) {
  return ref.watch(nativeEchoMirrorApiProvider).events;
});
