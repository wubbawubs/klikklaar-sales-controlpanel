
CREATE OR REPLACE FUNCTION public.assign_lead_to_closer(
  p_lead_assignment_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_se_id uuid;
  v_org_id uuid;
  v_lead RECORD;
  v_last_closer uuid;
  v_next_closer uuid;
  v_appt_id uuid;
BEGIN
  -- Resolve caller SE
  SELECT se.id, se.organization_id
    INTO v_se_id, v_org_id
  FROM sales_executives se
  WHERE se.user_id = auth.uid()
  LIMIT 1;

  IF v_se_id IS NULL THEN
    RAISE EXCEPTION 'Geen sales executive gekoppeld aan huidige gebruiker';
  END IF;

  -- Load lead
  SELECT * INTO v_lead FROM lead_assignments WHERE id = p_lead_assignment_id;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead niet gevonden';
  END IF;
  IF v_lead.sales_executive_id <> v_se_id THEN
    RAISE EXCEPTION 'Lead is niet van jou';
  END IF;

  v_org_id := COALESCE(v_org_id, v_lead.organization_id);

  -- Pick next closer (round-robin) in same org
  SELECT last_assigned_closer_user_id INTO v_last_closer
  FROM closer_round_robin_state WHERE id = 1;

  WITH candidates AS (
    SELECT DISTINCT uo.user_id
    FROM user_organizations uo
    JOIN user_roles ur ON ur.user_id = uo.user_id AND ur.role = 'closer'
    WHERE uo.organization_id = v_org_id
  ),
  fallback AS (
    SELECT DISTINCT uo.user_id
    FROM user_organizations uo
    JOIN user_roles ur ON ur.user_id = uo.user_id AND ur.role IN ('admin','super_admin')
    WHERE uo.organization_id = v_org_id
  ),
  pool AS (
    SELECT user_id FROM candidates
    UNION
    SELECT user_id FROM fallback WHERE NOT EXISTS (SELECT 1 FROM candidates)
  ),
  ordered AS (
    SELECT user_id,
      ROW_NUMBER() OVER (ORDER BY user_id) AS rn,
      COUNT(*) OVER () AS cnt
    FROM pool
  )
  SELECT user_id INTO v_next_closer
  FROM ordered
  WHERE cnt > 0
    AND rn = (
      COALESCE(
        (SELECT rn FROM ordered WHERE user_id = v_last_closer),
        0
      ) % (SELECT cnt FROM ordered LIMIT 1)
    ) + 1;

  IF v_next_closer IS NULL THEN
    -- last fallback: any super_admin
    SELECT user_id INTO v_next_closer
    FROM user_roles WHERE role IN ('super_admin','admin') LIMIT 1;
  END IF;

  IF v_next_closer IS NULL THEN
    RAISE EXCEPTION 'Geen closer beschikbaar in deze organisatie';
  END IF;

  -- Insert appointment
  INSERT INTO closer_appointments (
    closer_user_id, caller_sales_executive_id, lead_assignment_id,
    organization_id, org_name, contact_name, contact_email, contact_phone,
    scheduled_at, status, notes
  ) VALUES (
    v_next_closer, v_se_id, p_lead_assignment_id,
    v_org_id, v_lead.org_name, v_lead.person_name, v_lead.person_email, v_lead.person_phone,
    p_scheduled_at, 'call', p_notes
  )
  RETURNING id INTO v_appt_id;

  -- Update round-robin pointer
  INSERT INTO closer_round_robin_state (id, last_assigned_closer_user_id, updated_at)
  VALUES (1, v_next_closer, now())
  ON CONFLICT (id) DO UPDATE SET
    last_assigned_closer_user_id = EXCLUDED.last_assigned_closer_user_id,
    updated_at = now();

  -- Notify closer
  INSERT INTO notifications (user_id, title, body, type, action_url)
  VALUES (
    v_next_closer,
    'Nieuwe afspraak toegewezen',
    'Caller heeft een lead doorgezet: ' || COALESCE(v_lead.org_name, v_lead.person_name, 'Onbekend'),
    'closer_assignment',
    '/closer'
  );

  RETURN v_appt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_lead_to_closer(uuid, timestamptz, text) TO authenticated;
