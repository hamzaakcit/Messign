-- WP-36 follow-up: indexes that let the database find the rows pointing at a profile, a message or a journey version.
-- Without one, every delete of such a parent (a tenant being removed cascades through all of them) scanned the whole
-- child table, once per parent row: deleting a tenant with 100,000 customers took minutes once other tenants' enrollments
-- existed. The customer trail (WP-19) and the segment runs also look enrollments up by customer. The existing indexes on
-- these columns are partial (active enrollments, steps that have a message), which a foreign-key check cannot use.

CREATE INDEX IF NOT EXISTS enrollments_profile_all_idx ON engage.enrollments (organization_id, profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enrollments_version_idx ON engage.enrollments (organization_id, journey_version_id);
CREATE INDEX IF NOT EXISTS enrollment_steps_message_idx ON engage.enrollment_steps (organization_id, message_id);
CREATE INDEX IF NOT EXISTS segment_runs_journey_version_idx ON engage.segment_runs (organization_id, journey_version_id);
CREATE INDEX IF NOT EXISTS segment_runs_segment_version_idx ON engage.segment_runs (organization_id, segment_version_id);
