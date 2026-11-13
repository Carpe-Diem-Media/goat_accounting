-- Proven on a local synthetic failure-state/date workload; see Task 13 verification.
CREATE INDEX notification_deliveries_failed_created_at_idx
  ON estimator.notification_deliveries (created_at)
  WHERE state IN ('FAILED_RETRYABLE', 'EXHAUSTED');

-- Invoker rights retain the table RLS policies. Dates are bounded at the database boundary.
CREATE FUNCTION estimator.dashboard_metrics(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  metrics jsonb;
  new_leads bigint;
  failed_notifications bigint;
BEGIN
  IF NOT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true) THEN
    RAISE EXCEPTION 'staff access required' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end OR p_end - p_start > interval '90 days'
     OR p_end > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'invalid dashboard period' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'completed', count(*),
    'today', count(*) FILTER (WHERE e.created_at >= date_trunc('day', p_end AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'Africa/Johannesburg'),
    'with_contact', count(*) FILTER (WHERE l.found IS NOT NULL),
    'manual_review', count(*) FILTER (WHERE e.manual_review_required AND e.state = 'VALID'),
    'catchup_min_cents', coalesce(sum(e.catchup_min_cents) FILTER (WHERE e.state = 'VALID'), 0)::text,
    'catchup_max_cents', coalesce(sum(e.catchup_max_cents) FILTER (WHERE e.state = 'VALID'), 0)::text,
    'ongoing_min_cents', coalesce(sum(e.ongoing_min_cents) FILTER (WHERE e.state = 'VALID'), 0)::text,
    'ongoing_max_cents', coalesce(sum(e.ongoing_max_cents) FILTER (WHERE e.state = 'VALID'), 0)::text
  ) INTO metrics
  FROM estimator.estimates e
  -- Keep each lookup bounded by the unique estimate_id index; avoid hashing all leads.
  LEFT JOIN LATERAL (
    SELECT true AS found FROM estimator.leads lead
    WHERE lead.estimate_id = e.id AND lead.created_at < p_end OFFSET 0
  ) l ON true
  WHERE e.created_at >= p_start AND e.created_at < p_end;

  SELECT count(*) INTO new_leads FROM estimator.leads l
  WHERE l.created_at >= p_start AND l.created_at < p_end;
  IF estimator.is_current_staff(ARRAY['admin']::estimator.staff_role[], true) THEN
    SELECT count(*) INTO failed_notifications FROM estimator.notification_deliveries n
    WHERE n.created_at >= p_start AND n.created_at < p_end
      AND n.state IN ('FAILED_RETRYABLE', 'EXHAUSTED');
  END IF;
  RETURN metrics || jsonb_build_object('new_leads', new_leads, 'failed_notifications', failed_notifications);
END;
$$;
REVOKE ALL ON FUNCTION estimator.dashboard_metrics(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION estimator.dashboard_metrics(timestamptz, timestamptz) TO authenticated;
