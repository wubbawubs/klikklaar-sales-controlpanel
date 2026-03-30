
-- 1. Fix eod_submissions: scope coach access to assigned SEs
DROP POLICY IF EXISTS "Admins and coaches can manage EODs" ON public.eod_submissions;
CREATE POLICY "Admins can manage EODs" ON public.eod_submissions
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Coaches can view assigned SE EODs" ON public.eod_submissions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- 2. Fix SE EOD policy: remove broad coach/admin branch (already covered above)
DROP POLICY IF EXISTS "SEs can view own eod submissions" ON public.eod_submissions;
CREATE POLICY "SEs can view own eod submissions" ON public.eod_submissions
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 3. Scope user_roles policy to authenticated only
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));
