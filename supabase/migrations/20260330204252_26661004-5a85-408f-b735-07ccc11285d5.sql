
-- Remove JWT email fallbacks and broad coach/admin from all remaining policies

-- 1. eod_submission_data
DROP POLICY IF EXISTS "Users can read relevant eod data" ON public.eod_submission_data;
CREATE POLICY "Users can read relevant eod data" ON public.eod_submission_data
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'coach'::app_role)
    OR employee_name IN (
      SELECT full_name FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 2. health_events
DROP POLICY IF EXISTS "SEs can view own health events" ON public.health_events;
CREATE POLICY "SEs can view own health events" ON public.health_events
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Auth users can insert health events" ON public.health_events;
CREATE POLICY "Auth users can insert health events" ON public.health_events
  FOR INSERT TO authenticated
  WITH CHECK (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 3. learning_updates
DROP POLICY IF EXISTS "Users can view relevant learning updates" ON public.learning_updates;
CREATE POLICY "Users can view relevant learning updates" ON public.learning_updates
  FOR SELECT TO authenticated
  USING (
    scope = 'team'
    OR is_admin(auth.uid())
    OR has_role(auth.uid(), 'coach'::app_role)
    OR sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 4. se_baselines
DROP POLICY IF EXISTS "SEs can view own baselines" ON public.se_baselines;
CREATE POLICY "SEs can view own baselines" ON public.se_baselines
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'coach'::app_role)
    OR sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 5. signals
DROP POLICY IF EXISTS "SEs can view own signals" ON public.signals;
CREATE POLICY "SEs can view own signals" ON public.signals
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'coach'::app_role)
    OR sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "SEs can insert help request signals" ON public.signals;
CREATE POLICY "SEs can insert help request signals" ON public.signals
  FOR INSERT TO authenticated
  WITH CHECK (
    signal_type = 'help_request'
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );
