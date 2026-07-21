---
sidebar_position: 4
---

# Rust Quickstart

For server-side Rust backends - no FFI boundary, direct access to the full core.

## Install

```bash
cargo add echomirror-core echomirror-stellar echomirror-sync
```

## Full example

```rust
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
use echomirror_stellar::{get_balance, fund_testnet_account};
use echomirror_sync::{SyncEngine, SyncFilter};

#[tokio::main]
async fn main() {
    let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("your_api_key")).unwrap();
    client.set_auth_token(Some("user_jwt".into())).await;

    // Get Stellar balance (queries Horizon directly - no API round-trip)
    let balance = get_balance(&client, "GPUBLIC_KEY").await.unwrap();
    println!("{} XLM  -  {} ECHO", balance.xlm, balance.echo);

    // Stream real-time blockchain events
    let engine = SyncEngine::builder(&client)
        .watch("GPUBLIC_KEY")
        .filter(SyncFilter::new().asset("ECHO").min_amount(1.0))
        .build();

    let mut stream = engine.clone().subscribe();
    engine.start();

    while let Ok(event) = stream.recv().await {
        println!("{:?}", event);
    }
}
```

## Next steps

- [Core Concepts](../core-concepts) - how the sync engine's resumable cursors work, and how to persist them with a custom `CursorStore`
- Rust API Reference (linked from the sidebar) for the full crate documentation
