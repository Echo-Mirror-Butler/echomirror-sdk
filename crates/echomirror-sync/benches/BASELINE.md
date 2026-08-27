# SSE ingest pipeline — throughput/latency baseline

Established by `pipeline_bench.rs` and `cursor_store_bench.rs` (`cargo bench
-p echomirror-sync`), guarded on a schedule by
`.github/workflows/sync-bench.yml`. See those files' doc comments for what
each benchmark measures and why the suite is split the way it is.

Numbers below are from a local run (Apple Silicon, `--quick` criterion
profile) and exist to document the *method* and the current order of
magnitude — the CI job's numbers, gathered on a stable dedicated runner over
many scheduled runs, are the actual regression baseline. Re-run and update
this table whenever a genuine, intentional performance change lands (not
routine noise).

## Results

| Benchmark                       | Throughput        | Notes |
|----------------------------------|-------------------|-------|
| `parse_filter/100`               | ~965 Kelem/s       | JSON parse + `map_payment` + `SyncFilter::matches`, no I/O |
| `parse_filter/1000`              | ~972 Kelem/s       | |
| `parse_filter/10000`             | ~958 Kelem/s       | Flat across batch sizes — confirms this stage has no per-batch overhead worth amortizing |
| `cursor_store_in_memory_save`    | ~110 ns/op (~9M ops/s) | `InMemoryCursorStore::save` |
| `end_to_end_pipeline/100`        | ~57 Kelem/s         | Real `SyncEngine` + `HorizonFixture` SSE, per-event save via broadcast |
| `end_to_end_pipeline/500`        | ~73 Kelem/s         | |

## SLA (documented baseline)

- **Filtering/mapping**: sustains **≥900K events/sec** CPU-only, independent
  of batch size.
- **In-memory cursor persistence**: **≤200ns** per save at p100 (local run
  had zero variance-worthy tail; watch CI's stated percentile once it has
  enough scheduled runs to report one meaningfully).
- **End-to-end pipeline** (`SyncEngine` against the fixture transport):
  sustains **≥50K events/sec**. A CI run that drops meaningfully below this
  (see the workflow's `criterion --baseline` comparison) is a regression.

## Bottleneck analysis

The ~15x gap between `parse_filter` (~965K elem/s) and `end_to_end_pipeline`
(~57-73K elem/s) is **not** explained by filtering/mapping cost (it's the
cheapest stage measured, by a wide margin) or by cursor persistence (~110ns
per save is negligible next to a ~15-20µs per-event end-to-end budget at
these throughputs). By elimination, and consistent with `engine.rs`'s
structure, the gap is in the **SSE transport + broadcast layer**: each
`HorizonFixture.push_event()` call is one synchronous TCP write+flush per
record (not batched, unlike how Horizon actually streams), and each received
event does one `tokio::sync::broadcast` send/recv round-trip plus a
`tokio::select!` wakeup in the engine's consume loop.

This is a plausible real bottleneck, not just a benchmark artifact — the
same one-write-per-event and one-broadcast-send-per-event pattern is exactly
what production traffic would hit too, just via a real Horizon connection
instead of the fixture. It's the kind of finding this issue exists to
surface, not fix: see Echo-Mirror-Butler/echomirror-sdk#156 for the
follow-up investigating whether the SSE byte-stream parsing or the broadcast
channel itself is the larger of the two, and whether either is worth
optimizing given `DEFAULT_CHANNEL_CAPACITY` (1024) already gives subscribers
meaningful slack before lagging (the concern #124 raised).

## Backend coverage

- **In-memory**: always benchmarked.
- **Postgres**: benchmarked only with `--features postgres` and
  `DATABASE_URL` set (self-skips otherwise, mirroring
  `tests/postgres_store_tests.rs`).
- **Redis**: no `CursorStore` implementation exists yet (#128). Add a
  `bench_redis` function in `cursor_store_bench.rs` once it lands.
