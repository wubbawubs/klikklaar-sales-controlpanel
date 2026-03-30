
-- 1. Fix eod_submission_data INSERT: restrict to authenticated and validate sales_executive_id ownership
DROP POLICY IF EXISTS "Anyone can create eod data" ON public.eod_submission_data;

CREATE POLICY "Authenticated users can create own eod data"
ON public.eod_submission_data
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms WHERE forms.id = form_id AND forms.status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.form_submissions WHERE form_submissions.id = submission_id
  )
  AND (
    sales_executive_id IS NULL
    OR sales_executive_id IN (
      SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
    )
  )
);

-- Also allow anon submissions but WITHOUT sales_executive_id (public forms)
CREATE POLICY "Anon can create eod data without se_id"
ON public.eod_submission_data
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms WHERE forms.id = form_id AND forms.status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.form_submissions WHERE form_submissions.id = submission_id
  )
  AND sales_executive_id IS NULL
);

-- 2. Fix submission_answers SELECT: scope to own submissions or admin/coach
DROP POLICY IF EXISTS "Admins can read all answers" ON public.submission_answers;

CREATE POLICY "Users can read submission answers"
ON public.submission_answers
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach'::app_role)
  OR submission_id IN (
    SELECT fs.id FROM public.form_submissions fs
    JOIN public.eod_submission_data esd ON esd.submission_id = fs.id
    JOIN public.sales_executives se ON se.id = esd.sales_executive_id
    WHERE se.user_id = auth.uid()
  )
);
