
-- Scope remaining {public} admin policies to {authenticated}
DROP POLICY IF EXISTS "Admins can manage workspaces" ON public.workspaces;
CREATE POLICY "Admins can manage workspaces" ON public.workspaces
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage activities" ON public.pipedrive_activities;
CREATE POLICY "Admins can manage activities" ON public.pipedrive_activities
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all calls" ON public.calls;
CREATE POLICY "Admins can manage all calls" ON public.calls
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "Admins can manage lead assignments" ON public.pipedrive_lead_assignments
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage generated artifacts" ON public.generated_artifacts;
CREATE POLICY "Admins can manage generated artifacts" ON public.generated_artifacts
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()));
