-- Fix knowledge_user_roles: user_id should contain auth_user_id, not internal id
-- This is needed because req.userId in the middleware is auth_user_id (from JWT sub)
-- Only update when the new user_id is not already taken (avoid unique constraint violation)
UPDATE knowledge_user_roles kr
SET user_id = u.auth_user_id
FROM reimbursement_users u
WHERE kr.user_id = u.id::text
  AND u.auth_user_id IS NOT NULL
  AND u.auth_user_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_user_roles kr2
    WHERE kr2.user_id = u.auth_user_id AND kr2.id != kr.id
  );

-- Also fix knowledge_team_members
UPDATE knowledge_team_members tm
SET user_id = u.auth_user_id
FROM reimbursement_users u
WHERE tm.user_id = u.id::text
  AND u.auth_user_id IS NOT NULL
  AND u.auth_user_id != '';
