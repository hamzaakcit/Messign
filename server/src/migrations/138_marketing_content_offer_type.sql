-- An offer is the parent row of an Instagram post and its journey email (content studio CS-01).
ALTER TABLE marketing_content DROP CONSTRAINT IF EXISTS marketing_content_content_type_check;
ALTER TABLE marketing_content ADD CONSTRAINT marketing_content_content_type_check
  CHECK (content_type IN (
    'blog', 'social', 'email', 'video', 'webinar', 'case_study',
    'whitepaper', 'infographic', 'podcast', 'other', 'offer'
  ));
