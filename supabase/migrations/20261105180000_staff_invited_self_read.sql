BEGIN;

DROP POLICY staff_users_self_read ON estimator.staff_users;
CREATE POLICY staff_users_self_read ON estimator.staff_users
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND state IN ('INVITED', 'ACTIVE')
  );

COMMIT;
