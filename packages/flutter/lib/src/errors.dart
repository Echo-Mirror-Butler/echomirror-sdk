class EchoMirrorError implements Exception {
  final String message;
  const EchoMirrorError(this.message);

  @override
  String toString() => 'EchoMirrorError: $message';
}

class EchoMirrorAuthError extends EchoMirrorError {
  const EchoMirrorAuthError([super.message = 'Invalid or expired API key']);
}

class EchoMirrorNetworkError extends EchoMirrorError {
  const EchoMirrorNetworkError([super.message = 'Network request failed']);
}

class EchoMirrorRateLimitError extends EchoMirrorError {
  const EchoMirrorRateLimitError([super.message = 'Rate limit exceeded']);
}
