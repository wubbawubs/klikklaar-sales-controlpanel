
-- Auto-fill organization_id on inserts when missing
CREATE OR REPLACE FUNCTION public.fill_org_from_se()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.sales_executive_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sales_executives WHERE id = NEW.sales_executive_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fill_org_from_closer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF NEW.caller_sales_executive_id IS NOT NULL THEN
      SELECT organization_id INTO NEW.organization_id
      FROM public.sales_executives WHERE id = NEW.caller_sales_executive_id;
    END IF;
    IF NEW.organization_id IS NULL AND NEW.closer_user_id IS NOT NULL THEN
      SELECT organization_id INTO NEW.organization_id
      FROM public.user_organizations
      WHERE user_id = NEW.closer_user_id
      ORDER BY is_default DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_org_lead_assignments ON public.lead_assignments;
CREATE TRIGGER trg_fill_org_lead_assignments
  BEFORE INSERT OR UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fill_org_from_se();

DROP TRIGGER IF EXISTS trg_fill_org_calls ON public.calls;
CREATE TRIGGER trg_fill_org_calls
  BEFORE INSERT OR UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.fill_org_from_se();

DROP TRIGGER IF EXISTS trg_fill_org_closer ON public.closer_appointments;
CREATE TRIGGER trg_fill_org_closer
  BEFORE INSERT OR UPDATE ON public.closer_appointments
  FOR EACH ROW EXECUTE FUNCTION public.fill_org_from_closer();

-- Backfill calls from SE org
UPDATE public.calls c
SET organization_id = se.organization_id
FROM public.sales_executives se
WHERE c.sales_executive_id = se.id
  AND c.organization_id IS NULL
  AND se.organization_id IS NOT NULL;
