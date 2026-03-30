
-- FIX 1: Scope coach access on sales_executives to only their assigned SEs
DROP POLICY IF EXISTS "Admins and coaches can view SEs" ON public.sales_executives;
CREATE POLICY "Admins and coaches can view SEs" ON public.sales_executives
  FOR SELECT TO public
  USING (
    is_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND (coach_user_id = auth.uid() OR coach_user_id IS NULL)
    )
  );

-- FIX 2: Scope coach access on pipedrive_lead_assignments to their assigned SEs
DROP POLICY IF EXISTS "Coaches can view lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "Coaches can view lead assignments" ON public.pipedrive_lead_assignments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives
      WHERE coach_user_id = auth.uid() OR coach_user_id IS NULL
    )
  );

-- FIX 3: Scope coach access on calls to their assigned SEs
DROP POLICY IF EXISTS "Admins can manage all calls" ON public.calls;
CREATE POLICY "Admins can manage all calls" ON public.calls
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Coaches can view assigned SE calls" ON public.calls
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives
      WHERE coach_user_id = auth.uid() OR coach_user_id IS NULL
    )
  );

-- FIX 4: Restrict audit log INSERT to enforce actor_user_id = auth.uid()
DROP POLICY IF EXISTS "Auth users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Auth users can insert audit logs" ON public.audit_logs
  FOR INSERT TO public
  WITH CHECK (auth.uid() IS NOT NULL AND actor_user_id = auth.uid());

-- FIX 5: Restrict health events INSERT to own SE record
DROP POLICY IF EXISTS "Auth users can insert health events" ON public.health_events;
CREATE POLICY "Auth users can insert health events" ON public.health_events
  FOR INSERT TO authenticated
  WITH CHECK (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE se.user_id = auth.uid() OR lower(se.email) = lower(COALESCE(auth.jwt()->>'email', ''))
    )
  );
