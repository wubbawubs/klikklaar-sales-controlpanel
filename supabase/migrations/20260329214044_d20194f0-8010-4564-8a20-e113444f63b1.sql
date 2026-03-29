-- Allow SEs to insert and update their own pipedrive activities
CREATE POLICY "SEs can insert own activities"
ON public.pipedrive_activities
FOR INSERT
TO authenticated
WITH CHECK (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "SEs can update own activities"
ON public.pipedrive_activities
FOR UPDATE
TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);
