-- Liquiditeit: balance snapshots per account per date (internal finance, own Supabase).
CREATE TABLE IF NOT EXISTS public.cash_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account text NOT NULL,
  as_of date NOT NULL DEFAULT current_date,
  balance numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, account, as_of)
);
CREATE INDEX IF NOT EXISTS idx_cash_positions_org ON public.cash_positions(org_id);
ALTER TABLE public.cash_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage cash" ON public.cash_positions;
CREATE POLICY "Org members manage cash" ON public.cash_positions FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));
