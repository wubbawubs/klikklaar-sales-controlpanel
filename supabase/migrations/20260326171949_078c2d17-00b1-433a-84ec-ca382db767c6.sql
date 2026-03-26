DROP POLICY IF EXISTS "SEs can view own profile" ON public.sales_executives;
CREATE POLICY "SEs can view own profile"
ON public.sales_executives
FOR SELECT
TO authenticated
USING (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

DROP POLICY IF EXISTS "SEs can view own lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "SEs can view own lead assignments"
ON public.pipedrive_lead_assignments
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id
    FROM public.sales_executives se
    WHERE lower(se.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach')
);

DROP POLICY IF EXISTS "SEs can view own activities" ON public.pipedrive_activities;
CREATE POLICY "SEs can view own activities"
ON public.pipedrive_activities
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id
    FROM public.sales_executives se
    WHERE lower(se.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach')
);

DROP POLICY IF EXISTS "SEs can view own eod submissions" ON public.eod_submissions;
CREATE POLICY "SEs can view own eod submissions"
ON public.eod_submissions
FOR SELECT
TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id
    FROM public.sales_executives se
    WHERE lower(se.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'coach')
);