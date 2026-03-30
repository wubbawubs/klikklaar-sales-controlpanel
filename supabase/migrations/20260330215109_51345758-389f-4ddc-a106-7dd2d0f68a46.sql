-- Fix: Scope coach access on eod_submission_data to their assigned SEs only
-- This addresses both the unscoped coach access and the fragile name matching concern

DROP POLICY IF EXISTS "Users can read relevant eod data" ON public.eod_submission_data;

CREATE POLICY "Users can read relevant eod data"
ON public.eod_submission_data
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND employee_name IN (
      SELECT full_name FROM public.sales_executives
      WHERE coach_user_id = auth.uid()
    )
  )
  OR (
    employee_name IN (
      SELECT full_name FROM public.sales_executives
      WHERE user_id = auth.uid()
    )
  )
);