#ifndef ECHOMIRROR_FFI_H
#define ECHOMIRROR_FFI_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum EchoMirrorFfiErrorCode {
    ECHOMIRROR_ERROR_OK = 0,
    ECHOMIRROR_ERROR_NULL_POINTER = 1,
    ECHOMIRROR_ERROR_INVALID_UTF8 = 2,
    ECHOMIRROR_ERROR_INVALID_CONFIG = 3,
    ECHOMIRROR_ERROR_INVALID_INPUT = 4,
    ECHOMIRROR_ERROR_RUNTIME = 5,
    ECHOMIRROR_ERROR_NETWORK = 6,
    ECHOMIRROR_ERROR_SERIALIZATION = 7,
} EchoMirrorFfiErrorCode;

typedef void (*EchoMirrorAsyncCallback)(void *user_data, int32_t code, char *payload);

typedef struct EchoMirrorMoodClient EchoMirrorMoodClient;
typedef struct EchoMirrorStellarClient EchoMirrorStellarClient;
typedef struct EchoMirrorSocialClient EchoMirrorSocialClient;

void echomirror_free_string(char *ptr);
char *echomirror_version(void);

uint8_t echomirror_verify_mood_score(uint8_t score);
char *echomirror_hash_public_key(const char *public_key);
uint8_t echomirror_is_valid_stellar_address(const char *address);
char *echomirror_serialize_cursor(
    uint32_t ledger_sequence,
    const char *paging_token,
    uint64_t total_processed
);

EchoMirrorMoodClient *echomirror_mood_client_new(
    const char *api_key,
    const char *base_url,
    uint8_t network
);
void echomirror_mood_client_free(EchoMirrorMoodClient *client);
int32_t echomirror_mood_log_async(
    const EchoMirrorMoodClient *client,
    const char *user_id,
    uint8_t score,
    const char *note,
    const char *tags_json,
    EchoMirrorAsyncCallback callback,
    void *user_data
);

EchoMirrorStellarClient *echomirror_stellar_client_new(
    const char *api_key,
    const char *base_url,
    uint8_t network
);
void echomirror_stellar_client_free(EchoMirrorStellarClient *client);
int32_t echomirror_stellar_get_balance_async(
    const EchoMirrorStellarClient *client,
    const char *public_key,
    EchoMirrorAsyncCallback callback,
    void *user_data
);

EchoMirrorSocialClient *echomirror_social_client_new(
    const char *api_key,
    const char *base_url,
    uint8_t network
);
void echomirror_social_client_free(EchoMirrorSocialClient *client);
int32_t echomirror_social_profile_async(
    const EchoMirrorSocialClient *client,
    const char *user_id,
    EchoMirrorAsyncCallback callback,
    void *user_data
);

#ifdef __cplusplus
}
#endif

#endif
