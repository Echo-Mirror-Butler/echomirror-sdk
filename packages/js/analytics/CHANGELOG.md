# @echomirror/analytics

## 0.1.0 — 2026-08-19

### Added

- Initial release of `@echomirror/analytics`
- `AnalyticsClient` — privacy-safe emotional UX event tracker; no PII by default
- `track(event, properties)` — fire-and-forget event emission with local queue + flush
- `aggregate(events)` — client-side aggregation (counts, averages, percentiles) before upload
- Configurable transports: `HttpTransport` (batched POST) and `NoopTransport` (testing)
- `PrivacyFilter` — strip or hash any property keys matching a configurable deny-list
- `LocalStorageQueue` — persists unsent events across page reloads; configurable max size
- Fully standalone — zero dependencies on other `@echomirror/*` packages
- ESM-only build (`"type": "module"`)
