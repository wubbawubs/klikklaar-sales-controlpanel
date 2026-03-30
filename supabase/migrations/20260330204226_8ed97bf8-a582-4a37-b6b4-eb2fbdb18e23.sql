
-- 1. Fix pipedrive_activities: remove broad coach/admin from SE policy + JWT email fallbacks
DROP POLICY IF EXISTS "SEs can view own activities" ON public.pipedrive_activities;
CREATE POLICY "SEs can view own activities" ON public.pipedrive_activities
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "SEs can update own activities" ON public.pipedrive_activities;
CREATE POLICY "SEs can update own activities" ON public.pipedrive_activities
  FOR UPDATE TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "SEs can insert own activities" ON public.pipedrive_activities;
CREATE POLICY "SEs can insert own activities" ON public.pipedrive_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 2. Scope admin manage SEs to authenticated only
DROP POLICY IF EXISTS "Admins can manage SEs" ON public.sales_executives;
CREATE POLICY "Admins can manage SEs" ON public.sales_executives
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

-- 3. Add SE INSERT policy for eod_submissions
CREATE POLICY "SEs can submit own EODs" ON public.eod_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 4. Dismiss: RLS is confirmed enabled on generated_artifacts, integration_configs, user_roles
-- These are all admin-only tables by design - RLS blocks non-admins correctly.
