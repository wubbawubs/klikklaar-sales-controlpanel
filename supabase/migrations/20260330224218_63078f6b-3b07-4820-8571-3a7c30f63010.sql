
-- Fix: Scope coach access on health_events to assigned SEs only
DROP POLICY IF EXISTS "Admins can manage health events" ON public.health_events;

CREATE POLICY "Admins can manage health events"
ON public.health_events
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM public.sales_executives WHERE coach_user_id = auth.uid()
    )
  )
);

-- Fix: Scope coach access on signals to assigned SEs only
DROP POLICY IF EXISTS "Admins can manage signals" ON public.signals;

CREATE POLICY "Admins can manage signals"
ON public.signals
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM public.sales_executives WHERE coach_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "SEs can view own signals" ON public.signals;

CREATE POLICY "SEs can view own signals"
ON public.signals
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
  )
);

-- Fix: Scope coach access on se_baselines to assigned SEs only
DROP POLICY IF EXISTS "Admins can manage baselines" ON public.se_baselines;

CREATE POLICY "Admins can manage baselines"
ON public.se_baselines
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM public.sales_executives WHERE coach_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "SEs can view own baselines" ON public.se_baselines;

CREATE POLICY "SEs can view own baselines"
ON public.se_baselines
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
  )
);
