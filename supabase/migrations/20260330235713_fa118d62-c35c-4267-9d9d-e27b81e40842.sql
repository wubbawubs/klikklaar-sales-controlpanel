
-- 1. Fix submission_answers: scope coach access to their own SEs
DROP POLICY IF EXISTS "Users can read submission answers" ON public.submission_answers;

CREATE POLICY "Users can read submission answers"
ON public.submission_answers
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR submission_id IN (
    SELECT fs.id FROM public.form_submissions fs
    JOIN public.eod_submission_data esd ON esd.submission_id = fs.id
    JOIN public.sales_executives se ON se.id = esd.sales_executive_id
    WHERE se.coach_user_id = auth.uid() OR se.user_id = auth.uid()
  )
);

-- 2. Fix anon EOD insert: remove anon access entirely (public forms submit via form_submissions/submission_answers, not eod_submission_data)
DROP POLICY IF EXISTS "Anon can create eod data without se_id" ON public.eod_submission_data;
