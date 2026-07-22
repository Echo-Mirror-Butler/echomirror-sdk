// ── Sync cursor ───────────────────────────────────────────────────────────────

class SyncCursor {
  final int ledgerSequence;
  final String pagingToken;
  final DateTime lastSyncedAt;
  final int totalProcessed;

  const SyncCursor({
    required this.ledgerSequence,
    required this.pagingToken,
    required this.lastSyncedAt,
    required this.totalProcessed,
  });

  factory SyncCursor.genesis() => SyncCursor(
        ledgerSequence: 0,
        pagingToken: 'now',
        lastSyncedAt: DateTime.now(),
        totalProcessed: 0,
      );

  Map<String, dynamic> toJson() => {
        'ledger_sequence': ledgerSequence,
        'paging_token': pagingToken,
        'last_synced_at': lastSyncedAt.toIso8601String(),
        'total_processed': totalProcessed,
      };

  factory SyncCursor.fromJson(Map<String, dynamic> json) => SyncCursor(
        ledgerSequence: json['ledger_sequence'] as int,
        pagingToken: json['paging_token'] as String,
        lastSyncedAt: DateTime.parse(json['last_synced_at'] as String),
        totalProcessed: json['total_processed'] as int,
      );
}

// ── Sync events ───────────────────────────────────────────────────────────────

abstract class SyncEventBase {
  const SyncEventBase();
}

class TransactionSyncEvent extends SyncEventBase {
  final String txId;
  final String from;
  final String to;
  final String asset;
  final String amount;
  final String? memo;
  final int ledgerSequence;
  final String pagingToken;

  const TransactionSyncEvent({
    required this.txId,
    required this.from,
    required this.to,
    required this.asset,
    required this.amount,
    this.memo,
    required this.ledgerSequence,
    required this.pagingToken,
  });
}

class LedgerSyncEvent extends SyncEventBase {
  final int ledgerSequence;
  final String txHash;
  final String pagingToken;

  const LedgerSyncEvent({
    required this.ledgerSequence,
    required this.txHash,
    required this.pagingToken,
  });
}

class ErrorSyncEvent extends SyncEventBase {
  final String message;
  const ErrorSyncEvent({required this.message});
}

class SyncStartedEvent extends SyncEventBase {
  final int fromLedger;
  const SyncStartedEvent({required this.fromLedger});
}

class SyncCompletedEvent extends SyncEventBase {
  final int totalProcessed;
  const SyncCompletedEvent({required this.totalProcessed});
}

// ── Filter ────────────────────────────────────────────────────────────────────

class SyncFilter {
  final String? account;
  final String? assetCode;
  final double? minAmount;
  final String? memoPrefix;

  const SyncFilter({
    this.account,
    this.assetCode,
    this.minAmount,
    this.memoPrefix,
  });

  bool matches(_MatchableRecord record) {
    if (account != null && record.from != account && record.to != account)
      return false;
    if (assetCode != null && record.assetCode != assetCode) return false;
    if (minAmount != null && record.amount < minAmount!) return false;
    if (memoPrefix != null && !(record.memo?.startsWith(memoPrefix!) ?? false))
      return false;
    return true;
  }
}

class _MatchableRecord {
  final String from;
  final String to;
  final String assetCode;
  final double amount;
  final String? memo;

  const _MatchableRecord({
    required this.from,
    required this.to,
    required this.assetCode,
    required this.amount,
    this.memo,
  });
}
