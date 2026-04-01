CREATE POLICY "SEs can update own lead assignments"
ON public.pipedrive_lead_assignments
FOR UPDATE
TO authenticated
USING (sales_executive_id IN (
  SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
))
WITH CHECK (sales_executive_id IN (
  SELECT id FROM public.sales_executives WHERE user_id = auth.uid()
));