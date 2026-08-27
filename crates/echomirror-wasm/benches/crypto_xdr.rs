// Criterion benchmarks for the crypto and XDR-heavy operations in
// echomirror-wasm. These run against the native (non-WASM) target so that
// `cargo bench` works without a browser or Node runtime. The WASM numbers
// are captured separately via the wasm-bindgen-test harness in
// tests/bench_wasm.rs — see the "Running benchmarks" section in
// packages/js/wasm/BENCHMARKS.md.
//
// To run (from repo root):
//   cargo bench -p echomirror-wasm
//
// To compare SIMD vs scalar builds on native:
//   RUSTFLAGS="-C target-feature=+avx2" cargo bench -p echomirror-wasm
//   cargo bench -p echomirror-wasm  # scalar baseline
//
// The WASM-specific SIMD path (simd128) is enabled via the `simd` Cargo
// feature when wasm-pack builds the crate with RUSTFLAGS="-C target-feature=+simd128".
// See scripts/build.mjs for how both builds are produced side-by-side.

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use echomirror_wasm::bench::{
    bench_base64_decode, bench_base64_encode, bench_hash_many, bench_hash_single,
    bench_memo_encode, bench_xdr_batch_hash, bench_xdr_decode, bench_xdr_round_trip,
};

// ── SHA-256 hashing ───────────────────────────────────────────────────────────

fn sha256_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("sha256");

    // Single short key (the most common call-site: hashPublicKey)
    group.throughput(Throughput::Elements(1));
    group.bench_function("single_public_key", |b| b.iter(|| bench_hash_single()));

    // Batch: simulate hashing a stream of XDR payloads for analytics
    for batch_size in [100u64, 1_000, 10_000] {
        group.throughput(Throughput::Elements(batch_size));
        group.bench_with_input(
            BenchmarkId::new("batch", batch_size),
            &batch_size,
            |b, &n| b.iter(|| bench_hash_many(n as usize)),
        );
    }

    group.finish();
}

// ── Base64 encode / decode ────────────────────────────────────────────────────

fn base64_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("base64");

    // Memo-sized (≤28 bytes) — the hot path for encode_memo
    for len in [8usize, 28] {
        group.throughput(Throughput::Bytes(len as u64));
        group.bench_with_input(
            BenchmarkId::new("encode_memo_sized", len),
            &len,
            |b, &n| b.iter(|| bench_memo_encode(n)),
        );
    }

    // XDR-sized — a Stellar transaction envelope is typically 200–800 bytes
    for len in [256usize, 512, 1024] {
        group.throughput(Throughput::Bytes(len as u64));
        group.bench_with_input(
            BenchmarkId::new("encode", len),
            &len,
            |b, &n| b.iter(|| bench_base64_encode(n)),
        );
        group.bench_with_input(
            BenchmarkId::new("decode", len),
            &len,
            |b, &n| b.iter(|| bench_base64_decode(n)),
        );
    }

    group.finish();
}

// ── XDR (StellarTxBytes) ──────────────────────────────────────────────────────

fn xdr_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("xdr");

    // Decode a base64-encoded XDR blob into raw bytes
    for len in [128usize, 512, 1024] {
        group.throughput(Throughput::Bytes(len as u64));
        group.bench_with_input(
            BenchmarkId::new("decode_bytes", len),
            &len,
            |b, &n| b.iter(|| bench_xdr_decode(n)),
        );
    }

    // Round-trip: decode XDR + SHA-256 the result (the most common combined call)
    for len in [128usize, 512, 1024] {
        group.throughput(Throughput::Bytes(len as u64));
        group.bench_with_input(
            BenchmarkId::new("decode_and_sha256", len),
            &len,
            |b, &n| b.iter(|| bench_xdr_round_trip(n)),
        );
    }

    // Batch: process a stream of XDR payloads (simulates sync pipeline)
    for batch_size in [100u64, 1_000] {
        group.throughput(Throughput::Elements(batch_size));
        group.bench_with_input(
            BenchmarkId::new("batch_sha256", batch_size),
            &batch_size,
            |b, &n| b.iter(|| bench_xdr_batch_hash(n as usize)),
        );
    }

    group.finish();
}

criterion_group!(benches, sha256_benchmarks, base64_benchmarks, xdr_benchmarks);
criterion_main!(benches);
