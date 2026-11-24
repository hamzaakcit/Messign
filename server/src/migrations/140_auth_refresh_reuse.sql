-- WP-31: refresh-token reuse detection (OWASP: rotate refresh tokens and treat a replayed old one as theft).
-- The session keeps the hash of the token it replaced and when, so a replay can be told apart from two browser tabs
-- refreshing at the same moment (the second one presents the token the first just replaced, within seconds).
-- Additive: the running code ignores both columns.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS previous_refresh_token_hash text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_rotated_at timestamptz;
