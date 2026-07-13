class StellarBalance {
  final String xlm;
  final String echo;
  final String publicKey;
  final String network;
  final DateTime lastFetched;

  const StellarBalance({
    required this.xlm,
    required this.echo,
    required this.publicKey,
    required this.network,
    required this.lastFetched,
  });

  factory StellarBalance.fromJson(Map<String, dynamic> json) => StellarBalance(
        xlm: json['xlm'] as String,
        echo: json['echo'] as String,
        publicKey: json['public_key'] as String,
        network: json['network'] as String,
        lastFetched: DateTime.parse(json['last_fetched'] as String),
      );
}

class StellarTransaction {
  final String id;
  final String type;
  final String asset;
  final String amount;
  final String from;
  final String to;
  final String? memo;
  final DateTime createdAt;
  final String stellarTxHash;

  const StellarTransaction({
    required this.id,
    required this.type,
    required this.asset,
    required this.amount,
    required this.from,
    required this.to,
    this.memo,
    required this.createdAt,
    required this.stellarTxHash,
  });

  factory StellarTransaction.fromJson(Map<String, dynamic> json) =>
      StellarTransaction(
        id: json['id'] as String,
        type: json['type'] as String,
        asset: json['asset'] as String,
        amount: json['amount'] as String,
        from: json['from'] as String,
        to: json['to'] as String,
        memo: json['memo'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        stellarTxHash: json['stellar_tx_hash'] as String,
      );
}
