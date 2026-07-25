-- Sync cursor persistence for echomirror-sync's PgCursorStore.
-- One row per watched account; upserted after every processed record/page.
CREATE TABLE IF NOT EXISTS echomirror_sync_cursors (
    account          TEXT PRIMARY KEY,
    -- u32 range; INTEGER (i32) would overflow at ledger 2^31
    ledger_sequence  BIGINT      NOT NULL,
    paging_token     TEXT        NOT NULL,
    last_synced_at   TIMESTAMPTZ NOT NULL,
    total_processed  BIGINT      NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
