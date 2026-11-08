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

## Implementation notes (WP-06, 2026-11-08)
- **Format:** secrets are a JSON object of string values (max 10, name `[a-z][a-z0-9_]*`, value up to 4096 chars), sealed with AES-256-GCM under a fresh random data key per row; the data key is sealed under the master key named by `key_id`. Each blob is `0x01 | iv(12) | tag(16) | ciphertext`. Both seals bind the tenant and account id as GCM additional data, so a ciphertext moved to another tenant or row fails to decrypt. The binding on the wrapped key alone already enforces this (every row has its own data key); the binding on the secret layer is defence in depth and is not independently tested.
- **Keys:** `ENGAGE_MASTER_KEY` (64 hex, not degenerate), `ENGAGE_MASTER_KEY_ID` (default `k1`), `ENGAGE_MASTER_KEYS_OLD` (`id:hex,...`) so rows stay readable during rotation. Production refuses to mount engage without a valid key; elsewhere a missing key fails credential operations closed (HTTP 503) and a malformed key refuses to mount.
- **Immutability:** the engage role may SELECT and INSERT, and UPDATE only `status`, `disabled_at`, `rotated_at`, `wrapped_data_key`, `key_id`, `rewrapped_at`. It cannot edit a secret, config or owner, and cannot DELETE. Rotation inserts a new row (`supersedes_id`) and disables the old one, so history stays. One active account per tenant, channel and label.
- **API (tenant admins only):** `GET/POST /api/engage/channel-accounts`, `GET /:id`, `POST /:id/rotate`, `POST /:id/disable`. Responses carry metadata plus a 12-character fingerprint and, for secrets of 16+ characters, the last four characters. Config may not contain secret-looking field names. No endpoint returns secrets; `loadAccountSecrets` is for server-side adapters only and a test keeps routes from importing it.
- **Fail-closed:** any decrypt problem (tamper, wrong or missing key, wrong tenant or row, disabled account) throws; the send gate (WP-11) must deny on any exception from `loadAccountSecrets`.
- **Logging:** all engage logging goes through `engage/log.ts`, which redacts secret-looking field names and credential-shaped values; a lint test forbids raw `console.*` in engage and reading platform provider env vars.
- **Master-key rotation:** `npm run engage:rewrap-keys` re-wraps every tenant's data keys under the current key, one transaction per tenant, safe to repeat; the secret ciphertext is not rewritten.
- **Ops duty (pilot runbook, WP-33):** back up the master key outside the database. Losing it makes all stored credentials unrecoverable.
