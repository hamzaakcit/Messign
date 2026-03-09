-- Fix knowledge_user_roles: user_id should contain auth_user_id, not internal id
-- This is needed because req.userId in the middleware is auth_user_id (from JWT sub)

UPDATE knowledge_user_roles kr
SET user_id = u.auth_user_id
FROM reimbursement_users u
WHERE kr.user_id = u.id::text
  AND u.auth_user_id IS NOT NULL
  AND u.auth_user_id != '';

-- Also fix knowledge_team_members
UPDATE knowledge_team_members tm
SET user_id = u.auth_user_id
FROM reimbursement_users u
WHERE tm.user_id = u.id::text
  AND u.auth_user_id IS NOT NULL
  AND u.auth_user_id != '';
