
CREATE TABLE public.funnel_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_type text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  target_pct numeric NOT NULL,
  scope text NOT NULL DEFAULT 'team',
  scope_user_id uuid NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funnel_targets_funnel_type_check CHECK (funnel_type IN ('cold_call','follow_up_close','one_call_close','lost','mail_close','reengage_close')),
  CONSTRAINT funnel_targets_scope_check CHECK (scope IN ('team','se','closer')),
  CONSTRAINT funnel_targets_pct_range CHECK (target_pct >= 0 AND target_pct <= 100),
  CONSTRAINT funnel_targets_scope_user_consistency CHECK (
    (scope = 'team' AND scope_user_id IS NULL) OR
    (scope IN ('se','closer') AND scope_user_id IS NOT NULL)
  )
);

-- Prevent duplicate targets for the same combination
CREATE UNIQUE INDEX funnel_targets_unique_idx
  ON public.funnel_targets (funnel_type, from_stage, to_stage, scope, COALESCE(scope_user_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);

CREATE INDEX funnel_targets_lookup_idx
  ON public.funnel_targets (funnel_type, from_stage, to_stage, scope);

ALTER TABLE public.funnel_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage funnel targets"
  ON public.funnel_targets
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view funnel targets"
  ON public.funnel_targets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- updated_at trigger
CREATE TRIGGER trg_funnel_targets_updated_at
BEFORE UPDATE ON public.funnel_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults from MIRO
INSERT INTO public.funnel_targets (funnel_type, from_stage, to_stage, target_pct, scope) VALUES
  ('cold_call', 'dial', 'conversation', 35, 'team'),
  ('cold_call', 'conversation', 'appointment_booked', 25, 'team'),
  ('cold_call', 'appointment_booked', 'show_up', 90, 'team'),
  ('follow_up_close', 'sales_call_1', 'follow_up', 80, 'team'),
  ('follow_up_close', 'follow_up', 'deal_won', 75, 'team'),
  ('one_call_close', 'sales_call_1', 'deal_won', 75, 'team'),
  ('mail_close', 'sales_call_1', 'deal_won', 75, 'team'),
  ('reengage_close', 'sales_call_1', 'deal_won', 75, 'team');
