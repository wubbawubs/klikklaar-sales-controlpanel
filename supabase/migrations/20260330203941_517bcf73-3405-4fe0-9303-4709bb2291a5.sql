
-- 1. Fix: Remove coach/admin branches from SE lead assignments policy
DROP POLICY IF EXISTS "SEs can view own lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "SEs can view own lead assignments" ON public.pipedrive_lead_assignments
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 2. Fix: Remove broad coach access from SE calls policy, keep SE-only
DROP POLICY IF EXISTS "SEs can manage own calls" ON public.calls;
CREATE POLICY "SEs can manage own calls" ON public.calls
  FOR ALL TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );

-- 3. Fix: Remove JWT email fallback from SE own profile policy
DROP POLICY IF EXISTS "SEs can view own profile" ON public.sales_executives;
CREATE POLICY "SEs can view own profile" ON public.sales_executives
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. Fix: Restrict audit_logs INSERT to admin/service role only
DROP POLICY IF EXISTS "Auth users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));
