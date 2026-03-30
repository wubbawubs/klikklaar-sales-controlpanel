
-- 1. Scope coach workspace access to assigned SEs only
DROP POLICY IF EXISTS "Coaches can view workspaces" ON public.workspaces;
CREATE POLICY "Coaches can view workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND sales_executive_id IN (
      SELECT id FROM sales_executives WHERE coach_user_id = auth.uid()
    )
  );

-- 2. Remove JWT email fallback from SE workspace policy
DROP POLICY IF EXISTS "SEs can view own workspace" ON public.workspaces;
CREATE POLICY "SEs can view own workspace" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    sales_executive_id IN (
      SELECT id FROM sales_executives WHERE user_id = auth.uid()
    )
  );
