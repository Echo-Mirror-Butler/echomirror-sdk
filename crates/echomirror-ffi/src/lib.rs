/*!
# echomirror-ffi

C-ABI bindings compiled to a shared/static library (`.so` / `.dylib` / `.dll` / `.a`).
Flutter, Swift, Python, and other native runtimes load this library and call these
functions directly.

## Ownership rules

- Every `*mut c_char` returned by this library is owned by the caller.
- The caller must release returned strings with `echomirror_free_string`.
- Opaque client handles returned by `*_client_new` must be released with the
  matching `*_client_free` function.
- Async callbacks receive an owned payload string. The callback caller must free
  it with `echomirror_free_string` after copying the value into the host runtime.
*/

use echomirror_core::config::StellarNetwork;
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, EchoMirrorError};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::ptr;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

pub type EchoMirrorAsyncCallback =
    Option<extern "C" fn(user_data: *mut c_void, code: i32, payload: *mut c_char)>;

#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EchoMirrorFfiErrorCode {
    Ok = 0,
    NullPointer = 1,
    InvalidUtf8 = 2,
    InvalidConfig = 3,
    InvalidInput = 4,
    Runtime = 5,
    Network = 6,
    Serialization = 7,
}

pub struct EchoMirrorMoodClient {
    client: EchoMirrorClient,
}

pub struct EchoMirrorStellarClient {
    client: EchoMirrorClient,
}

pub struct EchoMirrorSocialClient {
    client: EchoMirrorClient,
}

fn error_code(code: EchoMirrorFfiErrorCode) -> i32 {
    code as i32
}

fn string_from_ptr(ptr: *const c_char) -> Result<String, EchoMirrorFfiErrorCode> {
    if ptr.is_null() {
        return Err(EchoMirrorFfiErrorCode::NullPointer);
    }

    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map(|value| value.to_owned())
        .map_err(|_| EchoMirrorFfiErrorCode::InvalidUtf8)
}

fn optional_string_from_ptr(ptr: *const c_char) -> Result<Option<String>, EchoMirrorFfiErrorCode> {
    if ptr.is_null() {
        return Ok(None);
    }

    string_from_ptr(ptr).map(Some)
}

fn string_into_raw(value: impl Into<String>) -> *mut c_char {
    CString::new(value.into())
        .map(CString::into_raw)
        .unwrap_or(ptr::null_mut())
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn hash_id(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn parse_network(network: u8) -> StellarNetwork {
    match network {
        1 => StellarNetwork::Testnet,
        _ => StellarNetwork::Mainnet,
    }
}

fn build_client(
    api_key: *const c_char,
    base_url: *const c_char,
    network: u8,
) -> Result<EchoMirrorClient, EchoMirrorFfiErrorCode> {
    let api_key = string_from_ptr(api_key)?;
    if api_key.trim().is_empty() {
        return Err(EchoMirrorFfiErrorCode::InvalidConfig);
    }

    let mut config = EchoMirrorConfig::new(api_key);
    config.network = parse_network(network);

    if let Some(base_url) = optional_string_from_ptr(base_url)? {
        if !base_url.trim().is_empty() {
            config.base_url = base_url;
        }
    }

    EchoMirrorClient::new(config).map_err(|_| EchoMirrorFfiErrorCode::InvalidConfig)
}

fn map_core_error(error: EchoMirrorError) -> EchoMirrorFfiErrorCode {
    match error {
        EchoMirrorError::Http { .. }
        | EchoMirrorError::Auth(_)
        | EchoMirrorError::RateLimit { .. }
        | EchoMirrorError::Network(_) => EchoMirrorFfiErrorCode::Network,
        EchoMirrorError::Serialization(_) => EchoMirrorFfiErrorCode::Serialization,
        EchoMirrorError::Config(_) => EchoMirrorFfiErrorCode::InvalidConfig,
        EchoMirrorError::Stellar(_)
        | EchoMirrorError::Sync(_)
        | EchoMirrorError::NotFound(_)
        | EchoMirrorError::Other(_) => EchoMirrorFfiErrorCode::Runtime,
    }
}

fn complete_async(
    callback: EchoMirrorAsyncCallback,
    user_data: *mut c_void,
    code: EchoMirrorFfiErrorCode,
    payload: String,
) {
    if let Some(callback) = callback {
        callback(user_data, error_code(code), string_into_raw(payload));
    }
}

fn async_payload_error(code: EchoMirrorFfiErrorCode, message: &str) -> String {
    json!({ "message": message, "code": error_code(code) }).to_string()
}

fn is_valid_stellar_address_str(address: &str) -> bool {
    address.starts_with('G')
        && address.len() == 56
        && address.chars().all(|c| c.is_ascii_alphanumeric())
}

// Memory management

/// Free a C string returned by this library.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    unsafe { drop(CString::from_raw(ptr)) };
}

// General utilities

/// SDK version string. Caller must free with `echomirror_free_string`.
#[no_mangle]
pub extern "C" fn echomirror_version() -> *mut c_char {
    string_into_raw(env!("CARGO_PKG_VERSION"))
}

/// SHA-256 hash of a Stellar public key as a lowercase hex string.
/// Caller must free the returned string with `echomirror_free_string`.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_hash_public_key(public_key: *const c_char) -> *mut c_char {
    let Ok(key) = string_from_ptr(public_key) else {
        return ptr::null_mut();
    };

    string_into_raw(hash_id(&key))
}

/// Returns 1 if the address looks like a valid Stellar G-address, 0 otherwise.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_is_valid_stellar_address(address: *const c_char) -> u8 {
    let Ok(address) = string_from_ptr(address) else {
        return 0;
    };

    u8::from(is_valid_stellar_address_str(&address))
}

/// Serialize a sync cursor to a JSON C string.
/// Caller must free with `echomirror_free_string`.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_serialize_cursor(
    ledger_sequence: u32,
    paging_token: *const c_char,
    total_processed: u64,
) -> *mut c_char {
    let token = optional_string_from_ptr(paging_token)
        .ok()
        .flatten()
        .unwrap_or_else(|| "now".to_string());

    let payload = json!({
        "ledger_sequence": ledger_sequence,
        "paging_token": token,
        "total_processed": total_processed
    })
    .to_string();

    string_into_raw(payload)
}

// Mood

/// Validate a mood score (1-10). Returns 1 if valid, 0 if not.
#[no_mangle]
pub extern "C" fn echomirror_verify_mood_score(score: u8) -> u8 {
    u8::from((1..=10).contains(&score))
}

#[no_mangle]
pub extern "C" fn echomirror_mood_client_new(
    api_key: *const c_char,
    base_url: *const c_char,
    network: u8,
) -> *mut EchoMirrorMoodClient {
    match build_client(api_key, base_url, network) {
        Ok(client) => Box::into_raw(Box::new(EchoMirrorMoodClient { client })),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_mood_client_free(client: *mut EchoMirrorMoodClient) {
    if client.is_null() {
        return;
    }

    unsafe { drop(Box::from_raw(client)) };
}

/// Callback payload is a JSON mood entry.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_mood_log_async(
    client: *const EchoMirrorMoodClient,
    user_id: *const c_char,
    score: u8,
    note: *const c_char,
    tags_json: *const c_char,
    callback: EchoMirrorAsyncCallback,
    user_data: *mut c_void,
) -> i32 {
    if client.is_null() || callback.is_none() {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    }
    if echomirror_verify_mood_score(score) == 0 {
        return error_code(EchoMirrorFfiErrorCode::InvalidInput);
    }

    let Ok(user_id) = string_from_ptr(user_id) else {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    };
    let Ok(note) = optional_string_from_ptr(note) else {
        return error_code(EchoMirrorFfiErrorCode::InvalidUtf8);
    };
    let Ok(tags_json) = optional_string_from_ptr(tags_json) else {
        return error_code(EchoMirrorFfiErrorCode::InvalidUtf8);
    };

    let tags = tags_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
        .unwrap_or_default();

    let network = unsafe { (*client).client.config().network };
    let user_data = user_data as usize;

    thread::spawn(move || {
        let user_data = user_data as *mut c_void;
        let timestamp = now_unix_ms();
        let id = hash_id(&format!("{user_id}:{score}:{timestamp}"));
        let payload = json!({
            "id": id,
            "userId": user_id,
            "score": score,
            "note": note,
            "tags": tags,
            "network": format!("{network:?}").to_lowercase(),
            "createdAtUnixMs": timestamp
        })
        .to_string();

        complete_async(callback, user_data, EchoMirrorFfiErrorCode::Ok, payload);
    });

    error_code(EchoMirrorFfiErrorCode::Ok)
}

// Stellar

#[no_mangle]
pub extern "C" fn echomirror_stellar_client_new(
    api_key: *const c_char,
    base_url: *const c_char,
    network: u8,
) -> *mut EchoMirrorStellarClient {
    match build_client(api_key, base_url, network) {
        Ok(client) => Box::into_raw(Box::new(EchoMirrorStellarClient { client })),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_stellar_client_free(client: *mut EchoMirrorStellarClient) {
    if client.is_null() {
        return;
    }

    unsafe { drop(Box::from_raw(client)) };
}

/// Callback payload is a JSON Stellar balance.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_stellar_get_balance_async(
    client: *const EchoMirrorStellarClient,
    public_key: *const c_char,
    callback: EchoMirrorAsyncCallback,
    user_data: *mut c_void,
) -> i32 {
    if client.is_null() || callback.is_none() {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    }

    let Ok(public_key) = string_from_ptr(public_key) else {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    };
    if !is_valid_stellar_address_str(&public_key) {
        return error_code(EchoMirrorFfiErrorCode::InvalidInput);
    }

    let client = unsafe { (*client).client.clone() };
    let user_data = user_data as usize;

    thread::spawn(move || {
        let user_data = user_data as *mut c_void;
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(_) => {
                complete_async(
                    callback,
                    user_data,
                    EchoMirrorFfiErrorCode::Runtime,
                    async_payload_error(
                        EchoMirrorFfiErrorCode::Runtime,
                        "failed to create runtime",
                    ),
                );
                return;
            }
        };

        match runtime.block_on(echomirror_stellar::get_balance(&client, &public_key)) {
            Ok(balance) => match serde_json::to_string(&balance) {
                Ok(payload) => {
                    complete_async(callback, user_data, EchoMirrorFfiErrorCode::Ok, payload)
                }
                Err(_) => complete_async(
                    callback,
                    user_data,
                    EchoMirrorFfiErrorCode::Serialization,
                    async_payload_error(
                        EchoMirrorFfiErrorCode::Serialization,
                        "failed to serialize balance",
                    ),
                ),
            },
            Err(error) => {
                let code = map_core_error(error);
                complete_async(
                    callback,
                    user_data,
                    code,
                    async_payload_error(code, "failed to fetch Stellar balance"),
                );
            }
        }
    });

    error_code(EchoMirrorFfiErrorCode::Ok)
}

// Social

#[no_mangle]
pub extern "C" fn echomirror_social_client_new(
    api_key: *const c_char,
    base_url: *const c_char,
    network: u8,
) -> *mut EchoMirrorSocialClient {
    match build_client(api_key, base_url, network) {
        Ok(client) => Box::into_raw(Box::new(EchoMirrorSocialClient { client })),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_social_client_free(client: *mut EchoMirrorSocialClient) {
    if client.is_null() {
        return;
    }

    unsafe { drop(Box::from_raw(client)) };
}

/// Callback payload is a JSON user profile snapshot.
#[no_mangle]
#[allow(clippy::not_unsafe_ptr_arg_deref)]
pub extern "C" fn echomirror_social_profile_async(
    client: *const EchoMirrorSocialClient,
    user_id: *const c_char,
    callback: EchoMirrorAsyncCallback,
    user_data: *mut c_void,
) -> i32 {
    if client.is_null() || callback.is_none() {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    }

    let Ok(user_id) = string_from_ptr(user_id) else {
        return error_code(EchoMirrorFfiErrorCode::NullPointer);
    };
    if user_id.trim().is_empty() {
        return error_code(EchoMirrorFfiErrorCode::InvalidInput);
    }

    let network = unsafe { (*client).client.config().network };
    let user_data = user_data as usize;

    thread::spawn(move || {
        let user_data = user_data as *mut c_void;
        let payload = json!({
            "id": user_id,
            "username": user_id,
            "displayName": user_id,
            "avatarUrl": null,
            "echoBalance": "0",
            "currentStreak": 0,
            "totalEntries": 0,
            "network": format!("{network:?}").to_lowercase(),
            "joinedAtUnixMs": now_unix_ms()
        })
        .to_string();

        complete_async(callback, user_data, EchoMirrorFfiErrorCode::Ok, payload);
    });

    error_code(EchoMirrorFfiErrorCode::Ok)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Sender};
    use std::time::Duration;

    extern "C" fn capture_payload(user_data: *mut c_void, code: i32, payload: *mut c_char) {
        let sender = unsafe { &*(user_data as *const Sender<(i32, String)>) };
        let payload_ptr = payload;
        let payload = if payload_ptr.is_null() {
            String::new()
        } else {
            unsafe { CStr::from_ptr(payload_ptr) }
                .to_string_lossy()
                .into_owned()
        };
        if !payload_ptr.is_null() {
            echomirror_free_string(payload_ptr);
        }
        let _ = sender.send((code, payload));
    }

    #[test]
    fn validates_mood_scores() {
        assert_eq!(echomirror_verify_mood_score(1), 1);
        assert_eq!(echomirror_verify_mood_score(10), 1);
        assert_eq!(echomirror_verify_mood_score(0), 0);
        assert_eq!(echomirror_verify_mood_score(11), 0);
    }

    #[test]
    fn validates_stellar_addresses() {
        let valid = CString::new(format!("G{}", "A".repeat(55))).unwrap();
        let invalid = CString::new("SNOTPUBLIC").unwrap();

        assert_eq!(echomirror_is_valid_stellar_address(valid.as_ptr()), 1);
        assert_eq!(echomirror_is_valid_stellar_address(invalid.as_ptr()), 0);
    }

    #[test]
    fn serializes_sync_cursor() {
        let token = CString::new("abc").unwrap();
        let raw = echomirror_serialize_cursor(123, token.as_ptr(), 99);
        assert!(!raw.is_null());

        let payload = unsafe { CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        echomirror_free_string(raw);

        assert!(payload.contains("\"ledger_sequence\":123"));
        assert!(payload.contains("\"paging_token\":\"abc\""));
        assert!(payload.contains("\"total_processed\":99"));
    }

    #[test]
    fn allocates_and_frees_clients() {
        let api_key = CString::new("test").unwrap();
        let mood = echomirror_mood_client_new(api_key.as_ptr(), ptr::null(), 1);
        let stellar = echomirror_stellar_client_new(api_key.as_ptr(), ptr::null(), 1);
        let social = echomirror_social_client_new(api_key.as_ptr(), ptr::null(), 1);

        assert!(!mood.is_null());
        assert!(!stellar.is_null());
        assert!(!social.is_null());

        echomirror_mood_client_free(mood);
        echomirror_stellar_client_free(stellar);
        echomirror_social_client_free(social);
    }

    #[test]
    fn mood_log_invokes_async_callback() {
        let api_key = CString::new("test").unwrap();
        let user_id = CString::new("user-1").unwrap();
        let note = CString::new("steady").unwrap();
        let tags = CString::new(r#"["focus"]"#).unwrap();
        let client = echomirror_mood_client_new(api_key.as_ptr(), ptr::null(), 1);
        let (sender, receiver) = channel::<(i32, String)>();

        let code = echomirror_mood_log_async(
            client,
            user_id.as_ptr(),
            7,
            note.as_ptr(),
            tags.as_ptr(),
            Some(capture_payload),
            &sender as *const Sender<(i32, String)> as *mut c_void,
        );

        assert_eq!(code, error_code(EchoMirrorFfiErrorCode::Ok));
        let (callback_code, payload) = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(callback_code, error_code(EchoMirrorFfiErrorCode::Ok));
        assert!(payload.contains("\"score\":7"));
        assert!(payload.contains("\"userId\":\"user-1\""));

        echomirror_mood_client_free(client);
    }
}
