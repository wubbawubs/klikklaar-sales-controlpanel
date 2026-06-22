-- Omzet/Resultaat per label per periode (internal finance module, own Supabase).
CREATE TABLE IF NOT EXISTS public.company_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period text NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  costs numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, period)
);
CREATE INDEX IF NOT EXISTS idx_company_financials_org ON public.company_financials(org_id);
ALTER TABLE public.company_financials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage financials" ON public.company_financials;
CREATE POLICY "Org members manage financials" ON public.company_financials FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));
