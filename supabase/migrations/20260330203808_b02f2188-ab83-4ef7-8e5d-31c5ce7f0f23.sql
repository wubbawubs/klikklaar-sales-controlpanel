
-- 1. sales_executives: tighten coach access (remove IS NULL)
DROP POLICY IF EXISTS "Admins and coaches can view SEs" ON public.sales_executives;
CREATE POLICY "Admins and coaches can view SEs" ON public.sales_executives
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND coach_user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- 2. pipedrive_lead_assignments: tighten coach access
DROP POLICY IF EXISTS "Coaches can view lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "Coaches can view lead assignments" ON public.pipedrive_lead_assignments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- 3. calls: tighten coach access
DROP POLICY IF EXISTS "Coaches can view assigned SE calls" ON public.calls;
CREATE POLICY "Coaches can view assigned SE calls" ON public.calls
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- 4. pipedrive_activities: scope coach policy to assigned SEs
DROP POLICY IF EXISTS "Coaches can view activities" ON public.pipedrive_activities;
DROP POLICY IF EXISTS "Coaches can view assigned SE activities" ON public.pipedrive_activities;
CREATE POLICY "Coaches can view assigned SE activities" ON public.pipedrive_activities
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- 5. training-documents storage: explicit UPDATE/DELETE policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update training documents' AND tablename = 'objects') THEN
    CREATE POLICY "Admins can update training documents"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'training-documents' AND is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete training documents' AND tablename = 'objects') THEN
    CREATE POLICY "Admins can delete training documents"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'training-documents' AND is_admin(auth.uid()));
  END IF;
END $$;
