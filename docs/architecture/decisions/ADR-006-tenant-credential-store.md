# ADR-006: Per-tenant messaging credentials with envelope encryption, write-only, fail-closed

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** All third-party keys are platform env vars. The existing `encrypt()` helper falls back to plaintext and its `decrypt()` returns ciphertext on failure (fail-open). The tenant must be the sender.
- **Decision:**
  - `engage.channel_accounts` stores non-secret config in jsonb and secrets as AES-256-GCM ciphertext under a per-row data key. The data key is wrapped by a master key `ENGAGE_MASTER_KEY` (32-byte hex), versioned via `key_id`. A KMS can replace the env key later without a schema change.
  - Decryption failure throws, and the send gate denies.
  - Secrets are write-only through the API (never returned, only `last4`/fingerprint).
  - Structured-log redaction for known secret fields, plus a test.
  - Rotation = write a new secret (old row kept disabled for audit). Master-key rotation = re-wrap job.
  - Production refuses to start engage without `ENGAGE_MASTER_KEY`.
  - Platform env keys (`RESEND_API_KEY`, etc.) are never used by engage in `live` mode.
- **Consequences:** + matches "tenant is the sender"; a leaked DB dump alone does not expose credentials. − key management is now an ops duty (documented in the pilot runbook).
- **Rejected:** reusing `services/crypto`; storing secrets in Railway env per tenant (does not scale, no audit).
