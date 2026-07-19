import 'dart:ffi';
import 'dart:io';

DynamicLibrary openNativeLibrary() {
  if (Platform.isIOS) {
    return DynamicLibrary.process();
  }
  if (Platform.isAndroid || Platform.isLinux) {
    return DynamicLibrary.open('libechomirror_ffi.so');
  }
  if (Platform.isMacOS) {
    return DynamicLibrary.open('libechomirror_ffi.dylib');
  }
  if (Platform.isWindows) {
    return DynamicLibrary.open('echomirror_ffi.dll');
  }

  throw UnsupportedError('Unsupported EchoMirror native platform');
}
