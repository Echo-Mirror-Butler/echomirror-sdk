# echomirror-stellar

[![crates.io](https://img.shields.io/crates/v/echomirror-stellar?color=ce422b&style=flat-square)](https://crates.io/crates/echomirror-stellar)
[![docs.rs](https://img.shields.io/badge/docs.rs-echomirror--stellar-ce422b?style=flat-square)](https://docs.rs/echomirror-stellar)

The Stellar payments path of the [EchoMirror SDK](https://github.com/Echo-Mirror-Butler/echomirror-sdk):
balances, Friendbot testnet funding, transaction building/submission, and a
thin typed wrapper over the Horizon REST API.

```toml
[dependencies]
echomirror-stellar = "0.1"
```

## What's in it

| Function | Purpose |
| --- | --- |
| `get_balance` | XLM and ECHO balances for a public key, derived from Horizon directly (no EchoMirror API round-trip) |
| `fund_testnet_account` | Friendbot funding — testnet only, returns `Config` on mainnet |
| `build_echo_transfer` | Builds an unsigned ECHO transfer; returns the XDR to sign |
| `submit_transaction` | Submits a pre-signed XDR envelope |
| `get_transaction_history` | Paginated transaction history through the EchoMirror API |
| `HorizonClient` | `account_balances`, `get_transactions`, `get_payments`, with `new` / `mainnet` / `testnet` constructors and Horizon URL overrides for self-hosted nodes |

```rust
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
use echomirror_stellar::{build_echo_transfer, EchoTransferParams};

let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("your_api_key"))?;
let unsigned = build_echo_transfer(&client, EchoTransferParams {
    from: "GSENDER".into(),
    to: "GRECIPIENT".into(),
    amount: 5.0,
    memo: Some("Great work today!".into()),
}).await?;

// Hand `unsigned.xdr` to Freighter, or sign it with `stellar_sdk::Keypair`.
println!("Sign this XDR: {}", unsigned.xdr);
```

## Notes

- MSRV: 1.85.
- Horizon and Friendbot base URLs are configurable
  (`EchoMirrorConfig::with_horizon_url` / `with_friendbot_url`) so the whole
  crate can be pointed at a local fixture — its own test suite is fully offline
  on that basis.
- Transactions are returned unsigned by design: signing belongs to the caller's
  key custody, not to this crate.

## License

MIT — see the repository [LICENSE](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/LICENSE).
