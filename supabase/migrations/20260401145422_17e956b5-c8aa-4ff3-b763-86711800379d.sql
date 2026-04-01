
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function: check for missed EOD submissions
CREATE OR REPLACE FUNCTION public.check_missed_eod()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_se RECORD;
  v_today date := CURRENT_DATE;
BEGIN
  -- Find active SEs with a coach who haven't submitted EOD today
  FOR v_se IN
    SELECT se.id, se.full_name, se.coach_user_id
    FROM sales_executives se
    WHERE se.status = 'active'
      AND se.coach_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM eod_submissions eod
        WHERE eod.sales_executive_id = se.id
          AND eod.session_date = v_today
      )
  LOOP
    -- Notify the coach
    INSERT INTO notifications (user_id, title, body, type, action_url)
    VALUES (
      v_se.coach_user_id,
      '📋 Gemiste EOD: ' || COALESCE(v_se.full_name, 'SE'),
      COALESCE(v_se.full_name, 'Een SE') || ' heeft vandaag nog geen EOD-rapportage ingediend.',
      'missed_eod',
      '/sales-executives'
    );
  END LOOP;
END;
$$;
