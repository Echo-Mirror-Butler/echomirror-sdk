#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void echomirror_free_string(char *ptr) {
  free(ptr);
}

uint8_t echomirror_verify_mood_score(uint8_t score) {
  return score >= 1 && score <= 10;
}

char *echomirror_hash_public_key(const char *public_key) {
  if (public_key == NULL) {
    return NULL;
  }
  const char *prefix = "mock_hash_";
  size_t len = strlen(prefix) + strlen(public_key) + 1;
  char *result = malloc(len);
  if (result == NULL) {
    return NULL;
  }
  strcpy(result, prefix);
  strcat(result, public_key);
  return result;
}

uint8_t echomirror_is_valid_stellar_address(const char *address) {
  return address != NULL && address[0] == 'G' && strlen(address) == 56;
}

char *echomirror_serialize_cursor(
  uint32_t ledger_sequence,
  const char *paging_token,
  uint64_t total_processed
) {
  const char *token = paging_token == NULL ? "now" : paging_token;
  char *result = malloc(160);
  if (result == NULL) {
    return NULL;
  }
  snprintf(
    result,
    160,
    "{\"ledger_sequence\":%u,\"paging_token\":\"%s\",\"total_processed\":%llu}",
    ledger_sequence,
    token,
    (unsigned long long)total_processed
  );
  return result;
}

char *echomirror_version(void) {
  char *result = malloc(11);
  if (result == NULL) {
    return NULL;
  }
  strcpy(result, "0.1.0-mock");
  return result;
}
