-- Leader-election leases for echomirror-sync's PgLeaderElector.
-- One row per watched account; upserted on every acquire/renew attempt so
-- only one instance's holder_id is valid at a time. A crashed holder simply
-- stops renewing — its row's expires_at lapses and any other instance's next
-- attempt takes the row over, no clean release required.
CREATE TABLE IF NOT EXISTS echomirror_sync_leases (
    account     TEXT PRIMARY KEY,
    holder_id   TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL
);
