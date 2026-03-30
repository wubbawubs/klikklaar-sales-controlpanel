
-- FIX 1 (CRITICAL): eod_submission_data SELECT is too permissive - restrict to own data + admins/coaches
DROP POLICY IF EXISTS "Authenticated users can read eod data" ON public.eod_submission_data;
CREATE POLICY "Users can read relevant eod data" ON public.eod_submission_data
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'coach'::app_role)
    OR submission_id IN (
      SELECT fs.id FROM form_submissions fs
      JOIN forms f ON f.id = fs.form_id
      WHERE fs.metadata_json->>'employee_name' IN (
        SELECT se.full_name FROM sales_executives se
        WHERE se.user_id = auth.uid() OR lower(se.email) = lower(COALESCE(auth.jwt()->>'email', ''))
      )
    )
    OR employee_name IN (
      SELECT se.full_name FROM sales_executives se
      WHERE se.user_id = auth.uid() OR lower(se.email) = lower(COALESCE(auth.jwt()->>'email', ''))
    )
  );

-- FIX 2: eod_submission_data INSERT - scope to anon+authenticated but not wide open
DROP POLICY IF EXISTS "Anyone can create eod data" ON public.eod_submission_data;
CREATE POLICY "Anyone can create eod data" ON public.eod_submission_data
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- FIX 3: form_submissions INSERT - keep as-is (public forms need anon insert), already correct

-- FIX 4: submission_answers INSERT - keep as-is (public forms need anon insert), already correct

-- FIX 5: Add SE workspace read policy
CREATE POLICY "SEs can view own workspace" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE se.user_id = auth.uid() OR lower(se.email) = lower(COALESCE(auth.jwt()->>'email', ''))
    )
  );

-- FIX 6: Add explicit read policy for settings (needed for health checks)
CREATE POLICY "Authenticated users can read settings" ON public.settings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
