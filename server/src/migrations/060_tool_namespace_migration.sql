-- Migration: Update dora_automation_policies action_type to namespaced format (module:action_noun)
-- Run after deploying the tool rename refactor. Updates existing policies from old to new names.

UPDATE dora_automation_policies
SET action_type = 'finance:approve_expense'
WHERE action_type = 'approve_expense';

UPDATE dora_automation_policies
SET action_type = 'projects:create_task'
WHERE action_type = 'create_task';
