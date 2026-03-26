CREATE POLICY "SEs can view own profile"
ON public.sales_executives
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "SEs can view own lead assignments"
ON public.pipedrive_lead_assignments
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach'::app_role)
);

CREATE POLICY "SEs can view own activities"
ON public.pipedrive_activities
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach'::app_role)
);

CREATE POLICY "SEs can view own eod submissions"
ON public.eod_submissions
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT id FROM public.sales_executives WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach'::app_role)
);