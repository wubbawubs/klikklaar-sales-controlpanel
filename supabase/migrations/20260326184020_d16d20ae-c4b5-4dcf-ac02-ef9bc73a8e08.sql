
-- Calls table: structured call logging for SE's
CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_executive_id UUID NOT NULL REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  lead_assignment_id UUID REFERENCES public.pipedrive_lead_assignments(id) ON DELETE SET NULL,
  contact_name TEXT,
  contact_phone TEXT,
  org_name TEXT,
  outcome TEXT NOT NULL DEFAULT 'not_reached',
  callback_date DATE,
  callback_time TIME,
  notes TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signals table: CI engine generated signals
CREATE TABLE public.signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_executive_id UUID NOT NULL REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL, -- motivation, performance, behavior, risk
  severity TEXT NOT NULL DEFAULT 'info', -- info, warning, critical
  title TEXT NOT NULL,
  description TEXT,
  action TEXT,
  confidence TEXT DEFAULT 'medium', -- low, medium, high
  escalation_level INTEGER DEFAULT 1, -- 1=self-correction, 2=admin insight, 3=coaching trigger, 4=intervention
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  data_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learning updates table: transparent learning feed
CREATE TABLE public.learning_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_executive_id UUID REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'personal', -- personal, team
  title TEXT NOT NULL,
  what_changed TEXT NOT NULL,
  why TEXT NOT NULL,
  impact TEXT NOT NULL,
  data_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team insights table: aggregated team patterns
CREATE TABLE public.team_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_type TEXT NOT NULL, -- pattern, best_practice, trend
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  segment TEXT, -- top_behavior, average, improvement
  data_json JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SE performance baselines
CREATE TABLE public.se_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_executive_id UUID NOT NULL REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  baseline_value NUMERIC NOT NULL DEFAULT 0,
  minimum_threshold NUMERIC,
  team_benchmark NUMERIC,
  period_start DATE,
  period_end DATE,
  data_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sales_executive_id, metric_name)
);

-- Enable RLS on all new tables
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.se_baselines ENABLE ROW LEVEL SECURITY;

-- CALLS: SE's can manage own calls
CREATE POLICY "SEs can manage own calls" ON public.calls FOR ALL TO authenticated
  USING (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "Admins can manage all calls" ON public.calls FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'));

-- SIGNALS: SE's can read own signals
CREATE POLICY "SEs can view own signals" ON public.signals FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
    OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Admins can manage signals" ON public.signals FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'));

-- LEARNING_UPDATES: SE's can view own + team scope
CREATE POLICY "Users can view relevant learning updates" ON public.learning_updates FOR SELECT TO authenticated
  USING (
    scope = 'team'
    OR sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
    OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Admins can manage learning updates" ON public.learning_updates FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'));

-- TEAM_INSIGHTS: All authenticated can read
CREATE POLICY "Authenticated can view team insights" ON public.team_insights FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage team insights" ON public.team_insights FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'));

-- SE_BASELINES: SE's can view own
CREATE POLICY "SEs can view own baselines" ON public.se_baselines FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
    OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Admins can manage baselines" ON public.se_baselines FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'));

-- Updated_at triggers
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_team_insights_updated_at BEFORE UPDATE ON public.team_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_se_baselines_updated_at BEFORE UPDATE ON public.se_baselines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
