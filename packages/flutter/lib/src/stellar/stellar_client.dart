import 'dart:convert';
import 'package:http/http.dart' as http;
import '../echo_mirror.dart';
import 'stellar_models.dart';
import '../errors.dart';

class StellarClient {
  final SDKConfig config;

  StellarClient(this.config);

  Map<String, String> get _headers => {
        'x-api-key': config.apiKey,
        'x-echomirror-network': config.network.name,
        'content-type': 'application/json',
        if (config.authToken != null)
          'authorization': 'Bearer ${config.authToken}',
      };

  /// Get XLM and ECHO token balance for a Stellar public key.
  ///
  /// ```dart
  /// final balance = await EchoMirror.instance.stellar.getBalance(publicKey);
  /// print('${balance.xlm} XLM  •  ${balance.echo} ECHO');
  /// ```
  Future<StellarBalance> getBalance(String publicKey) async {
    final res = await config.httpClient.get(
      Uri.parse('${config.baseUrl}/stellar/balance/$publicKey'),
      headers: _headers,
    );
    _checkStatus(res);
    return StellarBalance.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Fund a testnet account using Stellar Friendbot.
  /// Only works on testnet.
  ///
  /// ```dart
  /// await EchoMirror.instance.stellar.fundTestnetAccount(publicKey);
  /// ```
  Future<void> fundTestnetAccount(String publicKey) async {
    if (config.network != StellarNetwork.testnet) {
      throw const EchoMirrorError(
          'fundTestnetAccount is only available on testnet');
    }
    final res = await config.httpClient.post(
      Uri.parse('${config.baseUrl}/stellar/friendbot'),
      headers: _headers,
      body: jsonEncode({'public_key': publicKey}),
    );
    _checkStatus(res);
  }

  /// Get paginated transaction history for a public key.
  Future<List<StellarTransaction>> getTransactionHistory(
    String publicKey, {
    int limit = 20,
    String? cursor,
  }) async {
    var url =
        '${config.baseUrl}/stellar/transactions?public_key=$publicKey&limit=$limit';
    if (cursor != null) url += '&cursor=$cursor';

    final res = await config.httpClient.get(Uri.parse(url), headers: _headers);
    _checkStatus(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['transactions'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(StellarTransaction.fromJson)
        .toList();
  }

  void _checkStatus(http.Response res) {
    if (res.statusCode == 401) throw const EchoMirrorAuthError();
    if (res.statusCode == 429) throw const EchoMirrorRateLimitError();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw EchoMirrorError('HTTP ${res.statusCode}: ${res.body}');
    }
  }
}
