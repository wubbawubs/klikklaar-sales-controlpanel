CREATE POLICY "SEs can insert own lead assignments"
ON public.pipedrive_lead_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
  )
);