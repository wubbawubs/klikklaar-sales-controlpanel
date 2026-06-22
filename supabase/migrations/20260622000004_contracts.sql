-- Contracten: client agreements / retainers (internal finance, own Supabase).
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'recurring' CHECK (kind IN ('one_time','recurring')),
  interval text CHECK (interval IN ('month','year')),
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','draft')),
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.contracts(org_id);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage contracts" ON public.contracts;
CREATE POLICY "Org members manage contracts" ON public.contracts FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));
