CREATE POLICY "SEs can insert help request signals"
ON public.signals
FOR INSERT
TO authenticated
WITH CHECK (
  signal_type = 'help_request'
  AND sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);