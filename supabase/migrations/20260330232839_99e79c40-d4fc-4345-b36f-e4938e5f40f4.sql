
-- 1. Fix generated_artifacts: drop public-scoped duplicate, keep authenticated one
DROP POLICY IF EXISTS "Admins can manage artifacts" ON public.generated_artifacts;

-- 2. Fix eod_submission_data: replace name-matching SELECT with ID-based ownership
DROP POLICY IF EXISTS "Users can read relevant eod data" ON public.eod_submission_data;

CREATE POLICY "Users can read relevant eod data"
ON public.eod_submission_data
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND submission_id IN (
      SELECT fs.id FROM public.form_submissions fs
      JOIN public.eod_submissions es ON es.id::text = fs.id::text
      WHERE es.sales_executive_id IN (
        SELECT se.id FROM public.sales_executives se WHERE se.coach_user_id = auth.uid()
      )
    )
  )
  OR submission_id IN (
    SELECT fs.id FROM public.form_submissions fs
    JOIN public.eod_submissions es ON es.id::text = fs.id::text
    WHERE es.sales_executive_id IN (
      SELECT se.id FROM public.sales_executives se WHERE se.user_id = auth.uid()
    )
  )
);

-- 3. Fix provisioning_jobs: change from public to authenticated
DROP POLICY IF EXISTS "Admins can manage jobs" ON public.provisioning_jobs;

CREATE POLICY "Admins can manage jobs"
ON public.provisioning_jobs
FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

-- 4. Fix integration_configs: change from public to authenticated
DROP POLICY IF EXISTS "Admins can manage integrations" ON public.integration_configs;

CREATE POLICY "Admins can manage integrations"
ON public.integration_configs
FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

-- 5. Fix integration_events: change from public to authenticated
DROP POLICY IF EXISTS "Admins can manage events" ON public.integration_events;

CREATE POLICY "Admins can manage events"
ON public.integration_events
FOR ALL
TO authenticated
USING (is_admin(auth.uid()));
