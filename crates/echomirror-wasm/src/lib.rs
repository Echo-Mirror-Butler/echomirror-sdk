/*!
# echomirror-wasm

Rust SDK compiled to WebAssembly. Provides high-performance crypto operations,
XDR transaction serialization, and balance verification directly in the browser or Node.js —
without any server round-trip.

## Build

```sh
wasm-pack build crates/echomirror-wasm --target web --out-dir ../../packages/js/wasm/wasm-dist
```

## Usage from JavaScript

```js
import init, { verifyMoodScore, hashPublicKey, parseXdr } from '@echomirror/wasm'
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

/// Validate a mood score (must be 1–10).
#[wasm_bindgen]
pub fn verify_mood_score(score: u8) -> bool {
    (1..=10).contains(&score)
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

/// Encode a string as base64 (useful for XDR memo fields).
#[wasm_bindgen]
pub fn encode_memo(text: &str) -> Result<String, JsValue> {
    if text.len() > 28 {
        return Err(JsValue::from_str("Memo must be 28 bytes or fewer"));
    }
    Ok(base64_encode(text.as_bytes()))
}

fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        out.push(CHARS[((b0 >> 2) & 0x3f) as usize] as char);
        out.push(CHARS[(((b0 & 0x3) << 4) | (b1 >> 4)) as usize] as char);
        out.push(if i + 1 < input.len() { CHARS[(((b1 & 0xf) << 2) | (b2 >> 6)) as usize] as char } else { '=' });
        out.push(if i + 2 < input.len() { CHARS[(b2 & 0x3f) as usize] as char } else { '=' });
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
