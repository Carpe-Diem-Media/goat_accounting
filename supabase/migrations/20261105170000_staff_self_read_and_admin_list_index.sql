-- Allow the caller to read only their own active staff row so the server can
-- verify its database-backed role before deciding whether AAL2 is required.
-- Estimate and lead policies continue to require ACTIVE staff at AAL2.
CREATE POLICY staff_users_self_read ON estimator.staff_users
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND state = 'ACTIVE'
  );

-- The admin lead list is ordered by created_at without a state filter.
CREATE INDEX leads_created_at_idx ON estimator.leads (created_at DESC);
