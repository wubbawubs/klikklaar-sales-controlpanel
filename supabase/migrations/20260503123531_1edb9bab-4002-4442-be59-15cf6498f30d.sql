-- Backfill funnel_events from existing calls
INSERT INTO public.funnel_events (event_at, funnel_type, stage, lead_assignment_id, sales_executive_id, source_table, source_id, metadata_json)
SELECT c.created_at, 'cold_call', 'dial', c.lead_assignment_id, c.sales_executive_id, 'calls', c.id, jsonb_build_object('outcome', c.outcome)
FROM public.calls c
ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO public.funnel_events (event_at, funnel_type, stage, lead_assignment_id, sales_executive_id, source_table, source_id, metadata_json)
SELECT c.created_at, 'cold_call', 'conversation', c.lead_assignment_id, c.sales_executive_id, 'calls', c.id, jsonb_build_object('outcome', c.outcome)
FROM public.calls c
WHERE c.outcome IN ('reached','interested','not_interested','callback','appointment')
ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO public.funnel_events (event_at, funnel_type, stage, lead_assignment_id, sales_executive_id, source_table, source_id, metadata_json)
SELECT c.created_at, 'cold_call', 'appointment_booked', c.lead_assignment_id, c.sales_executive_id, 'calls', c.id, jsonb_build_object('outcome', c.outcome)
FROM public.calls c
WHERE c.outcome = 'appointment'
ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;

-- Backfill from closer_appointments based on current status
INSERT INTO public.funnel_events (event_at, funnel_type, stage, closer_appointment_id, lead_assignment_id, closer_user_id, sales_executive_id, value_eur, source_table, source_id, metadata_json)
SELECT
  COALESCE(ca.scheduled_at, ca.created_at),
  CASE ca.status
    WHEN 'call' THEN 'one_call_close'
    WHEN 'follow_up' THEN 'follow_up_close'
    WHEN 'deal' THEN 'one_call_close'
    WHEN 'nog_betalen' THEN 'one_call_close'
    WHEN 'no_deal' THEN 'lost'
  END,
  CASE ca.status
    WHEN 'call' THEN 'sales_call_1'
    WHEN 'follow_up' THEN 'follow_up'
    WHEN 'deal' THEN 'deal_won'
    WHEN 'nog_betalen' THEN 'deal_won'
    WHEN 'no_deal' THEN 'deal_lost'
  END,
  ca.id, ca.lead_assignment_id, ca.closer_user_id, ca.caller_sales_executive_id, ca.deal_value_eur,
  'closer_appointments', ca.id, jsonb_build_object('status', ca.status)
FROM public.closer_appointments ca
WHERE ca.status IN ('call','follow_up','deal','nog_betalen','no_deal')
ON CONFLICT (source_table, source_id, stage) WHERE source_id IS NOT NULL DO NOTHING;