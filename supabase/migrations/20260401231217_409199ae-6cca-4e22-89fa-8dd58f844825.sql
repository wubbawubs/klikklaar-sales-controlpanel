
-- 1. health_events: Fix coach scope in "Admins can manage health events"
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
      SELECT id FROM public.sales_executives
      WHERE coach_user_id = auth.uid()
    )
  )
);

-- 2. signals: Fix coach scope in "Admins can manage signals"
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
      SELECT id FROM public.sales_executives
      WHERE coach_user_id = auth.uid()
    )
  )
);

-- 3. se_baselines: Fix coach scope in "Admins can manage baselines"
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
      SELECT id FROM public.sales_executives
      WHERE coach_user_id = auth.uid()
    )
  )
);

-- 4. eod_submission_data: Fix coach scope in "Users can read relevant eod data"
DROP POLICY IF EXISTS "Users can read relevant eod data" ON public.eod_submission_data;

CREATE POLICY "Users can read relevant eod data"
ON public.eod_submission_data
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM public.sales_executives
      WHERE coach_user_id = auth.uid()
    )
  )
  OR sales_executive_id IN (
    SELECT id FROM public.sales_executives
    WHERE user_id = auth.uid()
  )
);
