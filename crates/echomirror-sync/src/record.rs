use crate::filter::SyncRecord;
use chrono::{DateTime, Utc};
use echomirror_core::{StellarTransaction, TransactionType};
use echomirror_stellar::HorizonPaymentRecord;

/// A payment record mapped into the SDK's event shape.
pub struct MappedPayment {
    pub tx: StellarTransaction,
    pub sync_record: SyncRecord,
}

/// Outcome of mapping one Horizon payment record.
pub enum MapOutcome {
    Mapped(Box<MappedPayment>),
    /// Operation intentionally skipped: no transferable amount
    /// (`account_merge`), an unrecognized operation type, or a failed
    /// transaction included by Horizon.
    Skipped,
}

/// Parse a Horizon operation paging token (a decimal TOID, possibly with a
/// `-suffix`) into a numeric value for monotonic comparison.
pub fn parse_paging_token(token: &str) -> Option<u64> {
    let digits = token.split('-').next().unwrap_or(token);
    digits.parse::<u64>().ok()
}

/// Recover the ledger sequence from a TOID: the high 32 bits.
pub fn ledger_from_token(token: u64) -> u32 {
    (token >> 32) as u32
}

/// Map a Horizon `/payments` record into a `StellarTransaction` + `SyncRecord`.
///
/// `watched_account` decides the Send/Receive direction. Returns an error
/// string when a record that should carry payment fields is missing them.
pub fn map_payment(
    record: &HorizonPaymentRecord,
    watched_account: &str,
) -> Result<MapOutcome, String> {
    if !record.transaction_successful {
        return Ok(MapOutcome::Skipped);
    }

    let (from, to, amount, asset) =
        match record.op_type.as_str() {
            "payment" | "path_payment_strict_send" | "path_payment_strict_receive" => {
                let from = record.from.clone().ok_or_else(|| {
                    format!("{} record {} missing `from`", record.op_type, record.id)
                })?;
                let to = record.to.clone().ok_or_else(|| {
                    format!("{} record {} missing `to`", record.op_type, record.id)
                })?;
                let amount = record.amount.clone().ok_or_else(|| {
                    format!("{} record {} missing `amount`", record.op_type, record.id)
                })?;
                let asset = match record.asset_type.as_deref() {
                    Some("native") | None => "XLM".to_string(),
                    Some(_) => record.asset_code.clone().unwrap_or_else(|| "XLM".into()),
                };
                (from, to, amount, asset)
            }
            "create_account" => {
                let from = record.funder.clone().ok_or_else(|| {
                    format!("create_account record {} missing `funder`", record.id)
                })?;
                let to = record.account.clone().ok_or_else(|| {
                    format!("create_account record {} missing `account`", record.id)
                })?;
                let amount = record.starting_balance.clone().ok_or_else(|| {
                    format!(
                        "create_account record {} missing `starting_balance`",
                        record.id
                    )
                })?;
                (from, to, amount, "XLM".to_string())
            }
            // account_merge transfers an unknown remaining balance — skip it.
            "account_merge" => return Ok(MapOutcome::Skipped),
            _ => return Ok(MapOutcome::Skipped),
        };

    let token = parse_paging_token(&record.paging_token)
        .ok_or_else(|| format!("record {} has unparseable paging_token", record.id))?;
    let ledger_sequence = record
        .transaction
        .as_ref()
        .map(|t| t.ledger)
        .unwrap_or_else(|| ledger_from_token(token));
    let memo = record.transaction.as_ref().and_then(|t| t.memo.clone());

    let created_at: DateTime<Utc> = record
        .created_at
        .parse()
        .map_err(|e| format!("record {} has invalid created_at: {e}", record.id))?;

    let amount_f64 = amount
        .parse::<f64>()
        .map_err(|e| format!("record {} has invalid amount: {e}", record.id))?;

    let tx_type = if from == watched_account {
        TransactionType::Send
    } else {
        TransactionType::Receive
    };

    let tx = StellarTransaction {
        id: record.id.clone(),
        tx_type,
        asset: asset.clone(),
        amount,
        from: from.clone(),
        to: to.clone(),
        memo: memo.clone(),
        created_at,
        stellar_tx_hash: record.transaction_hash.clone(),
        ledger_sequence: Some(ledger_sequence),
    };

    let sync_record = SyncRecord {
        from,
        to,
        asset_code: asset,
        amount: amount_f64,
        memo,
        paging_token: record.paging_token.clone(),
        ledger_sequence,
    };

    Ok(MapOutcome::Mapped(Box::new(MappedPayment {
        tx,
        sync_record,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use echomirror_stellar::HorizonJoinedTransaction;

    fn base_record() -> HorizonPaymentRecord {
        serde_json::from_value(serde_json::json!({
            "id": "12884905986",
            "paging_token": "12884905986",
            "transaction_successful": true,
            "source_account": "GSOURCE",
            "type": "payment",
            "created_at": "2026-07-20T21:10:30Z",
            "transaction_hash": "abc123",
            "asset_type": "credit_alphanum4",
            "asset_code": "ECHO",
            "asset_issuer": "GISSUER",
            "from": "GSENDER",
            "to": "GRECEIVER",
            "amount": "42.5000000"
        }))
        .unwrap()
    }

    #[test]
    fn maps_echo_payment_with_direction() {
        let record = base_record();
        let MapOutcome::Mapped(mapped) = map_payment(&record, "GSENDER").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.tx.tx_type, TransactionType::Send);
        assert_eq!(mapped.tx.asset, "ECHO");
        assert_eq!(mapped.sync_record.amount, 42.5);

        let MapOutcome::Mapped(mapped) = map_payment(&record, "GRECEIVER").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.tx.tx_type, TransactionType::Receive);
    }

    #[test]
    fn native_asset_maps_to_xlm() {
        let mut record = base_record();
        record.asset_type = Some("native".into());
        record.asset_code = None;
        let MapOutcome::Mapped(mapped) = map_payment(&record, "GSENDER").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.tx.asset, "XLM");
    }

    #[test]
    fn maps_create_account_as_xlm_transfer() {
        let record: HorizonPaymentRecord = serde_json::from_value(serde_json::json!({
            "id": "12884905985",
            "paging_token": "12884905985",
            "transaction_successful": true,
            "source_account": "GFUNDER",
            "type": "create_account",
            "created_at": "2026-07-20T21:09:30Z",
            "transaction_hash": "def456",
            "funder": "GFUNDER",
            "account": "GNEW",
            "starting_balance": "10000.0000000"
        }))
        .unwrap();
        let MapOutcome::Mapped(mapped) = map_payment(&record, "GNEW").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.tx.tx_type, TransactionType::Receive);
        assert_eq!(mapped.tx.asset, "XLM");
        assert_eq!(mapped.sync_record.amount, 10000.0);
    }

    #[test]
    fn skips_account_merge_and_failed_txs() {
        let mut record = base_record();
        record.op_type = "account_merge".into();
        assert!(matches!(
            map_payment(&record, "GSENDER").unwrap(),
            MapOutcome::Skipped
        ));

        let mut record = base_record();
        record.transaction_successful = false;
        assert!(matches!(
            map_payment(&record, "GSENDER").unwrap(),
            MapOutcome::Skipped
        ));
    }

    #[test]
    fn missing_amount_is_a_parse_error() {
        let mut record = base_record();
        record.amount = None;
        assert!(map_payment(&record, "GSENDER").is_err());
    }

    #[test]
    fn ledger_from_joined_tx_beats_toid_decode() {
        let mut record = base_record();
        record.transaction = Some(HorizonJoinedTransaction {
            ledger: 777,
            memo: Some("gift:starlight".into()),
        });
        let MapOutcome::Mapped(mapped) = map_payment(&record, "GSENDER").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.sync_record.ledger_sequence, 777);
        assert_eq!(mapped.sync_record.memo.as_deref(), Some("gift:starlight"));
    }

    #[test]
    fn toid_decode_fallback() {
        // TOID 12884905985 >> 32 == ledger 3
        let record = base_record();
        let MapOutcome::Mapped(mapped) = map_payment(&record, "GSENDER").unwrap() else {
            panic!("expected Mapped");
        };
        assert_eq!(mapped.sync_record.ledger_sequence, 3);
    }

    #[test]
    fn paging_token_parses_numerically_and_with_suffix() {
        assert_eq!(parse_paging_token("12884905986"), Some(12884905986));
        assert_eq!(parse_paging_token("12884905986-1"), Some(12884905986));
        assert_eq!(parse_paging_token("now"), None);
        // numeric, not lexical: "999" < "1000"
        assert!(parse_paging_token("999").unwrap() < parse_paging_token("1000").unwrap());
    }
}
