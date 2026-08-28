/*!
# echomirror-wasm

Rust SDK compiled to WebAssembly. Provides high-performance crypto operations,
XDR transaction serialization, and balance verification directly in the browser or Node.js —
without any server round-trip.

## Build

This crate isn't published on its own — see the `@echomirror/wasm` npm package at
`packages/js/wasm`, which builds it for both the `web` and `nodejs` wasm-pack targets
and wraps the raw output in an ergonomic TypeScript API:

```sh
npm run build:wasm -w packages/js/wasm
```

The build script produces two builds side-by-side:
- `wasm-web/` and `wasm-node/` — scalar (baseline), always compatible
- `wasm-web-simd/` and `wasm-node-simd/` — SIMD128, for supporting runtimes

See `packages/js/wasm/BENCHMARKS.md` for the measured before/after numbers.

## Usage from JavaScript

```js
import { init, verifyMoodScore, hashPublicKey } from '@echomirror/wasm'
await init()

const hash = hashPublicKey('GPUBLIC_KEY')
const valid = verifyMoodScore(7)
```
*/

use wasm_bindgen::prelude::*;

#[cfg(feature = "console_error_panic_hook")]
pub use console_error_panic_hook::set_once as set_panic_hook;

// ── Init ──────────────────────────────────────────────────────────────────────

#[wasm_bindgen(start)]
pub fn init_wasm() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// ── Mood ──────────────────────────────────────────────────────────────────────

/// Pure validation, kept free of `JsValue` so it can run under native
/// `cargo test` — `JsValue` construction is only implemented on a real
/// wasm32 target and aborts the process if exercised natively.
fn validate_mood_score(score: u8) -> Result<(), &'static str> {
    if (1..=10).contains(&score) {
        Ok(())
    } else {
        Err("score must be between 1 and 10")
    }
}

/// Validate a mood score (must be 1–10).
#[wasm_bindgen]
pub fn verify_mood_score(score: u8) -> bool {
    validate_mood_score(score).is_ok()
}

// ── Crypto / Stellar ──────────────────────────────────────────────────────────

/// Compute a SHA-256 digest. On WASM targets built with `target-feature=+simd128`
/// (activated by the `simd` Cargo feature), sha2's SIMD backend is selected
/// automatically by the compiler — no manual dispatch needed. The same
/// function signature is used in both builds; the ABI exposed to JS is
/// unchanged.
pub(crate) fn sha256_hex(input: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input);
    hex::encode(hasher.finalize())
}

/// SHA-256 hash of a Stellar public key, returned as lowercase hex.
/// Used for anonymous analytics — never stored as a raw key.
#[wasm_bindgen]
pub fn hash_public_key(public_key: &str) -> String {
    sha256_hex(public_key.as_bytes())
}

/// Verify that a string looks like a valid Stellar G-address (ed25519 public key).
/// This is a format check only — does not verify the key exists on-chain.
#[wasm_bindgen]
pub fn is_valid_stellar_address(address: &str) -> bool {
    if !address.starts_with('G') || address.len() != 56 {
        return false;
    }
    address.chars().all(|c| c.is_ascii_alphanumeric())
}

fn validate_memo(text: &str) -> Result<(), &'static str> {
    if text.len() > 28 {
        Err("Memo must be 28 bytes or fewer")
    } else {
        Ok(())
    }
}

/// Encode a string as base64 (useful for XDR memo fields).
#[wasm_bindgen]
pub fn encode_memo(text: &str) -> Result<String, JsValue> {
    validate_memo(text).map_err(JsValue::from_str)?;
    Ok(base64_encode(text.as_bytes()))
}

/// Decode a base64 string into raw bytes. Returns `None` on malformed input.
pub(crate) fn base64_decode(input: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    let stripped = input.trim_end_matches('=');
    let bytes = stripped.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4 + 3);
    let mut chunks = bytes.chunks(4);
    for chunk in &mut chunks {
        let mut acc: u32 = 0;
        for (i, &c) in chunk.iter().enumerate() {
            acc |= val(c)? << (18 - i * 6);
        }
        out.push((acc >> 16) as u8);
        if chunk.len() > 2 {
            out.push((acc >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(acc as u8);
        }
    }
    Some(out)
}

pub(crate) fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() {
            input[i + 1] as u32
        } else {
            0
        };
        let b2 = if i + 2 < input.len() {
            input[i + 2] as u32
        } else {
            0
        };
        out.push(CHARS[((b0 >> 2) & 0x3f) as usize] as char);
        out.push(CHARS[(((b0 & 0x3) << 4) | (b1 >> 4)) as usize] as char);
        out.push(if i + 1 < input.len() {
            CHARS[(((b1 & 0xf) << 2) | (b2 >> 6)) as usize] as char
        } else {
            '='
        });
        out.push(if i + 2 < input.len() {
            CHARS[(b2 & 0x3f) as usize] as char
        } else {
            '='
        });
        i += 3;
    }
    out
}

// ── Sync cursor ───────────────────────────────────────────────────────────────

/// Serialize a sync cursor to JSON string (for localStorage persistence in browsers).
#[wasm_bindgen]
pub fn serialize_cursor(ledger_sequence: u32, paging_token: &str, total_processed: f64) -> String {
    format!(
        r#"{{"ledger_sequence":{},"paging_token":"{}","total_processed":{}}}"#,
        ledger_sequence, paging_token, total_processed as u64
    )
}

/// Parse a serialized cursor JSON string, returning the paging_token field.
#[wasm_bindgen]
pub fn parse_cursor_paging_token(cursor_json: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(cursor_json).ok()?;
    v["paging_token"].as_str().map(|s| s.to_string())
}

// ── Mood buffer ───────────────────────────────────────────────────────────────
//
// This type owns a `Vec<u8>` in wasm linear memory. wasm-bindgen generates a
// `free()` method for it — the JS side MUST call `.free()` (or let the
// hand-written TS wrapper's `Symbol.dispose`/FinalizationRegistry do it) when
// done, or the backing allocation leaks for the lifetime of the wasm instance.

/// A growable buffer of mood scores (1–10) held in wasm linear memory.
///
/// Must be freed from JS via `.free()` once no longer needed — this struct
/// does not implement any automatic cleanup on its own.
#[wasm_bindgen]
pub struct MoodBuffer {
    scores: Vec<u8>,
}

#[wasm_bindgen]
impl MoodBuffer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MoodBuffer {
        MoodBuffer { scores: Vec::new() }
    }

    /// Append a mood score. Errors if out of the valid 1–10 range.
    pub fn push(&mut self, score: u8) -> Result<(), JsValue> {
        validate_mood_score(score).map_err(JsValue::from_str)?;
        self.scores.push(score);
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.scores.len()
    }

    pub fn is_empty(&self) -> bool {
        self.scores.is_empty()
    }

    pub fn average(&self) -> f64 {
        if self.scores.is_empty() {
            return 0.0;
        }
        self.scores.iter().map(|&s| s as f64).sum::<f64>() / self.scores.len() as f64
    }

    /// Copy the buffer contents out as a fresh, JS-owned `Uint8Array`.
    /// The returned bytes are independent of this buffer — freeing this
    /// `MoodBuffer` afterwards does not affect them.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.scores.clone()
    }
}

impl Default for MoodBuffer {
    fn default() -> Self {
        Self::new()
    }
}

// ── Stellar transaction bytes ───────────────────────────────────────────────
//
// Same ownership contract as `MoodBuffer`: this struct holds a `Vec<u8>` of
// raw XDR bytes in wasm memory and must be freed via `.free()` from JS.

/// Raw Stellar transaction envelope bytes, decoded from a base64 XDR string.
///
/// Must be freed from JS via `.free()` once no longer needed.
#[wasm_bindgen]
pub struct StellarTxBytes {
    bytes: Vec<u8>,
}

#[wasm_bindgen]
impl StellarTxBytes {
    /// Decode a base64-encoded XDR transaction envelope.
    #[wasm_bindgen(constructor)]
    pub fn new(xdr_base64: &str) -> Result<StellarTxBytes, JsValue> {
        let bytes =
            base64_decode(xdr_base64).ok_or_else(|| JsValue::from_str("invalid base64 XDR"))?;
        Ok(StellarTxBytes { bytes })
    }

    pub fn len(&self) -> usize {
        self.bytes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }

    /// SHA-256 hash of the raw envelope bytes, as lowercase hex.
    pub fn sha256(&self) -> String {
        sha256_hex(&self.bytes)
    }

    /// Copy the raw bytes out as a fresh, JS-owned `Uint8Array`.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }
}

// ── Benchmark helpers (pub for criterion benches, not exposed to JS) ──────────

/// Benchmark-only helpers. These are compiled into the native rlib but are
/// NOT exported via wasm-bindgen and therefore never appear in the generated
/// JS/TS glue. They live here — rather than in a separate `benches/` helper
/// file — so they exercise exactly the same internal functions the WASM
/// export paths call.
///
/// On wasm32 targets the module is gated behind `test` / `bench-helpers` to
/// avoid bloating the WASM binary with unused code. On native targets it is
/// always compiled so `cargo bench` can reach it without any feature flags.
#[cfg(any(not(target_arch = "wasm32"), test, feature = "bench-helpers"))]
pub mod bench {
    use super::*;

    const SAMPLE_KEY: &str = "GPUBLIC_KEY_ECHOMIRROR_BENCH_FIXTURE_00000000000000";

    /// Hash one representative Stellar public key.
    #[inline]
    pub fn bench_hash_single() -> String {
        sha256_hex(SAMPLE_KEY.as_bytes())
    }

    /// Hash `n` public keys, simulating an analytics batch.
    #[inline]
    pub fn bench_hash_many(n: usize) -> Vec<String> {
        (0..n)
            .map(|i| {
                let key = format!("GPUBLIC_KEY_BENCH_{:032}", i);
                sha256_hex(key.as_bytes())
            })
            .collect()
    }

    /// Base64-encode `n` bytes of synthetic payload (memo-sized up to XDR-sized).
    #[inline]
    pub fn bench_base64_encode(len: usize) -> String {
        let data: Vec<u8> = (0..len).map(|i| (i & 0xff) as u8).collect();
        base64_encode(&data)
    }

    /// Base64-decode a pre-encoded blob of `len` bytes.
    #[inline]
    pub fn bench_base64_decode(len: usize) -> Vec<u8> {
        let data: Vec<u8> = (0..len).map(|i| (i & 0xff) as u8).collect();
        let encoded = base64_encode(&data);
        base64_decode(&encoded).expect("valid base64")
    }

    /// Encode a memo of exactly `len` bytes.
    #[inline]
    pub fn bench_memo_encode(len: usize) -> String {
        let text = "x".repeat(len.min(28));
        base64_encode(text.as_bytes())
    }

    /// Decode a synthetic XDR blob of `len` bytes.
    #[inline]
    pub fn bench_xdr_decode(len: usize) -> StellarTxBytes {
        let raw: Vec<u8> = (0..len).map(|i| (i & 0xff) as u8).collect();
        let encoded = base64_encode(&raw);
        StellarTxBytes {
            bytes: base64_decode(&encoded).expect("valid"),
        }
    }

    /// Decode a synthetic XDR blob of `len` bytes, then SHA-256 the result —
    /// the combined hot path called for every processed Stellar transaction.
    #[inline]
    pub fn bench_xdr_round_trip(len: usize) -> String {
        let tx = bench_xdr_decode(len);
        sha256_hex(&tx.bytes)
    }

    /// Batch: decode + hash `n` synthetic XDR payloads (512 bytes each).
    #[inline]
    pub fn bench_xdr_batch_hash(n: usize) -> Vec<String> {
        (0..n).map(|_| bench_xdr_round_trip(512)).collect()
    }
}

// ── wasm-bindgen-test benchmarks ──────────────────────────────────────────────
//
// These run in a real WASM runtime (browser via `wasm-pack test --chrome` or
// Node via `wasm-pack test --node`) and time the actual JS↔WASM call overhead
// on top of the Rust execution time. Run them via:
//
//   # Node (fast, no browser needed):
//   wasm-pack test --node crates/echomirror-wasm
//
//   # SIMD build (pass the feature flag through RUSTFLAGS):
//   RUSTFLAGS="-C target-feature=+simd128" wasm-pack test --node crates/echomirror-wasm
//
// Each test logs a wall-clock time per iteration to the console so the
// numbers can be captured manually or by the build script.
#[cfg(target_arch = "wasm32")]
#[cfg(test)]
mod wasm_bench {
    use wasm_bindgen::prelude::*;
    use wasm_bindgen_test::*;

    // Allow the tests to run in both browser and Node without a server.
    wasm_bindgen_test_configure!(run_in_browser);

    use super::*;

    /// Number of iterations per timed loop — large enough to smooth over
    /// WASM JIT warm-up variance, small enough to finish in < 5 s.
    const ITERS: usize = 50_000;

    fn now_ms() -> f64 {
        js_sys::Date::now()
    }

    #[wasm_bindgen_test]
    fn bench_hash_public_key() {
        let start = now_ms();
        for _ in 0..ITERS {
            let _ = hash_public_key("GPUBLIC_KEY_ECHOMIRROR_BENCH_FIXTURE_00000000000000");
        }
        let elapsed = now_ms() - start;
        web_sys::console::log_1(
            &format!(
                "[bench] hash_public_key: {:.2} µs/iter  ({} iters, {:.0} ms total)",
                (elapsed * 1000.0) / ITERS as f64,
                ITERS,
                elapsed,
            )
            .into(),
        );
    }

    #[wasm_bindgen_test]
    fn bench_base64_encode_512() {
        let data: Vec<u8> = (0..512u16).map(|i| (i & 0xff) as u8).collect();
        let start = now_ms();
        for _ in 0..ITERS {
            let _ = base64_encode(&data);
        }
        let elapsed = now_ms() - start;
        web_sys::console::log_1(
            &format!(
                "[bench] base64_encode(512 B): {:.2} µs/iter  ({} iters, {:.0} ms total)",
                (elapsed * 1000.0) / ITERS as f64,
                ITERS,
                elapsed,
            )
            .into(),
        );
    }

    #[wasm_bindgen_test]
    fn bench_base64_decode_512() {
        let data: Vec<u8> = (0..512u16).map(|i| (i & 0xff) as u8).collect();
        let encoded = base64_encode(&data);
        let start = now_ms();
        for _ in 0..ITERS {
            let _ = base64_decode(&encoded);
        }
        let elapsed = now_ms() - start;
        web_sys::console::log_1(
            &format!(
                "[bench] base64_decode(512 B): {:.2} µs/iter  ({} iters, {:.0} ms total)",
                (elapsed * 1000.0) / ITERS as f64,
                ITERS,
                elapsed,
            )
            .into(),
        );
    }

    #[wasm_bindgen_test]
    fn bench_xdr_decode_and_sha256_512() {
        let raw: Vec<u8> = (0..512u16).map(|i| (i & 0xff) as u8).collect();
        let encoded = base64_encode(&raw);
        let start = now_ms();
        for _ in 0..ITERS {
            let bytes = base64_decode(&encoded).unwrap();
            let _ = sha256_hex(&bytes);
        }
        let elapsed = now_ms() - start;
        web_sys::console::log_1(
            &format!(
                "[bench] xdr_decode+sha256(512 B): {:.2} µs/iter  ({} iters, {:.0} ms total)",
                (elapsed * 1000.0) / ITERS as f64,
                ITERS,
                elapsed,
            )
            .into(),
        );
    }

    #[wasm_bindgen_test]
    fn bench_stellar_tx_bytes_sha256_512() {
        let raw: Vec<u8> = (0..512u16).map(|i| (i & 0xff) as u8).collect();
        let xdr_base64 = base64_encode(&raw);
        let start = now_ms();
        for _ in 0..ITERS {
            let tx = StellarTxBytes {
                bytes: base64_decode(&xdr_base64).unwrap(),
            };
            let _ = tx.sha256();
        }
        let elapsed = now_ms() - start;
        web_sys::console::log_1(
            &format!(
                "[bench] StellarTxBytes.sha256(512 B): {:.2} µs/iter  ({} iters, {:.0} ms total)",
                (elapsed * 1000.0) / ITERS as f64,
                ITERS,
                elapsed,
            )
            .into(),
        );
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_roundtrip() {
        let cases = ["", "a", "ab", "abc", "hello world", "EchoMirror ✨"];
        for case in cases {
            let encoded = base64_encode(case.as_bytes());
            let decoded = base64_decode(&encoded).expect("valid base64");
            assert_eq!(decoded, case.as_bytes());
        }
    }

    // These tests exercise the pure validation/logic helpers directly and
    // construct wasm-bindgen structs via their private fields rather than
    // calling `.push()` / `.new()` with invalid input — those methods build
    // a `JsValue` on the error path, and `JsValue` construction is only
    // implemented on a real wasm32 target (see `validate_mood_score`).

    #[test]
    fn mood_score_validation() {
        assert!(validate_mood_score(7).is_ok());
        assert!(validate_mood_score(0).is_err());
        assert!(validate_mood_score(11).is_err());
    }

    #[test]
    fn mood_buffer_average() {
        let buf = MoodBuffer {
            scores: vec![4, 6, 8],
        };
        assert!((buf.average() - 6.0).abs() < f64::EPSILON);
    }

    #[test]
    fn mood_buffer_average_of_empty_is_zero() {
        let buf = MoodBuffer { scores: vec![] };
        assert_eq!(buf.average(), 0.0);
    }

    #[test]
    fn stellar_tx_bytes_roundtrip() {
        let raw = b"fake-xdr-envelope-bytes";
        let encoded = base64_encode(raw);
        let bytes = base64_decode(&encoded).expect("valid xdr");
        let tx = StellarTxBytes { bytes };
        assert_eq!(tx.to_bytes(), raw.to_vec());
        assert_eq!(tx.len(), raw.len());
    }

    #[test]
    fn stellar_tx_bytes_rejects_invalid_base64() {
        assert!(base64_decode("not-valid-base64!!").is_none());
    }

    #[test]
    fn memo_validation() {
        assert!(validate_memo("short memo").is_ok());
        assert!(validate_memo(&"x".repeat(29)).is_err());
    }

    #[test]
    fn sha256_hex_is_deterministic() {
        let a = sha256_hex(b"GPUBLIC_KEY_TEST");
        let b = sha256_hex(b"GPUBLIC_KEY_TEST");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn wasm_export_helpers_delegate_to_the_pure_logic() {
        assert!(verify_mood_score(7));
        assert!(!verify_mood_score(0));
        assert_eq!(
            hash_public_key("GPUBLIC_KEY_TEST"),
            sha256_hex(b"GPUBLIC_KEY_TEST")
        );

        let valid_address = format!("G{}", "A".repeat(55));
        assert!(is_valid_stellar_address(&valid_address));
        assert!(!is_valid_stellar_address("SNOTPUBLIC"));

        assert_eq!(encode_memo("memo").unwrap(), base64_encode(b"memo"));
        let cursor = serialize_cursor(123, "page-1", 42.9);
        assert_eq!(
            parse_cursor_paging_token(&cursor).as_deref(),
            Some("page-1")
        );
        assert_eq!(parse_cursor_paging_token("not-json"), None);
    }

    #[test]
    fn wasm_export_struct_apis_work_on_valid_input() {
        let mut moods = MoodBuffer::new();
        assert!(moods.is_empty());
        moods.push(4).unwrap();
        moods.push(8).unwrap();
        assert_eq!(moods.len(), 2);
        assert_eq!(moods.to_bytes(), vec![4, 8]);

        let tx = StellarTxBytes::new(&base64_encode(b"xdr")).unwrap();
        assert!(!tx.is_empty());
        assert_eq!(tx.sha256(), sha256_hex(b"xdr"));
    }
}
