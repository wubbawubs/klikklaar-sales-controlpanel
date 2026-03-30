-- Drop partial unique index and create a proper unique constraint for upsert support
DROP INDEX IF EXISTS idx_pa_se_activity;
CREATE UNIQUE INDEX idx_pa_se_activity ON public.pipedrive_activities (sales_executive_id, pipedrive_activity_id);

-- Also fix same issue on pipedrive_lead_assignments
DROP INDEX IF EXISTS idx_pla_se_deal;
CREATE UNIQUE INDEX idx_pla_se_deal ON public.pipedrive_lead_assignments (sales_executive_id, pipedrive_deal_id);