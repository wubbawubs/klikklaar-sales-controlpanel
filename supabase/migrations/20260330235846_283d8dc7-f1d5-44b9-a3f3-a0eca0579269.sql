
-- Re-add anon INSERT for eod_submission_data, but strictly without sales_executive_id
CREATE POLICY "Anon can create eod data without se_id"
ON public.eod_submission_data
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms WHERE forms.id = form_id AND forms.status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.form_submissions 
    WHERE form_submissions.id = submission_id 
      AND form_submissions.created_at > (now() - interval '1 hour')
  )
  AND sales_executive_id IS NULL
);
