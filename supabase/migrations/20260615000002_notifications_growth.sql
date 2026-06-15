-- In-app notifications + growth goals.

-- Notifications (one row per recipient). Inserts happen via the notify-user
-- edge function (service role), so no user INSERT policy is needed.
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON public.app_notifications(user_id, read, created_at DESC);
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own notifications" ON public.app_notifications;
CREATE POLICY "Users see own notifications" ON public.app_notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own notifications" ON public.app_notifications;
CREATE POLICY "Users update own notifications" ON public.app_notifications FOR UPDATE USING (user_id = auth.uid());

-- Growth goals per organization. Progress is computed from deals at read time.
CREATE TABLE IF NOT EXISTS public.growth_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('revenue', 'deals_won', 'leads_added')),
  target_value numeric NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.growth_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage goals" ON public.growth_goals;
CREATE POLICY "Org members manage goals" ON public.growth_goals FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));
