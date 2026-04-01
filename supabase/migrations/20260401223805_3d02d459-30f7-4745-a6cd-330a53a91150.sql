
CREATE OR REPLACE FUNCTION public.notify_on_lead_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_se_user_id uuid;
  v_se_name text;
BEGIN
  -- Get the SE's user_id and name
  SELECT se.user_id, se.full_name
  INTO v_se_user_id, v_se_name
  FROM sales_executives se
  WHERE se.id = NEW.sales_executive_id;

  -- Only notify if the SE has a linked user account
  IF v_se_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, action_url)
    VALUES (
      v_se_user_id,
      '📌 Nieuwe lead toegewezen',
      'Je hebt een nieuwe lead ontvangen: ' || COALESCE(NEW.org_name, NEW.deal_title, 'Onbekend'),
      'lead_assignment',
      '/leads'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_lead_assignment
  AFTER INSERT ON public.pipedrive_lead_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_lead_assignment();
