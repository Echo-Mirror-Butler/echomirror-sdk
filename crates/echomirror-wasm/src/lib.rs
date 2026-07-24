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

/// SHA-256 hash of a Stellar public key, returned as lowercase hex.
/// Used for anonymous analytics — never stored as a raw key.
#[wasm_bindgen]
pub fn hash_public_key(public_key: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(public_key.as_bytes());
    hex::encode(hasher.finalize())
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
fn base64_decode(input: &str) -> Option<Vec<u8>> {
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

fn base64_encode(input: &[u8]) -> String {
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
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&self.bytes);
        hex::encode(hasher.finalize())
    }

    /// Copy the raw bytes out as a fresh, JS-owned `Uint8Array`.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }
}

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
}
