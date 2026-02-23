-- Add the missing "general" channel when it doesn't exist (e.g. after migrate with empty channels).
-- Uses fixed ID so clients that cached d789f76a-b015-4a75-aaa5-431cda85a184 can send messages.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM channels WHERE id = 'd789f76a-b015-4a75-aaa5-431cda85a184')
     AND NOT EXISTS (SELECT 1 FROM channels WHERE name = 'general') THEN
    INSERT INTO channels (id, name, description, type, unread_count, created_at, updated_at)
    VALUES (
      'd789f76a-b015-4a75-aaa5-431cda85a184',
      'general',
      'General discussion channel',
      'public',
      0,
      NOW(),
      NOW()
    );
  END IF;
END $$;
