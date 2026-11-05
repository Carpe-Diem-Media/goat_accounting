BEGIN;
SELECT plan(9);

SELECT ok(to_regnamespace('estimator') IS NOT NULL, 'estimator schema exists');
SELECT has_table('estimator', 'pricing_models', 'pricing models are persisted');
SELECT has_table('estimator', 'pricing_rules', 'pricing rules are persisted');
SELECT has_table('estimator', 'estimates', 'estimates are persisted');
SELECT has_table('estimator', 'estimate_line_items', 'estimate line items are persisted');
SELECT has_table('estimator', 'leads', 'leads are persisted');
SELECT has_table('estimator', 'lead_events', 'lead events are persisted');
SELECT has_table('estimator', 'notification_deliveries', 'notification deliveries are persisted');
SELECT has_table('estimator', 'staff_users', 'staff authority is persisted');

SELECT * FROM finish();
ROLLBACK;
