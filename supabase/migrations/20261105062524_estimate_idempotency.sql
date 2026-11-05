BEGIN;

ALTER TABLE estimator.estimates
  ADD COLUMN idempotency_key_hash text,
  ADD COLUMN request_fingerprint_hash text,
  ADD CONSTRAINT estimates_idempotency_hash_pair_check CHECK (
    (idempotency_key_hash IS NULL AND request_fingerprint_hash IS NULL)
    OR (idempotency_key_hash IS NOT NULL AND request_fingerprint_hash IS NOT NULL)
  ),
  ADD CONSTRAINT estimates_idempotency_key_hash_format_check CHECK (
    idempotency_key_hash IS NULL OR idempotency_key_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT estimates_request_fingerprint_hash_format_check CHECK (
    request_fingerprint_hash IS NULL OR request_fingerprint_hash ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX estimates_idempotency_key_hash_uidx
  ON estimator.estimates (idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

COMMENT ON COLUMN estimator.estimates.idempotency_key_hash IS
  'SHA-256 of a 32-byte per-attempt idempotency key; raw keys are never persisted.';
COMMENT ON COLUMN estimator.estimates.request_fingerprint_hash IS
  'HMAC-SHA-256 of the canonical request keyed by the per-attempt idempotency key.';
COMMENT ON INDEX estimator.estimates_idempotency_key_hash_uidx IS
  'Serializes concurrent estimate writes for a single attempt key. The server returns the original snapshot for matching retries within 24 hours; expired keys remain reserved and cannot be reused.';

COMMIT;
