-- Configurable fee / payment types per label (organization).
-- e.g. LeadLayer: "Maandelijks"; OTR: "Plaatsingsfee" (one-time) or "Maandelijks".
CREATE TABLE IF NOT EXISTS public.billing_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('one_time', 'recurring')),
  interval text CHECK (interval IN ('month', 'year')),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.billing_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage billing types" ON public.billing_types;
CREATE POLICY "Org members manage billing types" ON public.billing_types FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

-- A deal is billed under one fee type. value_eur is the amount (per interval for recurring).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS billing_type_id uuid REFERENCES public.billing_types(id) ON DELETE SET NULL;

-- Seed sensible defaults for every existing org that has none yet.
INSERT INTO public.billing_types (org_id, name, kind, interval, position)
SELECT o.id, x.name, x.kind, x.interval, x.position
FROM public.organizations o
CROSS JOIN (VALUES
  ('Eenmalig',      'one_time',  CAST(NULL AS text), 1),
  ('Maandelijks',   'recurring', 'month',            2),
  ('Startfee',      'one_time',  CAST(NULL AS text), 3),
  ('Plaatsingsfee', 'one_time',  CAST(NULL AS text), 4)
) AS x(name, kind, interval, position)
WHERE NOT EXISTS (SELECT 1 FROM public.billing_types bt WHERE bt.org_id = o.id);
