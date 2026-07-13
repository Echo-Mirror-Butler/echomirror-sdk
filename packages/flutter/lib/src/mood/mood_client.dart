import 'dart:convert';
import 'package:http/http.dart' as http;
import '../echo_mirror.dart';
import 'mood_models.dart';
import '../errors.dart';

class MoodClient {
  final SDKConfig config;

  MoodClient(this.config);

  Map<String, String> get _headers => {
        'x-api-key': config.apiKey,
        'x-echomirror-network': config.network.name,
        'content-type': 'application/json',
        if (config.authToken != null) 'authorization': 'Bearer ${config.authToken}',
      };

  Future<T> _request<T>(
    String method,
    String path, {
    Map<String, dynamic>? body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final uri = Uri.parse('${config.baseUrl}$path');
    http.Response res;

    try {
      switch (method) {
        case 'GET':
          res = await config.httpClient.get(uri, headers: _headers);
        case 'POST':
          res = await config.httpClient.post(
            uri,
            headers: _headers,
            body: body != null ? jsonEncode(body) : null,
          );
        default:
          throw ArgumentError('Unsupported method: $method');
      }
    } catch (e) {
      throw EchoMirrorNetworkError(e.toString());
    }

    if (res.statusCode == 401) throw const EchoMirrorAuthError();
    if (res.statusCode == 429) throw const EchoMirrorRateLimitError();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw EchoMirrorError('HTTP ${res.statusCode}: ${res.body}');
    }

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return fromJson(json);
  }

  /// Log a mood entry for the authenticated user.
  ///
  /// ```dart
  /// final entry = await EchoMirror.instance.mood.log(
  ///   score: 8,
  ///   note: 'Great day!',
  ///   tags: ['work', 'proud'],
  /// );
  /// ```
  Future<MoodEntry> log({
    required int score,
    String? note,
    List<String> tags = const [],
  }) {
    assert(score >= 1 && score <= 10, 'score must be between 1 and 10');
    return _request(
      'POST',
      '/mood/entries',
      body: {'score': score, if (note != null) 'note': note, 'tags': tags},
      fromJson: MoodEntry.fromJson,
    );
  }

  /// Get the user's current mood streak.
  Future<MoodStreak> getStreak() {
    return _request('GET', '/mood/streak', fromJson: MoodStreak.fromJson);
  }

  /// Get aggregated mood stats for a time period.
  Future<MoodSummary> getSummary({String period = 'week'}) {
    return _request(
      'GET',
      '/mood/summary?period=$period',
      fromJson: MoodSummary.fromJson,
    );
  }
}
