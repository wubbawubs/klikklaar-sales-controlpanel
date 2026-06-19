-- Multiple fee lines per deal: e.g. €10k Startfee (eenmalig) + €5k p/m (maandelijks).
-- Lets a deal hold several amounts of different types without touching settings.
CREATE TABLE IF NOT EXISTS public.deal_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'one_time' CHECK (kind IN ('one_time','recurring')),
  interval text CHECK (interval IN ('month','year')),
  label text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_fees_deal ON public.deal_fees(deal_id);

ALTER TABLE public.deal_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage deal fees" ON public.deal_fees;
CREATE POLICY "Org members manage deal fees" ON public.deal_fees FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

-- Backfill: turn each existing deal's single value into one fee line so nothing is lost.
INSERT INTO public.deal_fees (deal_id, org_id, amount, kind, interval, label, position)
SELECT d.id, d.org_id, COALESCE(d.value_eur, 0),
       COALESCE(bt.kind, 'one_time'), bt.interval, bt.name, 0
FROM public.deals d
LEFT JOIN public.billing_types bt ON bt.id = d.billing_type_id
WHERE d.value_eur IS NOT NULL AND d.value_eur <> 0
  AND NOT EXISTS (SELECT 1 FROM public.deal_fees f WHERE f.deal_id = d.id);
