/*!
# echomirror-ffi

C-ABI bindings compiled to a shared library (`.so` / `.dylib` / `.dll`).
Flutter's `dart:ffi` loads this library and calls these functions natively —
no HTTP, no Dart abstraction, just direct Rust → C ABI.

## Build

```sh
# macOS (for iOS simulator / macOS desktop)
cargo build -p echomirror-ffi --release
# → target/release/libechomirror_ffi.dylib

# Android (arm64-v8a)
cargo build -p echomirror-ffi --target aarch64-linux-android --release

# Linux / Windows
cargo build -p echomirror-ffi --release
```

## Flutter usage

```dart
import 'dart:ffi';
import 'dart:io';

final lib = DynamicLibrary.open('libechomirror_ffi.so');

final hashPublicKey = lib.lookupFunction<
  Pointer<Utf8> Function(Pointer<Utf8>),
  Pointer<Utf8> Function(Pointer<Utf8>)
>('echomirror_hash_public_key');
```
*/

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use sha2::{Digest, Sha256};

// ── Memory management ─────────────────────────────────────────────────────────

/// Free a C string returned by this library.
/// Flutter must call this after reading any `*mut c_char` return value.
#[no_mangle]
pub extern "C" fn echomirror_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe { drop(CString::from_raw(ptr)) };
}

// ── Mood ──────────────────────────────────────────────────────────────────────

/// Validate a mood score (1–10). Returns 1 if valid, 0 if not.
#[no_mangle]
pub extern "C" fn echomirror_verify_mood_score(score: u8) -> u8 {
    if (1..=10).contains(&score) { 1 } else { 0 }
}

// ── Stellar crypto ────────────────────────────────────────────────────────────

/// SHA-256 hash of a Stellar public key as a lowercase hex string.
/// Caller must free the returned string with `echomirror_free_string`.
///
/// Returns null if `public_key` is null.
#[no_mangle]
pub extern "C" fn echomirror_hash_public_key(public_key: *const c_char) -> *mut c_char {
    if public_key.is_null() {
        return std::ptr::null_mut();
    }
    let key = unsafe { CStr::from_ptr(public_key) }
        .to_str()
        .unwrap_or("");

    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    let hash = hex::encode(hasher.finalize());

    CString::new(hash)
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// Returns 1 if the address looks like a valid Stellar G-address, 0 otherwise.
#[no_mangle]
pub extern "C" fn echomirror_is_valid_stellar_address(address: *const c_char) -> u8 {
    if address.is_null() {
        return 0;
    }
    let addr = unsafe { CStr::from_ptr(address) }
        .to_str()
        .unwrap_or("");

    let valid = addr.starts_with('G')
        && addr.len() == 56
        && addr.chars().all(|c| c.is_ascii_alphanumeric());

    if valid { 1 } else { 0 }
}

// ── Sync cursor ───────────────────────────────────────────────────────────────

/// Serialize a sync cursor to a JSON C string.
/// Caller must free with `echomirror_free_string`.
#[no_mangle]
pub extern "C" fn echomirror_serialize_cursor(
    ledger_sequence: u32,
    paging_token: *const c_char,
    total_processed: u64,
) -> *mut c_char {
    let token = if paging_token.is_null() {
        "now".to_string()
    } else {
        unsafe { CStr::from_ptr(paging_token) }
            .to_str()
            .unwrap_or("now")
            .to_string()
    };

    let json = format!(
        r#"{{"ledger_sequence":{},"paging_token":"{}","total_processed":{}}}"#,
        ledger_sequence, token, total_processed
    );

    CString::new(json)
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// SDK version string. Caller must free with `echomirror_free_string`.
#[no_mangle]
pub extern "C" fn echomirror_version() -> *mut c_char {
    CString::new(env!("CARGO_PKG_VERSION"))
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
