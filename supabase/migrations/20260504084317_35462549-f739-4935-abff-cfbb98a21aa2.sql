
-- Fix outcome mapping in calls_to_funnel_events trigger to match actual outcome values
-- Actual values: not_reached, no_interest, interest, callback, appointment, deal
CREATE OR REPLACE FUNCTION public.calls_to_funnel_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Reached / had a real conversation
  IF NEW.outcome IN ('reached','interest','interested','no_interest','not_interested','callback','appointment','deal') THEN
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

  -- Appointment booked
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
$function$;

-- Backfill missing 'conversation' events for already-existing reached calls
INSERT INTO public.funnel_events (
  event_at, funnel_type, stage,
  lead_assignment_id, sales_executive_id,
  source_table, source_id,
  metadata_json
)
SELECT
  c.created_at, 'cold_call', 'conversation',
  c.lead_assignment_id, c.sales_executive_id,
  'calls', c.id,
  jsonb_build_object('outcome', c.outcome)
FROM public.calls c
WHERE c.outcome IN ('reached','interest','interested','no_interest','not_interested','callback','appointment','deal')
ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;
