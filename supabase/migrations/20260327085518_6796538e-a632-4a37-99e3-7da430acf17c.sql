
-- Add user_id column to sales_executives for direct auth linking
ALTER TABLE public.sales_executives ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Link Robin's SE profile to both auth accounts
UPDATE public.sales_executives 
SET user_id = '913e9b1e-0d98-477b-a2b2-0747737a3186'
WHERE email = 'robin.dennie@gmail.com';

-- Update RLS: SEs can view own profile by user_id OR email
DROP POLICY IF EXISTS "SEs can view own profile" ON public.sales_executives;
CREATE POLICY "SEs can view own profile" ON public.sales_executives
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() 
  OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);

-- Update calls RLS to also match on user_id
DROP POLICY IF EXISTS "SEs can manage own calls" ON public.calls;
CREATE POLICY "SEs can manage own calls" ON public.calls
FOR ALL TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

-- Update signals RLS
DROP POLICY IF EXISTS "SEs can view own signals" ON public.signals;
CREATE POLICY "SEs can view own signals" ON public.signals
FOR SELECT TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);

-- Update lead assignments RLS
DROP POLICY IF EXISTS "SEs can view own lead assignments" ON public.pipedrive_lead_assignments;
CREATE POLICY "SEs can view own lead assignments" ON public.pipedrive_lead_assignments
FOR SELECT TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);

-- Update activities RLS
DROP POLICY IF EXISTS "SEs can view own activities" ON public.pipedrive_activities;
CREATE POLICY "SEs can view own activities" ON public.pipedrive_activities
FOR SELECT TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);

-- Update EOD submissions RLS
DROP POLICY IF EXISTS "SEs can view own eod submissions" ON public.eod_submissions;
CREATE POLICY "SEs can view own eod submissions" ON public.eod_submissions
FOR SELECT TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);

-- Update baselines RLS
DROP POLICY IF EXISTS "SEs can view own baselines" ON public.se_baselines;
CREATE POLICY "SEs can view own baselines" ON public.se_baselines
FOR SELECT TO authenticated
USING (
  sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);

-- Update learning_updates RLS
DROP POLICY IF EXISTS "Users can view relevant learning updates" ON public.learning_updates;
CREATE POLICY "Users can view relevant learning updates" ON public.learning_updates
FOR SELECT TO authenticated
USING (
  scope = 'team'
  OR sales_executive_id IN (
    SELECT se.id FROM sales_executives se
    WHERE se.user_id = auth.uid()
    OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  OR is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role)
);
