
-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Trigger: new signal → notify coach
CREATE OR REPLACE FUNCTION public.notify_on_new_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_user_id uuid;
  v_se_name text;
  v_notif_title text;
  v_notif_body text;
BEGIN
  -- Get coach and SE name
  SELECT se.coach_user_id, se.full_name
  INTO v_coach_user_id, v_se_name
  FROM sales_executives se
  WHERE se.id = NEW.sales_executive_id;

  -- Only notify if there's a coach assigned
  IF v_coach_user_id IS NOT NULL THEN
    v_notif_title := CASE NEW.severity
      WHEN 'critical' THEN '🚨 Kritiek signaal: ' || NEW.title
      WHEN 'warning' THEN '⚠️ Waarschuwing: ' || NEW.title
      ELSE '📊 Signaal: ' || NEW.title
    END;
    v_notif_body := COALESCE(v_se_name, 'SE') || ' — ' || COALESCE(NEW.description, NEW.title);

    INSERT INTO notifications (user_id, title, body, type, action_url)
    VALUES (v_coach_user_id, v_notif_title, v_notif_body, 'signal', '/sales-executives');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_signal
  AFTER INSERT ON signals
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_new_signal();

-- 2. Trigger: coach notes on EOD → notify SE
CREATE OR REPLACE FUNCTION public.notify_on_coach_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_se_user_id uuid;
BEGIN
  -- Only fire when coach_notes is newly set or changed
  IF (OLD.coach_notes IS DISTINCT FROM NEW.coach_notes) AND NEW.coach_notes IS NOT NULL AND NEW.coach_notes <> '' THEN
    SELECT se.user_id INTO v_se_user_id
    FROM sales_executives se
    WHERE se.id = NEW.sales_executive_id;

    IF v_se_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, action_url)
      VALUES (
        v_se_user_id,
        '💬 Coaching feedback ontvangen',
        'Je coach heeft feedback geplaatst op je EOD van ' || NEW.session_date::text,
        'coaching',
        '/eod'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_coach_notes
  AFTER UPDATE ON eod_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_coach_notes();

-- 3. Trigger: notification INSERT → fire push via pg_net
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_anon_key text;
BEGIN
  -- Build edge function URL
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://gdeeigztmbvdpcgdpzdv.supabase.co';
  END IF;

  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZWVpZ3p0bWJ2ZHBjZ2RwemR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDc0MjAsImV4cCI6MjA4OTkyMzQyMH0.sCu0LnWv1xvDQZJVVl0umv16YCPv46iT6pGy3_Qre8E';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', COALESCE(NEW.body, ''),
      'action_url', COALESCE(NEW.action_url, '/'),
      'type', COALESCE(NEW.type, 'default')
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_send_push_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_on_notification();
