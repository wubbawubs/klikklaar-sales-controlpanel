-- 1. Extend app_role enum with 'closer'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'closer';

-- 2. closer_appointments: kanban rows fed by Calendly webhook
CREATE TABLE public.closer_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_user_id uuid NOT NULL,
  caller_sales_executive_id uuid NULL,
  lead_assignment_id uuid NULL,
  status text NOT NULL DEFAULT 'call',
  org_name text NULL,
  contact_name text NULL,
  contact_email text NULL,
  contact_phone text NULL,
  scheduled_at timestamptz NULL,
  calendly_event_uri text NULL,
  calendly_invitee_uri text NULL,
  notes text NULL,
  deal_value_eur numeric NULL,
  position integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX closer_appointments_invitee_uri_uniq
  ON public.closer_appointments (calendly_invitee_uri)
  WHERE calendly_invitee_uri IS NOT NULL;

CREATE INDEX idx_closer_appointments_closer ON public.closer_appointments (closer_user_id, status);
CREATE INDEX idx_closer_appointments_caller ON public.closer_appointments (caller_sales_executive_id);

-- Validation trigger for status (no CHECK constraint per project policy)
CREATE OR REPLACE FUNCTION public.validate_closer_appointment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('call','no_show','follow_up','deal','nog_betalen','no_deal') THEN
    RAISE EXCEPTION 'Invalid closer_appointments.status: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_closer_appointment_status
BEFORE INSERT OR UPDATE ON public.closer_appointments
FOR EACH ROW EXECUTE FUNCTION public.validate_closer_appointment_status();

ALTER TABLE public.closer_appointments ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage closer appointments"
ON public.closer_appointments
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Closer: see and update own rows
CREATE POLICY "Closers can view own appointments"
ON public.closer_appointments
FOR SELECT TO authenticated
USING (closer_user_id = auth.uid());

CREATE POLICY "Closers can update own appointments"
ON public.closer_appointments
FOR UPDATE TO authenticated
USING (closer_user_id = auth.uid())
WITH CHECK (closer_user_id = auth.uid());

-- Cold caller (SE): read-only of own assigned appointments
CREATE POLICY "Callers can view own assigned appointments"
ON public.closer_appointments
FOR SELECT TO authenticated
USING (caller_sales_executive_id IN (
  SELECT id FROM sales_executives WHERE user_id = auth.uid()
));

-- 3. Round-robin state (single row, service-role only)
CREATE TABLE public.closer_round_robin_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_assigned_closer_user_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closer_rr_singleton CHECK (id = 1)
);

INSERT INTO public.closer_round_robin_state (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.closer_round_robin_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages round-robin"
ON public.closer_round_robin_state
FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read round-robin"
ON public.closer_round_robin_state
FOR SELECT TO authenticated
USING (is_admin(auth.uid()));