// EchoMirror contract-test runner (Flutter).
//
// Reads the shared `contract-tests/contract-spec.json` and drives the real
// Flutter bindings (`EchoMirror.initialize` + MoodClient/SocialClient/
// StellarClient) against the docker-compose fixture (`fixture-api` on
// 127.0.0.1:18080). Expected values come straight from the spec — this file
// contains no hard-coded numbers, so it can't drift away from the contract.
//
// The suite self-skips when the fixture is not reachable. Build-transfer has
// no Flutter SDK method yet, so it is exercised at the transport level.
//
// Env overrides:
//   ECHOMIRROR_CONTRACT_SPEC       path to contract-spec.json
//   ECHOMIRROR_CONTRACT_API_BASE   e.g. http://127.0.0.1:18080
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:echomirror_sdk/echomirror_sdk.dart';

Map<String, dynamic> _spec() {
  final path = Platform.environment['ECHOMIRROR_CONTRACT_SPEC'] ??
      '../../contract-tests/contract-spec.json';
  return jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
}

Map<String, dynamic> op(Map<String, dynamic> spec, String id) =>
    (spec['operations'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .firstWhere((o) => o['id'] == id);

Future<bool> _fixtureReachable(String base) async {
  try {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 1);
    final req = await client.getUrl(Uri.parse('$base/mood/streak'));
    final res = await req.close();
    await res.drain<void>();
    client.close();
    return true;
  } catch (_) {
    return false;
  }
}

void main() async {
  final spec = _spec();
  final apiBase = Platform.environment['ECHOMIRROR_CONTRACT_API_BASE'] ??
      'http://127.0.0.1:18080';
  final live = await _fixtureReachable(apiBase);
  final skipReason = live ? false : 'fixture not reachable at $apiBase';

  final publicKey = ((spec['fixture']['users']['stellar']
          as Map<String, dynamic>)['public_key'])
      .toString();

  await EchoMirror.initialize(
    apiKey: (spec['fixture']['api_key'] as String),
    baseUrl: apiBase,
    network: StellarNetwork.testnet,
  );

  group('EchoMirror contract (Flutter binding)', () {
    test('fetch_mood_streak matches the contract', () async {
      final streak = await EchoMirror.instance.mood.getStreak();
      final body = op(spec, 'fetch_mood_streak')['response']['body']
          as Map<String, dynamic>;
      expect(streak.current, body['current']);
      expect(streak.longest, body['longest']);
      expect(streak.isActiveToday, body['is_active_today']);
      expect(streak.lastLoggedAt,
          DateTime.parse(body['last_logged_at'] as String).toUtc());
    }, skip: skipReason);

    test('fetch_mood_summary matches the contract', () async {
      final summary = await EchoMirror.instance.mood.getSummary(period: 'week');
      final body = op(spec, 'fetch_mood_summary')['response']['body']
          as Map<String, dynamic>;
      expect(summary.period, body['period']);
      expect(summary.average, body['average']);
      expect(summary.min, body['min']);
      expect(summary.max, body['max']);
      expect(summary.totalEntries, body['total_entries']);
      expect(summary.trend, body['trend']);
    }, skip: skipReason);

    test('log_mood matches the contract', () async {
      final entry = await EchoMirror.instance.mood.log(
        score: 8,
        note: 'Great day',
        tags: const ['work', 'proud'],
      );
      final body =
          op(spec, 'log_mood')['response']['body'] as Map<String, dynamic>;
      expect(entry.id, body['id']);
      expect(entry.userId, body['user_id']);
      expect(entry.score, body['score']);
      expect(entry.note, body['note']);
      expect(entry.tags, body['tags']);
      expect(entry.createdAt,
          DateTime.parse(body['created_at'] as String).toUtc());
    }, skip: skipReason);

    test('get_social_feed matches the contract', () async {
      final feed = await EchoMirror.instance.social.getGlobalFeed(limit: 10);
      final entry = op(spec, 'get_social_feed')['response']['body']['entries']
          [0] as Map<String, dynamic>;
      expect(feed.single.id, entry['id']);
      expect(feed.single.score, entry['score']);
      expect(
        feed.single.createdAt,
        DateTime.parse(entry['created_at'] as String).toUtc(),
      );
    }, skip: skipReason);

    test('get_leaderboard matches the contract', () async {
      final leaderboard =
          await EchoMirror.instance.social.getLeaderboard(limit: 10);
      final entry = op(spec, 'get_leaderboard')['response']['body']['entries']
          [0] as Map<String, dynamic>;
      expect(leaderboard.single.rank, entry['rank']);
      expect(leaderboard.single.userId, entry['user_id']);
      expect(leaderboard.single.displayName, entry['display_name']);
      expect(leaderboard.single.weeklyScore, entry['weekly_score']);
    }, skip: skipReason);

    test('build_echo_transfer matches the contract at the transport level',
        () async {
      final o = op(spec, 'build_echo_transfer');
      final body = o['request']['body'] as Map<String, dynamic>;
      final expected = o['response']['body'] as Map<String, dynamic>;

      final res = await http.post(
        Uri.parse('$apiBase${o['path']}'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode(body),
      );
      expect(res.statusCode, o['response']['status']);
      final got = jsonDecode(res.body) as Map<String, dynamic>;
      expect(got['xdr'], expected['xdr']);
      expect(got['fee'], expected['fee']);
      expect(got['sequence'], expected['sequence']);
    }, skip: skipReason);

    test('get_stellar_balance_api matches the contract', () async {
      final balance = await EchoMirror.instance.stellar.getBalance(publicKey);
      final body = op(spec, 'get_stellar_balance_api')['response']['body']
          as Map<String, dynamic>;
      expect(balance.xlm, body['xlm']);
      expect(balance.echo, body['echo']);
      expect(balance.network, body['network']);
    }, skip: skipReason);

    test('get_transaction_history matches the contract', () async {
      final txs = await EchoMirror.instance.stellar
          .getTransactionHistory(publicKey, limit: 10);
      final entry = op(spec, 'get_transaction_history')['response']['body']
          ['transactions'][0] as Map<String, dynamic>;
      expect(txs.single.id, entry['id']);
      expect(txs.single.type, entry['type']);
      expect(txs.single.amount, entry['amount']);
    }, skip: skipReason);

    test('api_request_to_unknown_route_must_fail surfaces a 404 error', () {
      expect(
        EchoMirror.instance.mood.getSummary(period: 'contract-unknown-variant'),
        throwsA(isA<EchoMirrorError>()),
      );
    }, skip: skipReason);
  });
}
