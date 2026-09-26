# echomirror-sync

[![crates.io](https://img.shields.io/crates/v/echomirror-sync?color=ce422b&style=flat-square)](https://crates.io/crates/echomirror-sync)
[![docs.rs](https://img.shields.io/badge/docs.rs-echomirror--sync-ce422b?style=flat-square)](https://docs.rs/echomirror-sync)

The real-time blockchain sync engine of the
[EchoMirror SDK](https://github.com/Echo-Mirror-Butler/echomirror-sdk). It
streams Stellar operations over Horizon's SSE endpoints, keeps a resumable
cursor so a restart doesn't replay history, and backfills the gap when a
disconnect drops events.

```toml
[dependencies]
echomirror-sync = "0.1"
```

## What's in it

- `SyncEngine` — subscribe to a filtered stream of live events
- `SyncFilter` — filter by asset, counterparty, minimum amount, time window
- `SyncCursor` — ledger sequence + paging token, so sync resumes where it stopped
- Gap backfill and deduplication across reconnects
- Optional cursor persistence: `postgres` (feature) and `redis` (feature)
- Leader election, so several processes can sync the same account without
  duplicating work

```rust
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
use echomirror_sync::{SyncEngine, SyncFilter};

let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("your_api_key"))?;
let engine = SyncEngine::builder(&client)
    .watch("GPUBLIC_KEY")
    .filter(SyncFilter::new().asset("ECHO").min_amount(1.0))
    .build();

let mut stream = engine.subscribe();
while let Some(event) = stream.recv().await {
    println!("{event:?}");
}
```

## Features

| Feature | Default | Effect |
| --- | --- | --- |
| `postgres` | no | Persist cursors in PostgreSQL instead of memory |
| `redis` | no | Persist cursors in Redis instead of memory |
| `test-util` | no | Exposes `SyncEngine::crash_for_test` for leader-election tests |

## Notes

- MSRV: 1.85.
- This crate is where the sync throughput and reconnect behaviour is
  benchmarked — see `benches/` and the `sync-bench` / `sync-live-testnet` CI
  workflows.

## License

MIT — see the repository [LICENSE](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/LICENSE).
