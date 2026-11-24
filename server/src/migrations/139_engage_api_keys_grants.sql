-- WP-31: narrow what the engage role may do to API keys (principle 4, enforced in the schema).
-- Migration 111 granted it every privilege on every engage table. For api_keys that meant a bug or an injection in the API
-- could rewrite a key's hash, scopes or rate limit, or delete keys. The code only ever inserts a key, stamps last_used_at
-- when it is used and stamps revoked_at when an operator revokes it, so those are the only things left.
REVOKE UPDATE, DELETE ON engage.api_keys FROM messign_engage;
GRANT UPDATE (last_used_at, revoked_at) ON engage.api_keys TO messign_engage;
