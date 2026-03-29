CREATE POLICY "Authenticated users can read eod data"
ON public.eod_submission_data
FOR SELECT
TO authenticated
USING (true);