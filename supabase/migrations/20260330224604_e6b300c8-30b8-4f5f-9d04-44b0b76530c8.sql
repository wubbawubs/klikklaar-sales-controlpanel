
-- Harden INSERT policies: require valid foreign key references instead of WITH CHECK (true)

-- 1. form_submissions: only allow inserts referencing an active form
DROP POLICY IF EXISTS "Anyone can create submissions" ON public.form_submissions;

CREATE POLICY "Anyone can create submissions"
ON public.form_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_id AND forms.status = 'active'
  )
);

-- 2. submission_answers: require valid submission_id and question_id
DROP POLICY IF EXISTS "Anyone can create answers" ON public.submission_answers;

CREATE POLICY "Anyone can create answers"
ON public.submission_answers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.form_submissions WHERE id = submission_id
  )
  AND EXISTS (
    SELECT 1 FROM public.form_questions WHERE id = question_id
  )
);

-- 3. eod_submission_data: require valid form_id and submission_id
DROP POLICY IF EXISTS "Anyone can create eod data" ON public.eod_submission_data;

CREATE POLICY "Anyone can create eod data"
ON public.eod_submission_data
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms WHERE id = form_id AND status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.form_submissions WHERE id = submission_id
  )
);
