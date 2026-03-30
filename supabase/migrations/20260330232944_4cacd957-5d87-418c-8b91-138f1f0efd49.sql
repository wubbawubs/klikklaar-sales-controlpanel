
-- 1. Add sales_executive_id to eod_submission_data for proper ID-based ownership
ALTER TABLE public.eod_submission_data 
ADD COLUMN IF NOT EXISTS sales_executive_id uuid REFERENCES public.sales_executives(id) ON DELETE SET NULL;

-- Backfill from employee_name where possible
UPDATE public.eod_submission_data esd
SET sales_executive_id = se.id
FROM public.sales_executives se
WHERE esd.employee_name = se.full_name AND esd.sales_executive_id IS NULL;

-- 2. Fix eod_submission_data SELECT policy with proper ID-based ownership
DROP POLICY IF EXISTS "Users can read relevant eod data" ON public.eod_submission_data;

CREATE POLICY "Users can read relevant eod data"
ON public.eod_submission_data
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM public.sales_executives WHERE coach_user_id = auth.uid()
    )
  )
  OR sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
  )
);

-- 3. Harden submission_answers INSERT: require submission was created recently (within 1 hour)
-- This prevents injecting answers into old/arbitrary submissions
DROP POLICY IF EXISTS "Anyone can create answers" ON public.submission_answers;

CREATE POLICY "Anyone can create answers"
ON public.submission_answers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.form_submissions fs
    WHERE fs.id = submission_id
      AND fs.created_at > (now() - interval '1 hour')
  )
  AND EXISTS (
    SELECT 1 FROM public.form_questions WHERE id = question_id
  )
);
