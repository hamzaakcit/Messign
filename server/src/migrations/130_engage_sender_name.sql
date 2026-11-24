-- Sender name (WP-25 follow-up to WP-24): the name a tenant's customers know the shop by. Templates and copy drafts
-- refer to it with the {{sender_name}} placeholder, which the renderer fills from this column when a message is made.
-- A tenant sets it; nothing in Messign or the AI model invents it. Unset (NULL) means a message that uses the placeholder
-- is refused by the renderer (missing variable), not sent with a blank or a made-up name.
-- One line, 1 to 80 characters, no angle brackets or braces (it is written into HTML and must not carry markup or placeholders).

ALTER TABLE engage.tenant_settings ADD COLUMN IF NOT EXISTS sender_name text
  CHECK (sender_name IS NULL OR (char_length(sender_name) BETWEEN 1 AND 80
    AND sender_name = btrim(sender_name)
    AND sender_name ~ '^[^\r\n<>{}]+$'));
