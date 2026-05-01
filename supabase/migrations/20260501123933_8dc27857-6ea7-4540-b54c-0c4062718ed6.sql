
-- Fase 1: Funnel Tracking Foundation
-- Single source of truth voor alle stage-overgangen in het sales process

CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at timestamptz NOT NULL DEFAULT now(),
  funnel_type text NOT NULL,
  stage text NOT NULL,
  lead_assignment_id uuid NULL,
  closer_appointment_id uuid NULL,
  sales_executive_id uuid NULL,
  closer_user_id uuid NULL,
  value_eur numeric NULL,
  source_table text NOT NULL,
  source_id uuid NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funnel_events_funnel_type_check CHECK (funnel_type IN ('cold_call','follow_up_close','one_call_close','lost','mail_close','reengage_close')),
  CONSTRAINT funnel_events_stage_check CHECK (stage IN ('dial','conversation','appointment_booked','confirmation_call','reminder_sent','show_up','sales_call_1','follow_up','deal_won','deal_lost')),
  CONSTRAINT funnel_events_source_table_check CHECK (source_table IN ('calls','closer_appointments','manual'))
);

-- Idempotency: same source event + stage cannot be inserted twice
CREATE UNIQUE INDEX funnel_events_idempotency_idx
  ON public.funnel_events (source_table, source_id, stage)
  WHERE source_id IS NOT NULL;

-- Performance indexes for dashboard queries
CREATE INDEX funnel_events_event_at_idx ON public.funnel_events (event_at DESC);
CREATE INDEX funnel_events_funnel_stage_idx ON public.funnel_events (funnel_type, stage, event_at DESC);
CREATE INDEX funnel_events_se_idx ON public.funnel_events (sales_executive_id, event_at DESC) WHERE sales_executive_id IS NOT NULL;
CREATE INDEX funnel_events_closer_idx ON public.funnel_events (closer_user_id, event_at DESC) WHERE closer_user_id IS NOT NULL;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- RLS: Admins manage all
CREATE POLICY "Admins can manage funnel events"
  ON public.funnel_events
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- RLS: Coaches view events of their assigned SEs
CREATE POLICY "Coaches can view assigned SE funnel events"
  ON public.funnel_events
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- RLS: SEs view own events
CREATE POLICY "SEs can view own funnel events"
  ON public.funnel_events
  FOR SELECT
  TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- RLS: Closers view own events
CREATE POLICY "Closers can view own funnel events"
  ON public.funnel_events
  FOR SELECT
  TO authenticated
  USING (closer_user_id = auth.uid());

-- RLS: Closers can insert manual show_up events for their own appointments
CREATE POLICY "Closers can insert own manual events"
  ON public.funnel_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    source_table = 'manual'
    AND closer_user_id = auth.uid()
  );

-- ============================================================
-- TRIGGER 1: calls -> funnel_events
-- ============================================================
CREATE OR REPLACE FUNCTION public.calls_to_funnel_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Every call = at minimum a 'dial' event
  INSERT INTO public.funnel_events (
    event_at, funnel_type, stage,
    lead_assignment_id, sales_executive_id,
    source_table, source_id,
    metadata_json
  )
  VALUES (
    NEW.created_at, 'cold_call', 'dial',
    NEW.lead_assignment_id, NEW.sales_executive_id,
    'calls', NEW.id,
    jsonb_build_object('outcome', NEW.outcome)
  )
  ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;

  -- If the call reached a real conversation
  IF NEW.outcome IN ('reached','interested','not_interested','callback','appointment') THEN
    INSERT INTO public.funnel_events (
      event_at, funnel_type, stage,
      lead_assignment_id, sales_executive_id,
      source_table, source_id,
      metadata_json
    )
    VALUES (
      NEW.created_at, 'cold_call', 'conversation',
      NEW.lead_assignment_id, NEW.sales_executive_id,
      'calls', NEW.id,
      jsonb_build_object('outcome', NEW.outcome)
    )
    ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  -- If the call resulted in an appointment booked
  IF NEW.outcome = 'appointment' THEN
    INSERT INTO public.funnel_events (
      event_at, funnel_type, stage,
      lead_assignment_id, sales_executive_id,
      source_table, source_id,
      metadata_json
    )
    VALUES (
      NEW.created_at, 'cold_call', 'appointment_booked',
      NEW.lead_assignment_id, NEW.sales_executive_id,
      'calls', NEW.id,
      jsonb_build_object('outcome', NEW.outcome)
    )
    ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calls_to_funnel_events
AFTER INSERT ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.calls_to_funnel_events();

-- ============================================================
-- TRIGGER 2: closer_appointments -> funnel_events
-- ============================================================
CREATE OR REPLACE FUNCTION public.closer_appointments_to_funnel_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funnel_type text;
  v_stage text;
BEGIN
  -- On INSERT: appointment exists = sales_call_1 scheduled (we record it when status enters 'call')
  -- On UPDATE: only fire when status changed
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Map status to funnel stage
  CASE NEW.status
    WHEN 'call' THEN
      v_funnel_type := 'one_call_close';
      v_stage := 'sales_call_1';
    WHEN 'follow_up' THEN
      v_funnel_type := 'follow_up_close';
      v_stage := 'follow_up';
    WHEN 'deal' THEN
      v_funnel_type := 'one_call_close';
      v_stage := 'deal_won';
    WHEN 'nog_betalen' THEN
      v_funnel_type := 'one_call_close';
      v_stage := 'deal_won';
    WHEN 'no_deal' THEN
      v_funnel_type := 'lost';
      v_stage := 'deal_lost';
    WHEN 'no_show' THEN
      -- no_show = closer marked the appointment as no-show; do NOT log show_up
      RETURN NEW;
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.funnel_events (
    event_at, funnel_type, stage,
    closer_appointment_id, lead_assignment_id,
    closer_user_id, sales_executive_id, value_eur,
    source_table, source_id,
    metadata_json
  )
  VALUES (
    now(), v_funnel_type, v_stage,
    NEW.id, NEW.lead_assignment_id,
    NEW.closer_user_id, NEW.caller_sales_executive_id, NEW.deal_value_eur,
    'closer_appointments', NEW.id,
    jsonb_build_object('status', NEW.status)
  )
  ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_closer_appointments_to_funnel_events
AFTER INSERT OR UPDATE OF status ON public.closer_appointments
FOR EACH ROW
EXECUTE FUNCTION public.closer_appointments_to_funnel_events();
